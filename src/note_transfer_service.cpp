#include "note_transfer_service.h"

#include "document_file.h"

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QMimeDatabase>
#include <QSaveFile>
#include <QTextDocument>
#include <QXmlStreamReader>

namespace qt_editor {
namespace {

QString yamlQuote(QString value) {
  value.replace(QLatin1Char('\''), QStringLiteral("''"));
  return QLatin1Char('\'') + value + QLatin1Char('\'');
}

QString encodedList(const QStringList& values) {
  QStringList encoded;
  for (const QString& value : values) encoded.append(yamlQuote(value));
  return QLatin1Char('[') + encoded.join(QStringLiteral(", ")) + QLatin1Char(']');
}

QString importTag(const QString& source) {
  return QStringLiteral("Import-") + QString::fromLatin1(
      QCryptographicHash::hash(source.toUtf8(), QCryptographicHash::Sha1).toHex().first(4));
}

QString htmlToMarkdown(const QString& html) {
  QTextDocument document;
  document.setHtml(html);
  return document.toMarkdown(QTextDocument::MarkdownDialectGitHub).trimmed() + QLatin1Char('\n');
}

struct EnexResource final {
  QString name;
  QString mime;
  QByteArray content;
};

EnexResource readResource(QXmlStreamReader& xml) {
  EnexResource resource;
  while (xml.readNextStartElement()) {
    if (xml.name() == QStringLiteral("data")) {
      resource.content = QByteArray::fromBase64(
          xml.readElementText(QXmlStreamReader::IncludeChildElements).simplified().toLatin1());
    } else if (xml.name() == QStringLiteral("mime")) {
      resource.mime = xml.readElementText().trimmed();
    } else if (xml.name() == QStringLiteral("resource-attributes")) {
      while (xml.readNextStartElement()) {
        if (xml.name() == QStringLiteral("file-name")) resource.name = xml.readElementText().trimmed();
        else xml.skipCurrentElement();
      }
    } else {
      xml.skipCurrentElement();
    }
  }
  return resource;
}

bool writeBytes(const QString& path, const QByteArray& content, QString* error) {
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(content) != content.size() || !file.commit()) {
    if (error != nullptr) *error = file.errorString();
    return false;
  }
  return true;
}

void importEnex(const QString& sourcePath, const QString& workspaceRoot, ImportResult& result) {
  QFile source(sourcePath);
  if (!source.open(QIODevice::ReadOnly)) {
    result.errors.append(QStringLiteral("%1: %2").arg(sourcePath, source.errorString()));
    return;
  }
  const QString notesPath = QDir(workspaceRoot).filePath(QStringLiteral("notes"));
  const QString attachmentsPath = QDir(workspaceRoot).filePath(QStringLiteral("attachments"));
  QDir().mkpath(notesPath);
  QDir().mkpath(attachmentsPath);
  QXmlStreamReader xml(&source);
  QMimeDatabase mimeDatabase;
  while (!xml.atEnd()) {
    xml.readNext();
    if (!xml.isStartElement() || xml.name() != QStringLiteral("note")) continue;
    QString title = QStringLiteral("Imported Note");
    QString html;
    QString created;
    QString modified;
    QStringList tags;
    QVector<EnexResource> resources;
    while (xml.readNextStartElement()) {
      if (xml.name() == QStringLiteral("title")) title = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("content")) html = xml.readElementText(QXmlStreamReader::IncludeChildElements);
      else if (xml.name() == QStringLiteral("created")) created = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("updated")) modified = xml.readElementText().trimmed();
      else if (xml.name() == QStringLiteral("tag")) tags.append(xml.readElementText().trimmed());
      else if (xml.name() == QStringLiteral("resource")) resources.append(readResource(xml));
      else xml.skipCurrentElement();
    }
    tags.append(importTag(sourcePath));
    QStringList attachmentNames;
    for (int index = 0; index < resources.size(); ++index) {
      EnexResource& resource = resources[index];
      QString name = QFileInfo(resource.name).fileName();
      if (name.isEmpty()) {
        const QString suffix = mimeDatabase.mimeTypeForName(resource.mime).preferredSuffix();
        name = QStringLiteral("resource-%1%2").arg(index + 1)
                   .arg(suffix.isEmpty() ? QString() : QLatin1Char('.') + suffix);
      }
      const QString destination = NoteTransferService::uniquePath(attachmentsPath, name);
      QString error;
      if (!writeBytes(destination, resource.content, &error)) {
        result.errors.append(QStringLiteral("%1: %2").arg(destination, error));
        continue;
      }
      attachmentNames.append(QFileInfo(destination).fileName());
      ++result.attachmentsImported;
    }
    const QString notePath = NoteTransferService::uniquePath(
        notesPath, QFileInfo(title).fileName() + QStringLiteral(".md"));
    QString metadata = QStringLiteral("---\ntitle: %1\ntags: %2\nattachments: %3\n")
                           .arg(yamlQuote(title), encodedList(tags), encodedList(attachmentNames));
    if (!created.isEmpty()) metadata += QStringLiteral("created: %1\n").arg(yamlQuote(created));
    if (!modified.isEmpty()) metadata += QStringLiteral("modified: %1\n").arg(yamlQuote(modified));
    metadata += QStringLiteral("---\n\n");
    QString error;
    if (writeBytes(notePath, (metadata + htmlToMarkdown(html)).toUtf8(), &error)) {
      ++result.notesImported;
    } else {
      result.errors.append(QStringLiteral("%1: %2").arg(notePath, error));
    }
  }
  if (xml.hasError()) result.errors.append(QStringLiteral("%1: %2").arg(sourcePath, xml.errorString()));
}

void importMarkdown(const QString& sourcePath, const QString& workspaceRoot,
                    ImportResult& result) {
  const auto source = DocumentFile::load(sourcePath);
  if (!source.has_value()) {
    result.errors.append(QStringLiteral("Unable to read %1").arg(sourcePath));
    return;
  }
  const QString notesPath = QDir(workspaceRoot).filePath(QStringLiteral("notes"));
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

}  // namespace

ImportResult NoteTransferService::importFiles(const QStringList& sourcePaths,
                                              const QString& workspaceRoot) {
  ImportResult result;
  for (const QString& sourcePath : sourcePaths) {
    if (QFileInfo(sourcePath).suffix().compare(QStringLiteral("enex"), Qt::CaseInsensitive) == 0) {
      importEnex(sourcePath, workspaceRoot, result);
    } else {
      importMarkdown(sourcePath, workspaceRoot, result);
    }
  }
  return result;
}

QString NoteTransferService::uniquePath(const QString& directory,
                                        const QString& requestedName) {
  const QString safeName = QFileInfo(requestedName).fileName();
  const QFileInfo requested(safeName.isEmpty() ? QStringLiteral("Untitled.md") : safeName);
  const QString stem = requested.completeBaseName();
  const QString suffix = requested.suffix();
  for (int index = 1;; ++index) {
    const QString numbered = index == 1 ? stem : QStringLiteral("%1 (%2)").arg(stem).arg(index);
    const QString name = suffix.isEmpty() ? numbered : numbered + QLatin1Char('.') + suffix;
    const QString candidate = QDir(directory).filePath(name);
    if (!QFileInfo::exists(candidate)) return candidate;
  }
}

}  // namespace qt_editor
