#include "document_file.h"

#include <QDateTime>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QSaveFile>

#include <utility>

namespace qt_editor {
namespace {

std::pair<QString, QString> splitMetadata(const QString &content) {
  if (!content.startsWith(QStringLiteral("---\n")) &&
      !content.startsWith(QStringLiteral("---\r\n"))) {
    return {QString(), content};
  }

  static const QRegularExpression closing(
      QStringLiteral("\\r?\\n(?:---|\\.\\.\\.)[ \\t]*\\r?\\n"));
  const QRegularExpressionMatch match = closing.match(content, 3);
  if (!match.hasMatch())
    return {QString(), content};

  return {
      content.first(match.capturedEnd()),
      content.sliced(match.capturedEnd()),
  };
}

void setError(QString *errorMessage, const QString &message) {
  if (errorMessage != nullptr)
    *errorMessage = message;
}

QString quotedYamlString(QString value) {
  value.replace(QLatin1Char('\''), QStringLiteral("''"));
  return QLatin1Char('\'') + value + QLatin1Char('\'');
}

QString flagName(NoteFlag flag) {
  switch (flag) {
  case NoteFlag::Deleted:
    return QStringLiteral("deleted");
  case NoteFlag::Favorited:
    return QStringLiteral("favorited");
  case NoteFlag::Pinned:
    return QStringLiteral("pinned");
  }
  return {};
}

QRegularExpression metadataLine(const QString &name) {
  return QRegularExpression(QStringLiteral("(^|\\n)%1:[ \\t]*([^\\r\\n]*)")
                                .arg(QRegularExpression::escape(name)),
                            QRegularExpression::CaseInsensitiveOption);
}

QString unquoteYamlValue(QString value) {
  value = value.trimmed();
  if (value.size() >= 2 && value.startsWith(QLatin1Char('\'')) &&
      value.endsWith(QLatin1Char('\''))) {
    value = value.sliced(1, value.size() - 2);
    value.replace(QStringLiteral("''"), QStringLiteral("'"));
  } else if (value.size() >= 2 && value.startsWith(QLatin1Char('"')) &&
             value.endsWith(QLatin1Char('"'))) {
    value = value.sliced(1, value.size() - 2);
  }
  return value;
}

QStringList metadataStringList(const QString &metadata, const QString &name) {
  const QRegularExpressionMatch match = metadataLine(name).match(metadata);
  if (!match.hasMatch())
    return {};
  const QString value = match.captured(2).trimmed();
  QStringList result;
  if (value.startsWith(QLatin1Char('[')) && value.endsWith(QLatin1Char(']'))) {
    const QString contents = value.sliced(1, value.size() - 2);
    static const QRegularExpression item(
        QStringLiteral("(?:^|,)\\s*(?:'((?:''|[^'])*)'|\"([^\"]*)\"|([^,]+))"));
    auto iterator = item.globalMatch(contents);
    while (iterator.hasNext()) {
      const QRegularExpressionMatch token = iterator.next();
      QString entry =
          !token.captured(1).isNull()
              ? token.captured(1)
              : (!token.captured(2).isNull() ? token.captured(2)
                                             : token.captured(3).trimmed());
      entry.replace(QStringLiteral("''"), QStringLiteral("'"));
      if (!entry.isEmpty())
        result.append(entry);
    }
    return result;
  }
  if (!value.isEmpty())
    return {};

  const QString suffix = metadata.sliced(match.capturedEnd());
  const QStringList lines =
      suffix.split(QRegularExpression(QStringLiteral("\\r?\\n")));
  for (const QString &line : lines) {
    if (line.trimmed().isEmpty())
      continue;
    static const QRegularExpression blockItem(
        QStringLiteral("^[ \\t]*-[ \\t]+(.+)$"));
    const QRegularExpressionMatch item = blockItem.match(line);
    if (!item.hasMatch())
      break;
    const QString entry = unquoteYamlValue(item.captured(1));
    if (!entry.isEmpty())
      result.append(entry);
  }
  return result;
}

QString newMetadata(const QString &title) {
  const QString timestamp =
      QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
  return QStringLiteral("---\ntitle: %1\ncreated: '%2'\nmodified: '%2'\n---\n")
      .arg(quotedYamlString(title), timestamp);
}

QString metadataWithTitle(QString metadata, const QString &title) {
  if (metadata.isEmpty())
    return newMetadata(title);
  static const QRegularExpression titleLine(
      QStringLiteral("(^|\\n)title:[^\\r\\n]*"),
      QRegularExpression::CaseInsensitiveOption);
  const QRegularExpressionMatch match = titleLine.match(metadata);
  if (match.hasMatch()) {
    const QString replacement =
        match.captured(1) +
        QStringLiteral("title: %1").arg(quotedYamlString(title));
    metadata.replace(match.capturedStart(), match.capturedLength(),
                     replacement);
  } else {
    const qsizetype firstLineEnd = metadata.indexOf(QLatin1Char('\n'));
    metadata.insert(firstLineEnd < 0 ? metadata.size() : firstLineEnd + 1,
                    QStringLiteral("title: %1\n").arg(quotedYamlString(title)));
  }
  static const QRegularExpression transientFlags(
      QStringLiteral(
          "(^|\\n)(?:favorited|pinned|deleted):[^\\r\\n]*(?=\\r?\\n)"),
      QRegularExpression::CaseInsensitiveOption);
  metadata.remove(transientFlags);
  return metadata;
}

bool writeDocument(const QString &path, const QString &metadata,
                   const QString &gutter, const QString &body,
                   QString *errorMessage) {
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly)) {
    setError(errorMessage, file.errorString());
    return false;
  }
  const QByteArray content = (metadata + gutter + body).toUtf8();
  if (file.write(content) != content.size() || !file.commit()) {
    setError(errorMessage, file.errorString());
    file.cancelWriting();
    return false;
  }
  return true;
}

} // namespace

std::optional<DocumentFile> DocumentFile::load(const QString &path,
                                               QString *errorMessage) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    setError(errorMessage, file.errorString());
    return std::nullopt;
  }

  DocumentFile document;
  document.path_ = QFileInfo(file).absoluteFilePath();
  auto [metadataPrefix, body] =
      splitMetadata(QString::fromUtf8(file.readAll()));
  document.metadataPrefix_ = std::move(metadataPrefix);
  if (!document.metadataPrefix_.isEmpty() &&
      body.startsWith(QLatin1Char('\n'))) {
    document.bodyGutterPrefix_ = QStringLiteral("\n");
    body.remove(0, 1);
  }
  document.body_ = std::move(body);
  return document;
}

std::optional<DocumentFile> DocumentFile::create(const QString &path,
                                                 const QString &title,
                                                 QString *errorMessage) {
  const QString body = QStringLiteral("# %1\n").arg(title);
  if (!writeDocument(path, newMetadata(title), QStringLiteral("\n"), body,
                     errorMessage))
    return std::nullopt;
  return load(path, errorMessage);
}

bool DocumentFile::saveBody(const QString &body, QString *errorMessage,
                            bool updateModified) {
  DocumentFile next = withBody(body, updateModified);
  if (!next.writeToDisk(errorMessage))
    return false;
  *this = std::move(next);
  return true;
}

DocumentFile DocumentFile::withBody(const QString &body, bool updateModified,
                                    const QDateTime &modified) const {
  DocumentFile next = *this;
  QString metadata = next.metadataPrefix_;
  QString gutter = next.bodyGutterPrefix_;
  if (updateModified) {
    if (metadata.isEmpty()) {
      metadata = newMetadata(QFileInfo(path_).completeBaseName());
      gutter = QStringLiteral("\n");
    } else {
      const QRegularExpression line = metadataLine(QStringLiteral("modified"));
      const QRegularExpressionMatch match = line.match(metadata);
      const QString value =
          QStringLiteral("modified: '%1'")
              .arg((modified.isValid() ? modified.toUTC()
                                       : QDateTime::currentDateTimeUtc())
                       .toString(Qt::ISODateWithMs));
      if (match.hasMatch()) {
        metadata.replace(match.capturedStart(), match.capturedLength(),
                         match.captured(1) + value);
      } else {
        const qsizetype closing = metadata.lastIndexOf(QRegularExpression(
            QStringLiteral("(?:^|\\n)(?:---|\\.\\.)[ \\t]*\\r?\\n?$")));
        metadata.insert(closing < 0 ? metadata.size() : closing + 1,
                        value + QLatin1Char('\n'));
      }
    }
  }
  next.metadataPrefix_ = metadata;
  next.bodyGutterPrefix_ = gutter;
  next.body_ = body;
  return next;
}

bool DocumentFile::writeToDisk(QString *errorMessage) const {
  return writeDocument(path_, metadataPrefix_, bodyGutterPrefix_, body_,
                       errorMessage);
}

QByteArray DocumentFile::serializedContent() const {
  return (metadataPrefix_ + bodyGutterPrefix_ + body_).toUtf8();
}

bool DocumentFile::hasSameContent(const DocumentFile &other) const {
  return serializedContent() == other.serializedContent();
}

std::optional<QDateTime> DocumentFile::modifiedAt() const {
  const QRegularExpressionMatch match =
      metadataLine(QStringLiteral("modified")).match(metadataPrefix_);
  if (!match.hasMatch())
    return std::nullopt;
  QString value = match.captured(2).trimmed();
  if (value.size() >= 2 && ((value.startsWith(QLatin1Char('\'')) &&
                             value.endsWith(QLatin1Char('\''))) ||
                            (value.startsWith(QLatin1Char('"')) &&
                             value.endsWith(QLatin1Char('"'))))) {
    value = value.sliced(1, value.size() - 2);
  }
  const QDateTime parsed = QDateTime::fromString(value, Qt::ISODateWithMs);
  return parsed.isValid() ? std::optional<QDateTime>(parsed) : std::nullopt;
}

bool DocumentFile::metadataFlag(NoteFlag flag) const {
  const QRegularExpressionMatch match =
      metadataLine(flagName(flag)).match(metadataPrefix_);
  if (!match.hasMatch())
    return false;
  const QString value = match.captured(2).trimmed();
  return value.compare(QStringLiteral("true"), Qt::CaseInsensitive) == 0 ||
         value == QStringLiteral("1");
}

QStringList DocumentFile::tags() const {
  return metadataStringList(metadataPrefix_, QStringLiteral("tags"));
}

QStringList DocumentFile::attachments() const {
  return metadataStringList(metadataPrefix_, QStringLiteral("attachments"));
}

bool DocumentFile::setMetadataFlag(NoteFlag flag, bool enabled,
                                   QString *errorMessage) {
  QString metadata = metadataPrefix_;
  QString gutter = bodyGutterPrefix_;
  if (metadata.isEmpty()) {
    metadata = newMetadata(QFileInfo(path_).completeBaseName());
    gutter = QStringLiteral("\n");
  }
  const QString name = flagName(flag);
  const QRegularExpression line = metadataLine(name);
  const QRegularExpressionMatch match = line.match(metadata);
  if (enabled) {
    const QString replacement =
        match.hasMatch() ? match.captured(1) + name + QStringLiteral(": true")
                         : QString();
    if (match.hasMatch()) {
      metadata.replace(match.capturedStart(), match.capturedLength(),
                       replacement);
    } else {
      const qsizetype closing = metadata.lastIndexOf(QRegularExpression(
          QStringLiteral("(?:^|\\n)(?:---|\\.\\.)[ \\t]*\\r?\\n?$")));
      metadata.insert(closing < 0 ? metadata.size() : closing + 1,
                      name + QStringLiteral(": true\n"));
    }
  } else if (match.hasMatch()) {
    metadata.remove(match.capturedStart(), match.capturedLength());
  }
  if (!writeDocument(path_, metadata, gutter, body_, errorMessage))
    return false;
  metadataPrefix_ = metadata;
  bodyGutterPrefix_ = gutter;
  return true;
}

bool DocumentFile::setTags(const QStringList &tags, QString *errorMessage) {
  QString metadata = metadataPrefix_;
  QString gutter = bodyGutterPrefix_;
  if (metadata.isEmpty()) {
    metadata = newMetadata(QFileInfo(path_).completeBaseName());
    gutter = QStringLiteral("\n");
  }
  const QRegularExpression line = metadataLine(QStringLiteral("tags"));
  const QRegularExpressionMatch match = line.match(metadata);
  QStringList normalized;
  for (const QString &tag : tags) {
    const QString trimmed = tag.trimmed();
    if (!trimmed.isEmpty() &&
        !normalized.contains(trimmed, Qt::CaseInsensitive))
      normalized.append(trimmed);
  }
  if (normalized.isEmpty()) {
    if (match.hasMatch())
      metadata.remove(match.capturedStart(), match.capturedLength());
  } else {
    QStringList encoded;
    for (const QString &tag : normalized)
      encoded.append(quotedYamlString(tag));
    const QString value =
        QStringLiteral("tags: [%1]").arg(encoded.join(QStringLiteral(", ")));
    if (match.hasMatch()) {
      metadata.replace(match.capturedStart(), match.capturedLength(),
                       match.captured(1) + value);
    } else {
      const qsizetype closing = metadata.lastIndexOf(QRegularExpression(
          QStringLiteral("(?:^|\\n)(?:---|\\.\\.)[ \\t]*\\r?\\n?$")));
      metadata.insert(closing < 0 ? metadata.size() : closing + 1,
                      value + QLatin1Char('\n'));
    }
  }
  if (!writeDocument(path_, metadata, gutter, body_, errorMessage))
    return false;
  metadataPrefix_ = metadata;
  bodyGutterPrefix_ = gutter;
  return true;
}

bool DocumentFile::setAttachments(const QStringList &attachments,
                                  QString *errorMessage) {
  QString metadata = metadataPrefix_;
  QString gutter = bodyGutterPrefix_;
  if (metadata.isEmpty()) {
    metadata = newMetadata(QFileInfo(path_).completeBaseName());
    gutter = QStringLiteral("\n");
  }
  const QRegularExpression line = metadataLine(QStringLiteral("attachments"));
  const QRegularExpressionMatch match = line.match(metadata);
  QStringList normalized;
  for (const QString &attachment : attachments) {
    const QString fileName = QFileInfo(attachment.trimmed()).fileName();
    if (!fileName.isEmpty() &&
        !normalized.contains(fileName, Qt::CaseInsensitive)) {
      normalized.append(fileName);
    }
  }
  if (normalized.isEmpty()) {
    if (match.hasMatch())
      metadata.remove(match.capturedStart(), match.capturedLength());
  } else {
    QStringList encoded;
    for (const QString &attachment : normalized)
      encoded.append(quotedYamlString(attachment));
    const QString value = QStringLiteral("attachments: [%1]")
                              .arg(encoded.join(QStringLiteral(", ")));
    if (match.hasMatch()) {
      metadata.replace(match.capturedStart(), match.capturedLength(),
                       match.captured(1) + value);
    } else {
      const qsizetype closing = metadata.lastIndexOf(QRegularExpression(
          QStringLiteral("(?:^|\\n)(?:---|\\.\\.)[ \\t]*\\r?\\n?$")));
      metadata.insert(closing < 0 ? metadata.size() : closing + 1,
                      value + QLatin1Char('\n'));
    }
  }
  if (!writeDocument(path_, metadata, gutter, body_, errorMessage))
    return false;
  metadataPrefix_ = metadata;
  bodyGutterPrefix_ = gutter;
  return true;
}

bool DocumentFile::writeCopy(const QString &path, const QString &title,
                             const QString &body, QString *errorMessage,
                             QByteArray *writtenContent) const {
  const QString metadata = metadataWithTitle(metadataPrefix_, title);
  const QString gutter = metadata.isEmpty() ? QString() : QStringLiteral("\n");
  if (!writeDocument(path, metadata, gutter, body, errorMessage))
    return false;
  if (writtenContent != nullptr)
    *writtenContent = (metadata + gutter + body).toUtf8();
  return true;
}

} // namespace qt_editor
