#include "settings_store.h"
#include "global_config_store.h"
#include "workspace_repository.h"

#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QUrl>
#include <QtTest>

#include <algorithm>

class DataSourcesTest final : public QObject {
  Q_OBJECT

 private slots:
  void preservesUnrelatedReferenceSettings();
  void discoversAndSearchesWorkspaceNotes();
  void resolvesWorkspaceLinksSafely();
  void buildsWorkspaceGraphAndAttachmentMetadata();
  void readsAndWritesWorkspaceConfiguration();
  void repairsLegacyStringContainers();
};

void DataSourcesTest::preservesUnrelatedReferenceSettings() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path = directory.filePath(QStringLiteral(".el-baton.json"));
  QFile seed(path);
  QVERIFY(seed.open(QIODevice::WriteOnly));
  seed.write(R"({"cwd":"/notes","theme":"dark","window":{"panel":"info"}})");
  seed.close();

  qt_editor::SettingsStore settings(path);
  QCOMPARE(settings.value(QStringLiteral("cwd")).toString(), QStringLiteral("/notes"));
  settings.setValue(QStringLiteral("window.panel"), QStringLiteral("explorer"));
  settings.setValue(QStringLiteral("window.explorerSectionsCollapsed"), QVariantMap{{QStringLiteral("notes"), true}});
  QVERIFY(settings.save());

  QFile saved(path);
  QVERIFY(saved.open(QIODevice::ReadOnly));
  const QJsonObject object = QJsonDocument::fromJson(saved.readAll()).object();
  QCOMPARE(object.value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
  QCOMPARE(object.value(QStringLiteral("window")).toObject().value(QStringLiteral("panel")).toString(), QStringLiteral("explorer"));
  QCOMPARE(object.value(QStringLiteral("window")).toObject()
      .value(QStringLiteral("explorerSectionsCollapsed")).toObject()
      .value(QStringLiteral("notes")).toBool(), true);
}

void DataSourcesTest::discoversAndSearchesWorkspaceNotes() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("notes/nested")));
  const auto write = [&root](const QString& relativePath, const QByteArray& content) {
    QFile file(root.filePath(relativePath));
    return file.open(QIODevice::WriteOnly) && file.write(content) == content.size();
  };
  QVERIFY(write(QStringLiteral("notes/alpha.md"), QByteArrayLiteral("---\ntitle: Alpha Note\ntags: ['Projects/Alpha', 'Notebooks/Research']\npinned: true\nfavorited: true\n---\n\n# Alpha\nchemistry")));
  QVERIFY(write(QStringLiteral("notes/nested/beta.txt"), QByteArrayLiteral("# Beta Heading\nphysics")));
  QVERIFY(write(QStringLiteral("notes/ignored.bin"), QByteArrayLiteral("# Ignored")));

  qt_editor::WorkspaceRepository repository;
  repository.setWorkspaceRoot(directory.path());
  repository.refresh();
  QCOMPARE(repository.notes().size(), 2);
  QCOMPARE(repository.notes().constFirst().title, QStringLiteral("Alpha Note"));
  QVERIFY(repository.notes().constFirst().pinned);
  QVERIFY(repository.notes().constFirst().favorited);
  QCOMPARE(repository.notes().constFirst().tags, QStringList({QStringLiteral("Projects/Alpha"), QStringLiteral("Notebooks/Research")}));
  QVERIFY(!repository.notes().constFirst().content.startsWith(QStringLiteral("---")));
  QVERIFY(repository.notes().constFirst().content.startsWith(QStringLiteral("# Alpha")));
  QCOMPARE(repository.search(QStringLiteral("physics")).size(), 1);
  QCOMPARE(repository.search(QStringLiteral("alpha chemistry")).size(), 1);
  const auto results = repository.searchWithSnippets(QStringLiteral("chemistry"));
  QCOMPARE(results.size(), 1);
  QCOMPARE(results.constFirst().snippets.size(), 1);
  QVERIFY(results.constFirst().snippets.constFirst().text.contains(QStringLiteral("chemistry")));
  QVERIFY(results.constFirst().snippets.constFirst().matchLength > 0);
  QCOMPARE(results.constFirst().snippets.constFirst().sourceMatchStart, 8);
  QCOMPARE(repository.searchWithSnippets(QStringLiteral("Alpha Note"), qt_editor::SearchMode::Title).size(), 1);
  QCOMPARE(repository.searchWithSnippets(QStringLiteral("Alpha Note"), qt_editor::SearchMode::Content).size(), 0);
  const auto regexResults = repository.searchWithSnippets(
      QStringLiteral("chem[a-z]+"), qt_editor::SearchMode::Regex);
  QCOMPARE(regexResults.size(), 1);
  QCOMPARE(regexResults.constFirst().snippets.constFirst().sourceMatchStart, 8);
  QCOMPARE(repository.searchWithSnippets(QStringLiteral("[invalid"), qt_editor::SearchMode::Regex).size(), 0);
}

void DataSourcesTest::readsAndWritesWorkspaceConfiguration() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  qt_editor::GlobalConfigStore config;
  config.setWorkspaceRoot(directory.path());
  QCOMPARE(config.value(QStringLiteral("monaco.editorOptions.tabSize")).toInt(), 2);
  QCOMPARE(QFileInfo(config.filePath()).fileName(), QStringLiteral(".el-baton.yml"));
  config.setValue(QStringLiteral("monaco.editorOptions.tabSize"), 4);
  config.setValue(QStringLiteral("preview.disableSplitViewSync"), true);
  config.setValue(QStringLiteral("plantuml.externalServerUrl"),
                  QStringLiteral("https://plantuml.example.test"));
  config.setValue(QStringLiteral("spellcheck.addedWords"),
                  QStringList{QStringLiteral("ElBaton"), QStringLiteral("PlantUML")});
  QString error;
  QVERIFY2(config.save(&error), qPrintable(error));

  qt_editor::GlobalConfigStore reloaded;
  reloaded.setWorkspaceRoot(directory.path());
  QCOMPARE(reloaded.value(QStringLiteral("monaco.editorOptions.tabSize")).toInt(), 4);
  QVERIFY(reloaded.value(QStringLiteral("preview.disableSplitViewSync")).toBool());
  QVERIFY(reloaded.value(QStringLiteral("autoupdate")).toBool());
  QCOMPARE(reloaded.value(QStringLiteral("plantuml.externalServerUrl")).toString(),
           QStringLiteral("https://plantuml.example.test"));
  const QVariantList addedWords = reloaded.value(QStringLiteral("spellcheck.addedWords")).toList();
  QCOMPARE(addedWords.size(), 2);
  QCOMPARE(addedWords.at(0).toString(), QStringLiteral("ElBaton"));
  QCOMPARE(addedWords.at(1).toString(), QStringLiteral("PlantUML"));

  QFile savedConfig(config.filePath());
  QVERIFY(savedConfig.open(QIODevice::ReadOnly));
  const QByteArray yaml = savedConfig.readAll();
  QVERIFY(!yaml.contains("- 104"));
  QVERIFY(!yaml.contains("- []"));
}

void DataSourcesTest::repairsLegacyStringContainers() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QFile malformed(directory.filePath(QStringLiteral(".el-baton.yml")));
  QVERIFY(malformed.open(QIODevice::WriteOnly));
  malformed.write(
      "plantuml:\n"
      "  externalServerUrl:\n"
      "    - 104\n"
      "    - 116\n"
      "    - 116\n"
      "    - 112\n"
      "spellcheck:\n"
      "  addedWords:\n"
      "    - []\n"
      "    - []\n");
  malformed.close();

  qt_editor::GlobalConfigStore config;
  config.setWorkspaceRoot(directory.path());
  QCOMPARE(config.value(QStringLiteral("plantuml.externalServerUrl")).toString(),
           QStringLiteral("http"));
  QVERIFY(config.value(QStringLiteral("spellcheck.addedWords")).toList().isEmpty());
  QString error;
  QVERIFY2(config.save(&error), qPrintable(error));

  QVERIFY(malformed.open(QIODevice::ReadOnly));
  const QByteArray repaired = malformed.readAll();
  QVERIFY(repaired.contains("externalServerUrl: http"));
  QVERIFY(!repaired.contains("- 104"));
  QVERIFY(!repaired.contains("- []"));
}

void DataSourcesTest::resolvesWorkspaceLinksSafely() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("notes/Topics")));
  QVERIFY(root.mkpath(QStringLiteral("attachments")));
  QFile note(root.filePath(QStringLiteral("notes/Topics/A note.md")));
  QVERIFY(note.open(QIODevice::WriteOnly));
  note.write("# Resolved title\n");
  note.close();
  QFile attachment(root.filePath(QStringLiteral("attachments/image one.png")));
  QVERIFY(attachment.open(QIODevice::WriteOnly));
  attachment.write("png");
  attachment.close();

  qt_editor::WorkspaceRepository repository;
  repository.setWorkspaceRoot(directory.path());
  repository.refresh();
  QCOMPARE(repository.resolveNoteTarget(QStringLiteral("Topics/A%20note.md")), note.fileName());
  QCOMPARE(repository.resolveNoteTarget(QStringLiteral("Resolved%20title")), note.fileName());
  QCOMPARE(repository.resolveAttachmentTarget(QStringLiteral("image%20one.png")), attachment.fileName());
  const QString workspaceFile = root.filePath(QStringLiteral("support.txt"));
  QFile support(workspaceFile);
  QVERIFY(support.open(QIODevice::WriteOnly));
  support.write("support");
  support.close();
  QCOMPARE(repository.resolveLocalFileTarget(
               QStringLiteral("../../support.txt"), note.fileName()),
           workspaceFile);
  QCOMPARE(repository.resolveLocalFileTarget(
               QUrl::fromLocalFile(workspaceFile).toString(), note.fileName()),
           workspaceFile);
  QVERIFY(repository.resolveNoteTarget(QStringLiteral("../outside.md")).isEmpty());
  QVERIFY(repository.resolveAttachmentTarget(QStringLiteral("../notes/Topics/A%20note.md")).isEmpty());
  QVERIFY(repository.resolveAttachmentTarget(QStringLiteral("missing.png")).isEmpty());
  QVERIFY(repository.resolveLocalFileTarget(
              QStringLiteral("../../../outside.txt"), note.fileName()).isEmpty());
  QVERIFY(repository.resolveLocalFileTarget(
              QUrl::fromLocalFile(QStringLiteral("/etc/passwd")).toString(), note.fileName()).isEmpty());
  const QString escapingLink = root.filePath(QStringLiteral("outside-link"));
  if (QFile::link(QStringLiteral("/etc/passwd"), escapingLink)) {
    QVERIFY(repository.resolveLocalFileTarget(
                QUrl::fromLocalFile(escapingLink).toString(), note.fileName()).isEmpty());
  }
}

void DataSourcesTest::buildsWorkspaceGraphAndAttachmentMetadata() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("notes/media")));
  QVERIFY(root.mkpath(QStringLiteral("attachments/diagrams")));
  const auto write = [&root](const QString& relativePath, const QByteArray& content) {
    QFile file(root.filePath(relativePath));
    return file.open(QIODevice::WriteOnly) && file.write(content) == content.size();
  };
  QVERIFY(write(QStringLiteral("notes/alpha.md"), QByteArrayLiteral(
      "---\ntitle: Alpha\ntags: ['Projects/Test']\nattachments: [unreferenced.pdf]\n---\n\n"
      "[Beta](./beta note.md) ![Diagram](@attachment/diagrams/graph.svg)\n"
      "![Vanilla](media/inline%20image.png)\n"
      "```md\n[Ignored](@attachment/ignored.txt)\n```\n")));
  QVERIFY(write(QStringLiteral("notes/beta note.md"), QByteArrayLiteral("# Beta\n")));
  QVERIFY(write(QStringLiteral("notes/media/inline image.png"), QByteArrayLiteral("png")));
  QVERIFY(write(QStringLiteral("attachments/diagrams/graph.svg"), QByteArrayLiteral("<svg/>")));
  QVERIFY(write(QStringLiteral("attachments/unreferenced.pdf"), QByteArrayLiteral("pdf")));
  const QString escapingAttachment = root.filePath(QStringLiteral("attachments/escaping-link"));
  (void)QFile::link(QStringLiteral("/etc/passwd"), escapingAttachment);

  qt_editor::WorkspaceRepository repository;
  repository.setWorkspaceRoot(directory.path());
  repository.refresh();

  const QVector<qt_editor::AttachmentSummary> attachments = repository.attachments();
  QCOMPARE(attachments.size(), 2);
  QCOMPARE(attachments.constFirst().relativePath, QStringLiteral("diagrams/graph.svg"));
  QCOMPARE(repository.attachmentsForNote(root.filePath(QStringLiteral("notes/alpha.md"))).size(), 3);
  QCOMPARE(repository.attachmentsForNote(root.filePath(QStringLiteral("notes/beta note.md"))).size(), 0);

  const qt_editor::WorkspaceGraph graph = repository.graph();
  QCOMPARE(graph.nodes.size(), 6);  // Two notes, three attachments, and one tag.
  QCOMPARE(graph.edges.size(), 5);  // Note link, three attachment references, and tag membership.
  QCOMPARE(std::count_if(graph.nodes.cbegin(), graph.nodes.cend(), [](const auto& node) {
    return node.kind == qt_editor::WorkspaceGraphNodeKind::Attachment;
  }), 3);
  QCOMPARE(std::count_if(graph.edges.cbegin(), graph.edges.cend(), [](const auto& edge) {
    return edge.kind == qt_editor::WorkspaceGraphEdgeKind::AttachmentReference;
  }), 3);
}

QTEST_GUILESS_MAIN(DataSourcesTest)

#include "data_sources_test.moc"
