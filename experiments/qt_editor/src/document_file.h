#pragma once

#include <QByteArray>
#include <QDateTime>
#include <QString>
#include <QStringList>

#include <optional>

namespace qt_editor {

enum class NoteFlag { Deleted, Favorited, Pinned };

class DocumentFile final {
 public:
  [[nodiscard]] static std::optional<DocumentFile> load(
      const QString& path,
      QString* errorMessage = nullptr);
  [[nodiscard]] static std::optional<DocumentFile> create(
      const QString& path,
      const QString& title,
      QString* errorMessage = nullptr);

  [[nodiscard]] const QString& path() const { return path_; }
  [[nodiscard]] const QString& body() const { return body_; }
  [[nodiscard]] const QString& metadataPrefix() const { return metadataPrefix_; }
  [[nodiscard]] QByteArray serializedContent() const;
  [[nodiscard]] bool hasSameContent(const DocumentFile& other) const;
  [[nodiscard]] std::optional<QDateTime> modifiedAt() const;
  [[nodiscard]] DocumentFile withBody(
      const QString& body,
      bool updateModified = false,
      const QDateTime& modified = {}) const;
  [[nodiscard]] bool writeToDisk(QString* errorMessage = nullptr) const;
  [[nodiscard]] bool metadataFlag(NoteFlag flag) const;
  [[nodiscard]] QStringList tags() const;
  [[nodiscard]] QStringList attachments() const;
  [[nodiscard]] bool saveBody(
      const QString& body,
      QString* errorMessage = nullptr,
      bool updateModified = false);
  [[nodiscard]] bool setMetadataFlag(NoteFlag flag, bool enabled, QString* errorMessage = nullptr);
  [[nodiscard]] bool setTags(const QStringList& tags, QString* errorMessage = nullptr);
  [[nodiscard]] bool setAttachments(const QStringList& attachments,
                                    QString* errorMessage = nullptr);
  [[nodiscard]] bool writeCopy(
      const QString& path,
      const QString& title,
      const QString& body,
      QString* errorMessage = nullptr,
      QByteArray* writtenContent = nullptr) const;

 private:
  QString path_;
  QString metadataPrefix_;
  QString bodyGutterPrefix_;
  QString body_;
};

}  // namespace qt_editor
