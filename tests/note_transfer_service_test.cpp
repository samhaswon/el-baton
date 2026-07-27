#include "document_file.h"
#include "note_transfer_service.h"

#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QTemporaryDir>
#include <QtTest>

class NoteTransferServiceTest final : public QObject {
  Q_OBJECT
 private slots:
  void importsMarkdownWithTag();
  void importsEnexNotesAndResources();
};

void NoteTransferServiceTest::importsMarkdownWithTag() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QFile source(directory.filePath(QStringLiteral("source.md")));
  QVERIFY(source.open(QIODevice::WriteOnly));
  source.write("---\ntitle: Source\ntags: [original]\n---\n\n# Body\n");
  source.close();
  const auto result = qt_editor::NoteTransferService::importFiles({source.fileName()},
                                                                  directory.filePath("workspace"));
  QCOMPARE(result.notesImported, 1);
  const auto imported = qt_editor::DocumentFile::load(
      directory.filePath(QStringLiteral("workspace/notes/source.md")));
  QVERIFY(imported.has_value());
  QVERIFY(imported->tags().contains(QStringLiteral("original")));
  QVERIFY(imported->tags().constLast().startsWith(QStringLiteral("Import-")));
}

void NoteTransferServiceTest::importsEnexNotesAndResources() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QFile source(directory.filePath(QStringLiteral("notes.enex")));
  QVERIFY(source.open(QIODevice::WriteOnly));
  source.write("<?xml version='1.0'?><en-export><note><title>ENEX Note</title>"
               "<content><![CDATA[<en-note><h1>Hello</h1><p>World</p></en-note>]]></content>"
               "<created>20260719T120000Z</created><tag>archive</tag><resource>"
               "<data encoding='base64'>aGVsbG8=</data><mime>text/plain</mime>"
               "<resource-attributes><file-name>hello.txt</file-name></resource-attributes>"
               "</resource></note></en-export>");
  source.close();
  const auto result = qt_editor::NoteTransferService::importFiles({source.fileName()},
                                                                  directory.filePath("workspace"));
  QCOMPARE(result.notesImported, 1);
  QCOMPARE(result.attachmentsImported, 1);
  QVERIFY(QFileInfo::exists(directory.filePath(QStringLiteral("workspace/attachments/hello.txt"))));
  const auto imported = qt_editor::DocumentFile::load(
      directory.filePath(QStringLiteral("workspace/notes/ENEX Note.md")));
  QVERIFY(imported.has_value());
  QCOMPARE(imported->attachments(), QStringList({QStringLiteral("hello.txt")}));
  QVERIFY(imported->body().contains(QStringLiteral("Hello")));
}

int main(int argc, char** argv) {
  qputenv("QT_QPA_PLATFORM", "offscreen");
  QGuiApplication application(argc, argv);
  NoteTransferServiceTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "note_transfer_service_test.moc"
