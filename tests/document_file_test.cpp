#include "document_file.h"

#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

class DocumentFileTest final : public QObject {
  Q_OBJECT

private slots:
  void loadsPlainMarkdown();
  void preservesFrontMatterOnSave();
  void removesFrontMatterBodyGutterFromEditorContent();
  void treatsUnclosedFrontMatterAsMarkdown();
  void createsAndDuplicatesNotes();
  void persistsMetadataFlags();
  void readsInlineAndBlockMetadataLists();
  void comparesCanonicalContentIndependentlyOfEditorState();
  void preparesCanonicalRevisionBeforeWritingIt();
};

namespace {

QString writeFile(QTemporaryDir &directory, const QByteArray &content) {
  const QString path = directory.filePath(QStringLiteral("note.md"));
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(content) != content.size())
    return {};
  return path;
}

QByteArray readFile(const QString &path) {
  QFile file(path);
  return file.open(QIODevice::ReadOnly) ? file.readAll() : QByteArray();
}

} // namespace

void DocumentFileTest::loadsPlainMarkdown() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path =
      writeFile(directory, QByteArrayLiteral("# Note\n\nBody\n"));
  QVERIFY(!path.isEmpty());

  QString error;
  const auto document = qt_editor::DocumentFile::load(path, &error);
  QVERIFY2(document.has_value(), qPrintable(error));
  QCOMPARE(document->metadataPrefix(), QString());
  QCOMPARE(document->body(), QStringLiteral("# Note\n\nBody\n"));
}

void DocumentFileTest::preservesFrontMatterOnSave() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QByteArray original = QByteArrayLiteral(
      "---\r\ntitle: Test\r\ncreated: '2026-07-18'\r\n---\r\n# Old\r\n");
  const QString path = writeFile(directory, original);
  QVERIFY(!path.isEmpty());

  QString error;
  auto document = qt_editor::DocumentFile::load(path, &error);
  QVERIFY2(document.has_value(), qPrintable(error));
  QCOMPARE(document->body(), QStringLiteral("# Old\r\n"));
  QVERIFY2(document->saveBody(QStringLiteral("# New\r\n"), &error),
           qPrintable(error));
  QCOMPARE(
      readFile(path),
      QByteArrayLiteral(
          "---\r\ntitle: Test\r\ncreated: '2026-07-18'\r\n---\r\n# New\r\n"));
}

void DocumentFileTest::removesFrontMatterBodyGutterFromEditorContent() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QByteArray original =
      QByteArrayLiteral("---\ntitle: Test\n---\n\n# Heading\n");
  const QString path = writeFile(directory, original);
  QVERIFY(!path.isEmpty());

  QString error;
  auto document = qt_editor::DocumentFile::load(path, &error);
  QVERIFY2(document.has_value(), qPrintable(error));
  QCOMPARE(document->body(), QStringLiteral("# Heading\n"));
  QVERIFY2(document->saveBody(QStringLiteral("# Changed\n"), &error),
           qPrintable(error));
  QCOMPARE(readFile(path),
           QByteArrayLiteral("---\ntitle: Test\n---\n\n# Changed\n"));
}

void DocumentFileTest::treatsUnclosedFrontMatterAsMarkdown() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path = writeFile(
      directory, QByteArrayLiteral("---\ntitle: unfinished\n# Body\n"));
  QVERIFY(!path.isEmpty());

  const auto document = qt_editor::DocumentFile::load(path);
  QVERIFY(document.has_value());
  QCOMPARE(document->metadataPrefix(), QString());
  QCOMPARE(document->body(),
           QStringLiteral("---\ntitle: unfinished\n# Body\n"));
}

void DocumentFileTest::createsAndDuplicatesNotes() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString originalPath = directory.filePath(QStringLiteral("Alpha.md"));
  QString error;
  auto original = qt_editor::DocumentFile::create(
      originalPath, QStringLiteral("Alpha's Note"), &error);
  QVERIFY2(original.has_value(), qPrintable(error));
  QVERIFY(original->metadataPrefix().contains(
      QStringLiteral("title: 'Alpha''s Note'")));
  QCOMPARE(original->body(), QStringLiteral("# Alpha's Note\n"));

  const QString copyPath = directory.filePath(QStringLiteral("Alpha 2.md"));
  QVERIFY2(original->writeCopy(copyPath, QStringLiteral("Alpha 2"),
                               QStringLiteral("# Changed\n"), &error),
           qPrintable(error));
  const auto copy = qt_editor::DocumentFile::load(copyPath, &error);
  QVERIFY2(copy.has_value(), qPrintable(error));
  QVERIFY(copy->metadataPrefix().contains(QStringLiteral("title: 'Alpha 2'")));
  QCOMPARE(copy->body(), QStringLiteral("# Changed\n"));
}

void DocumentFileTest::persistsMetadataFlags() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QString error;
  auto document = qt_editor::DocumentFile::create(
      directory.filePath(QStringLiteral("flags.md")), QStringLiteral("Flags"),
      &error);
  QVERIFY2(document.has_value(), qPrintable(error));
  QVERIFY(!document->metadataFlag(qt_editor::NoteFlag::Favorited));
  QVERIFY2(
      document->setMetadataFlag(qt_editor::NoteFlag::Favorited, true, &error),
      qPrintable(error));
  QVERIFY2(document->setMetadataFlag(qt_editor::NoteFlag::Pinned, true, &error),
           qPrintable(error));
  QVERIFY(document->metadataFlag(qt_editor::NoteFlag::Favorited));
  QVERIFY(document->metadataFlag(qt_editor::NoteFlag::Pinned));

  auto reloaded = qt_editor::DocumentFile::load(document->path(), &error);
  QVERIFY2(reloaded.has_value(), qPrintable(error));
  QVERIFY(reloaded->metadataFlag(qt_editor::NoteFlag::Favorited));
  QVERIFY(reloaded->metadataFlag(qt_editor::NoteFlag::Pinned));
  QVERIFY2(
      reloaded->setMetadataFlag(qt_editor::NoteFlag::Favorited, false, &error),
      qPrintable(error));
  QVERIFY(!reloaded->metadataFlag(qt_editor::NoteFlag::Favorited));
  QVERIFY2(reloaded->setTags(
               {QStringLiteral("work"), QStringLiteral("alpha's")}, &error),
           qPrintable(error));
  QCOMPARE(reloaded->tags(),
           QStringList({QStringLiteral("work"), QStringLiteral("alpha's")}));
  QVERIFY2(
      reloaded->saveBody(QStringLiteral("# Flags updated\n"), &error, true),
      qPrintable(error));
  QVERIFY(reloaded->metadataPrefix().contains(QStringLiteral("modified:")));
  QCOMPARE(reloaded->body(), QStringLiteral("# Flags updated\n"));
}

void DocumentFileTest::readsInlineAndBlockMetadataLists() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path =
      writeFile(directory, QByteArrayLiteral("---\n"
                                             "title: Lists\n"
                                             "tags: ['Projects/Test', plain]\n"
                                             "attachments:\n"
                                             "  - 'diagram one.svg'\n"
                                             "  - report.pdf\n"
                                             "---\n\n# Lists\n"));
  QVERIFY(!path.isEmpty());
  const auto document = qt_editor::DocumentFile::load(path);
  QVERIFY(document.has_value());
  QCOMPARE(document->tags(), QStringList({QStringLiteral("Projects/Test"),
                                          QStringLiteral("plain")}));
  QCOMPARE(document->attachments(),
           QStringList({QStringLiteral("diagram one.svg"),
                        QStringLiteral("report.pdf")}));
}

void DocumentFileTest::comparesCanonicalContentIndependentlyOfEditorState() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path = writeFile(
      directory, QByteArrayLiteral(
                     "---\ntitle: Race\nmodified: "
                     "'2026-07-19T12:00:00.000Z'\n---\n\n# Saved revision\n"));
  QVERIFY(!path.isEmpty());

  const auto canonical = qt_editor::DocumentFile::load(path);
  const auto delayedWatcherRead = qt_editor::DocumentFile::load(path);
  QVERIFY(canonical.has_value());
  QVERIFY(delayedWatcherRead.has_value());
  QVERIFY(canonical->hasSameContent(*delayedWatcherRead));

  // A newer unsaved editor buffer is intentionally not part of this
  // comparison. A genuinely different disk revision must still be detected.
  QFile external(path);
  QVERIFY(external.open(QIODevice::WriteOnly | QIODevice::Truncate));
  const QByteArray externalContent = QByteArrayLiteral(
      "---\ntitle: Race\nmodified: '2026-07-19T12:00:01.000Z'\n---\n\n# "
      "External revision\n");
  QCOMPARE(external.write(externalContent), externalContent.size());
  external.close();
  const auto externallyChanged = qt_editor::DocumentFile::load(path);
  QVERIFY(externallyChanged.has_value());
  QVERIFY(!canonical->hasSameContent(*externallyChanged));
}

void DocumentFileTest::preparesCanonicalRevisionBeforeWritingIt() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path =
      writeFile(directory, QByteArrayLiteral(
                               "---\ntitle: Memory first\nmodified: "
                               "'2026-07-19T12:00:00.000Z'\n---\n\n# Old\n"));
  QVERIFY(!path.isEmpty());
  const auto current = qt_editor::DocumentFile::load(path);
  QVERIFY(current.has_value());

  const QDateTime changedAt = QDateTime::fromString(
      QStringLiteral("2026-07-19T12:34:56.789Z"), Qt::ISODateWithMs);
  const qt_editor::DocumentFile next =
      current->withBody(QStringLiteral("# New\n"), true, changedAt);
  QCOMPARE(next.body(), QStringLiteral("# New\n"));
  QVERIFY(next.modifiedAt().has_value());
  QCOMPARE(next.modifiedAt()->toUTC(), changedAt);
  QCOMPARE(readFile(path), current->serializedContent());

  QString error;
  QVERIFY2(next.writeToDisk(&error), qPrintable(error));
  QCOMPARE(readFile(path), next.serializedContent());
}

QTEST_GUILESS_MAIN(DocumentFileTest)

#include "document_file_test.moc"
