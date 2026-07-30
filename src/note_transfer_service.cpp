#include "note_transfer_service.h"

#include "document_file.h"

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QMimeDatabase>
#include <QSaveFile>
#include <QTemporaryFile>
#include <QTextDocument>
#include <QXmlStreamReader>

#include <utility>

namespace qt_editor {
namespace {

constexpr qint64 kMaximumEnexBytes = 64 * 1024 * 1024;
constexpr qint64 kMaximumEnexResourceBytes = 32 * 1024 * 1024;

QString yamlQuote(QString value) {
  value.replace(QLatin1Char('\''), QStringLiteral("''"));
  return QLatin1Char('\'') + value + QLatin1Char('\'');
}

QString encodedList(const QStringList &values) {
  QStringList encoded;
  for (const QString &value : values)
    encoded.append(yamlQuote(value));
  return QLatin1Char('[') + encoded.join(QStringLiteral(", ")) +
         QLatin1Char(']');
}

QString importTag(const QString &source) {
  return QStringLiteral("Import-") +
         QString::fromLatin1(
             QCryptographicHash::hash(source.toUtf8(), QCryptographicHash::Sha1)
                 .toHex()
                 .first(4));
}

QString htmlToMarkdown(const QString &html) {
  QTextDocument document;
  document.setHtml(html);
  return document.toMarkdown(QTextDocument::MarkdownDialectGitHub).trimmed() +
         QLatin1Char('\n');
}

struct EnexResource final {
  QString name;
  QString mime;
  QString temporaryPath;
  QString error;
};

int base64Value(char character) {
  if (character >= 'A' && character <= 'Z')
    return character - 'A';
  if (character >= 'a' && character <= 'z')
    return character - 'a' + 26;
  if (character >= '0' && character <= '9')
    return character - '0' + 52;
  if (character == '+')
    return 62;
  if (character == '/')
    return 63;
  return -1;
}

class Base64ResourceWriter final {
public:
  explicit Base64ResourceWriter(QIODevice *destination)
      : destination_(destination) {}

  bool append(QStringView characters) {
    for (const QChar character : characters) {
      if (character.isSpace())
        continue;
      if (finished_) {
        error_ = QStringLiteral("Unexpected data after Base64 padding.");
        return false;
      }
      quartet_.append(character.toLatin1());
      if (quartet_.size() == 4 && !flushQuartet())
        return false;
    }
    return true;
  }

  bool finish() {
    if (!error_.isEmpty())
      return false;
    if (!quartet_.isEmpty()) {
      error_ = QStringLiteral("Truncated Base64 resource data.");
      return false;
    }
    return true;
  }

  [[nodiscard]] QString error() const { return error_; }

private:
  bool flushQuartet() {
    const int first = base64Value(quartet_[0]);
    const int second = base64Value(quartet_[1]);
    const bool thirdPadding = quartet_[2] == '=';
    const bool fourthPadding = quartet_[3] == '=';
    const int third = thirdPadding ? 0 : base64Value(quartet_[2]);
    const int fourth = fourthPadding ? 0 : base64Value(quartet_[3]);
    if (first < 0 || second < 0 || third < 0 || fourth < 0 ||
        (thirdPadding && !fourthPadding)) {
      error_ = QStringLiteral("Invalid Base64 resource data.");
      return false;
    }
    QByteArray decoded;
    decoded.reserve(3);
    decoded.append(static_cast<char>((first << 2) | (second >> 4)));
    if (!thirdPadding)
      decoded.append(static_cast<char>(((second & 0x0f) << 4) | (third >> 2)));
    if (!fourthPadding)
      decoded.append(static_cast<char>(((third & 0x03) << 6) | fourth));
    if (bytesWritten_ + decoded.size() > kMaximumEnexResourceBytes) {
      error_ = QStringLiteral("Resource exceeds the 32 MiB import limit.");
      return false;
    }
    if (destination_->write(decoded) != decoded.size()) {
      error_ = destination_->errorString();
      return false;
    }
    bytesWritten_ += decoded.size();
    finished_ = thirdPadding || fourthPadding;
    quartet_.clear();
    return true;
  }

  QIODevice *destination_;
  QByteArray quartet_;
  qint64 bytesWritten_ = 0;
  bool finished_ = false;
  QString error_;
};

bool readResourceData(QXmlStreamReader &xml, QIODevice *destination,
                      QString *error) {
  Base64ResourceWriter writer(destination);
  while (!xml.atEnd()) {
    xml.readNext();
    if (xml.isCharacters() && !writer.append(xml.text())) {
      *error = writer.error();
      while (!xml.atEnd()) {
        xml.readNext();
        if (xml.isEndElement() && xml.name() == QStringLiteral("data"))
          break;
      }
      return false;
    }
    if (xml.isEndElement() && xml.name() == QStringLiteral("data"))
      return writer.finish() ? true : (*error = writer.error(), false);
    if (xml.isStartElement()) {
      *error = QStringLiteral("Unexpected element inside resource data.");
      xml.skipCurrentElement();
      return false;
    }
  }
  *error = QStringLiteral("Unexpected end of Base64 resource data.");
  return false;
}

EnexResource readResource(QXmlStreamReader &xml,
                          const QString &attachmentsPath) {
  EnexResource resource;
  QTemporaryFile temporary(
      QDir(attachmentsPath).filePath(QStringLiteral(".enex-resource-XXXXXX")));
  temporary.setAutoRemove(false);
  if (!temporary.open()) {
    resource.error = temporary.errorString();
    xml.skipCurrentElement();
    return resource;
  }
  resource.temporaryPath = temporary.fileName();
  while (xml.readNextStartElement()) {
    if (xml.name() == QStringLiteral("data")) {
      if (!readResourceData(xml, &temporary, &resource.error))
        break;
    } else if (xml.name() == QStringLiteral("mime")) {
      resource.mime = xml.readElementText().trimmed();
    } else if (xml.name() == QStringLiteral("resource-attributes")) {
      while (xml.readNextStartElement()) {
        if (xml.name() == QStringLiteral("file-name"))
          resource.name = xml.readElementText().trimmed();
        else
          xml.skipCurrentElement();
      }
    } else {
      xml.skipCurrentElement();
    }
  }
  temporary.close();
  if (!resource.error.isEmpty()) {
    QFile::remove(resource.temporaryPath);
    resource.temporaryPath.clear();
  }
  return resource;
}

bool writeBytes(const QString &path, const QByteArray &content,
                QString *error) {
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(content) != content.size() || !file.commit()) {
    if (error != nullptr)
      *error = file.errorString();
    return false;
  }
  return true;
}

void importEnex(const QString &sourcePath, const QString &workspaceRoot,
                ImportResult &result) {
  QFile source(sourcePath);
  if (!source.open(QIODevice::ReadOnly)) {
    result.errors.append(
        QStringLiteral("%1: %2").arg(sourcePath, source.errorString()));
    return;
  }
  if (source.size() > kMaximumEnexBytes) {
    result.errors.append(
        QStringLiteral("%1: ENEX input exceeds the %2 MiB import limit.")
            .arg(sourcePath)
            .arg(kMaximumEnexBytes / (1024 * 1024)));
    return;
  }
  const QString notesPath =
      QDir(workspaceRoot).filePath(QStringLiteral("notes"));
  const QString attachmentsPath =
      QDir(workspaceRoot).filePath(QStringLiteral("attachments"));
  QDir().mkpath(notesPath);
  QDir().mkpath(attachmentsPath);
  QXmlStreamReader xml(&source);
  QMimeDatabase mimeDatabase;
  while (!xml.atEnd()) {
    xml.readNext();
    if (!xml.isStartElement() || xml.name() != QStringLiteral("note"))
      continue;
    QString title = QStringLiteral("Imported Note");
    QString html;
    QString created;
    QString modified;
    QStringList tags;
    QVector<EnexResource> resources;
    while (xml.readNextStartElement()) {
      if (xml.name() == QStringLiteral("title"))
        title = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("content"))
        html = xml.readElementText(QXmlStreamReader::IncludeChildElements);
      else if (xml.name() == QStringLiteral("created"))
        created = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("updated"))
        modified = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("tag"))
        tags.append(xml.readElementText().trimmed());
      else if (xml.name() == QStringLiteral("resource")) {
        EnexResource resource = readResource(xml, attachmentsPath);
        if (!resource.error.isEmpty()) {
          result.errors.append(
              QStringLiteral("%1: %2").arg(sourcePath, resource.error));
          continue;
        }
        resources.append(std::move(resource));
      } else
        xml.skipCurrentElement();
    }
    if (xml.hasError()) {
      for (const EnexResource &resource : std::as_const(resources))
        QFile::remove(resource.temporaryPath);
      break;
    }
    tags.append(importTag(sourcePath));
    QStringList attachmentNames;
    for (int index = 0; index < resources.size(); ++index) {
      const EnexResource &resource = resources[index];
      QString name = QFileInfo(resource.name).fileName();
      if (name.isEmpty()) {
        const QString suffix =
            mimeDatabase.mimeTypeForName(resource.mime).preferredSuffix();
        name =
            QStringLiteral("resource-%1%2")
                .arg(index + 1)
                .arg(suffix.isEmpty() ? QString() : QLatin1Char('.') + suffix);
      }
      const QString destination =
          NoteTransferService::uniquePath(attachmentsPath, name);
      if (!QFile::rename(resource.temporaryPath, destination)) {
        result.errors.append(
            QStringLiteral("%1: Unable to store imported resource.")
                .arg(destination));
        QFile::remove(resource.temporaryPath);
        continue;
      }
      attachmentNames.append(QFileInfo(destination).fileName());
      ++result.attachmentsImported;
    }
    const QString notePath = NoteTransferService::uniquePath(
        notesPath, QFileInfo(title).fileName() + QStringLiteral(".md"));
    QString metadata =
        QStringLiteral("---\ntitle: %1\ntags: %2\nattachments: %3\n")
            .arg(yamlQuote(title), encodedList(tags),
                 encodedList(attachmentNames));
    if (!created.isEmpty())
      metadata += QStringLiteral("created: %1\n").arg(yamlQuote(created));
    if (!modified.isEmpty())
      metadata += QStringLiteral("modified: %1\n").arg(yamlQuote(modified));
    metadata += QStringLiteral("---\n\n");
    QString error;
    if (writeBytes(notePath, (metadata + htmlToMarkdown(html)).toUtf8(),
                   &error)) {
      ++result.notesImported;
    } else {
      result.errors.append(QStringLiteral("%1: %2").arg(notePath, error));
    }
  }
  if (xml.hasError())
    result.errors.append(
        QStringLiteral("%1: %2").arg(sourcePath, xml.errorString()));
}

void importMarkdown(const QString &sourcePath, const QString &workspaceRoot,
                    ImportResult &result) {
  const auto source = DocumentFile::load(sourcePath);
  if (!source.has_value()) {
    result.errors.append(QStringLiteral("Unable to read %1").arg(sourcePath));
    return;
  }
  const QString notesPath =
      QDir(workspaceRoot).filePath(QStringLiteral("notes"));
  QDir().mkpath(notesPath);
  const QString destination = NoteTransferService::uniquePath(
      notesPath, QFileInfo(sourcePath).fileName());
  QString error;
  if (!source->writeCopy(destination, QFileInfo(destination).completeBaseName(),
                         source->body(), &error)) {
    result.errors.append(QStringLiteral("%1: %2").arg(destination, error));
    return;
  }
  auto imported = DocumentFile::load(destination, &error);
  if (!imported.has_value()) {
    result.errors.append(QStringLiteral("%1: %2").arg(destination, error));
    return;
  }
  QStringList tags = imported->tags();
  tags.append(importTag(sourcePath));
  if (!imported->setTags(tags, &error)) {
    result.errors.append(QStringLiteral("%1: %2").arg(destination, error));
    return;
  }
  ++result.notesImported;
}

} // namespace

ImportResult NoteTransferService::importFiles(const QStringList &sourcePaths,
                                              const QString &workspaceRoot) {
  ImportResult result;
  for (const QString &sourcePath : sourcePaths) {
    if (QFileInfo(sourcePath)
            .suffix()
            .compare(QStringLiteral("enex"), Qt::CaseInsensitive) == 0) {
      importEnex(sourcePath, workspaceRoot, result);
    } else {
      importMarkdown(sourcePath, workspaceRoot, result);
    }
  }
  return result;
}

QString NoteTransferService::uniquePath(const QString &directory,
                                        const QString &requestedName) {
  const QString safeName = QFileInfo(requestedName).fileName();
  const QFileInfo requested(safeName.isEmpty() ? QStringLiteral("Untitled.md")
                                               : safeName);
  const QString stem = requested.completeBaseName();
  const QString suffix = requested.suffix();
  for (int index = 1;; ++index) {
    const QString numbered =
        index == 1 ? stem : QStringLiteral("%1 (%2)").arg(stem).arg(index);
    const QString name =
        suffix.isEmpty() ? numbered : numbered + QLatin1Char('.') + suffix;
    const QString candidate = QDir(directory).filePath(name);
    if (!QFileInfo::exists(candidate))
      return candidate;
  }
}

} // namespace qt_editor
