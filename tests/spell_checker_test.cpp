#include "spell_checker.h"

#include <QtTest>

#include <algorithm>

class SpellCheckerTest final : public QObject {
  Q_OBJECT

private slots:
  void identifiesProseButSkipsCode();
  void honorsAddedWords();
  void reportsUtf8ByteOffsets();
};

void SpellCheckerTest::identifiesProseButSkipsCode() {
  if (!qt_editor::SpellChecker::isAvailable())
    QSKIP("Hunspell dictionary unavailable");
  const QVector<qt_editor::SpellingIssue> issues =
      qt_editor::SpellChecker::check(QStringLiteral(
          "A sentnce with a typo.\n\n`sentnce`\n\n```text\nsentnce\n```\n"));
  QCOMPARE(issues.size(), 1);
  QCOMPARE(issues.constFirst().word, QStringLiteral("sentnce"));
}

void SpellCheckerTest::honorsAddedWords() {
  if (!qt_editor::SpellChecker::isAvailable())
    QSKIP("Hunspell dictionary unavailable");
  QCOMPARE(qt_editor::SpellChecker::check(QStringLiteral("Codexword"),
                                          {QStringLiteral("codexword")})
               .size(),
           0);
}

void SpellCheckerTest::reportsUtf8ByteOffsets() {
  if (!qt_editor::SpellChecker::isAvailable())
    QSKIP("Hunspell dictionary unavailable");
  const QString source = QStringLiteral("Unicode café.\nA sentnce follows.\n");
  const QVector<qt_editor::SpellingIssue> issues =
      qt_editor::SpellChecker::check(source);
  const auto issue =
      std::find_if(issues.cbegin(), issues.cend(), [](const auto &candidate) {
        return candidate.word == QStringLiteral("sentnce");
      });
  QVERIFY(issue != issues.cend());
  QCOMPARE(issue->startByte, source.toUtf8().indexOf("sentnce"));
  QCOMPARE(issue->lengthBytes, QByteArray("sentnce").size());
}

QTEST_GUILESS_MAIN(SpellCheckerTest)

#include "spell_checker_test.moc"
