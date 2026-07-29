#include "spell_checker.h"

#include <QFileInfo>
#include <QMutex>
#include <QMutexLocker>
#include <QRegularExpression>
#include <QSet>

#include <hunspell.hxx>

#include <memory>

namespace qt_editor {
namespace {

struct Backend final {
  QMutex mutex;
  std::unique_ptr<Hunspell> hunspell;

  Backend() {
    QString base = qEnvironmentVariable("EL_BATON_HUNSPELL_DICTIONARY");
    if (base.isEmpty())
      base = QStringLiteral("/usr/share/hunspell/en_US");
    const QString affix = base + QStringLiteral(".aff");
    const QString dictionary = base + QStringLiteral(".dic");
    if (QFileInfo(affix).isFile() && QFileInfo(dictionary).isFile()) {
      hunspell =
          std::make_unique<Hunspell>(affix.toLocal8Bit().constData(),
                                     dictionary.toLocal8Bit().constData());
    }
  }
};

Backend &backend() {
  static Backend value;
  return value;
}

bool insideInlineCode(const QString &line, qsizetype position) {
  bool code = false;
  for (qsizetype index = 0; index < position; ++index) {
    if (line.at(index) == QLatin1Char('`') &&
        (index == 0 || line.at(index - 1) != QLatin1Char('\\')))
      code = !code;
  }
  return code;
}

} // namespace

bool SpellChecker::isAvailable() { return backend().hunspell != nullptr; }

QVector<SpellingIssue> SpellChecker::check(const QString &markdown,
                                           const QStringList &addedWords) {
  Backend &state = backend();
  QMutexLocker lock(&state.mutex);
  if (!state.hunspell)
    return {};

  QSet<QString> accepted;
  for (const QString &word : addedWords)
    accepted.insert(word.trimmed().toLower());
  static const QRegularExpression wordPattern(
      QStringLiteral("[A-Za-z][A-Za-z'’-]*"));
  static const QRegularExpression fencePattern(
      QStringLiteral("^\\s{0,3}(`{3,}|~{3,})"));
  QVector<SpellingIssue> issues;
  bool fenced = false;
  QChar fenceCharacter;
  qsizetype fenceLength = 0;
  qsizetype sourceOffset = 0;
  const QStringList lines =
      markdown.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  for (const QString &line : lines) {
    const QRegularExpressionMatch fence = fencePattern.match(line);
    if (fence.hasMatch()) {
      const QString marker = fence.captured(1);
      if (!fenced) {
        fenced = true;
        fenceCharacter = marker.front();
        fenceLength = marker.size();
      } else if (marker.front() == fenceCharacter &&
                 marker.size() >= fenceLength) {
        fenced = false;
      }
      sourceOffset += line.size() + 1;
      continue;
    }
    if (!fenced) {
      QRegularExpressionMatchIterator matches = wordPattern.globalMatch(line);
      while (matches.hasNext()) {
        const QRegularExpressionMatch match = matches.next();
        const QString word = match.captured(0);
        if (word.size() <= 2 ||
            QRegularExpression(QStringLiteral("^[A-Z]{2,}$"))
                .match(word)
                .hasMatch() ||
            accepted.contains(word.toLower()) ||
            insideInlineCode(line, match.capturedStart()))
          continue;
        const QByteArray utf8 = word.toUtf8();
        if (state.hunspell->spell(utf8.toStdString()))
          continue;
        QStringList suggestions;
        const std::vector<std::string> candidates =
            state.hunspell->suggest(utf8.toStdString());
        const size_t suggestionCount = std::min<size_t>(3, candidates.size());
        for (size_t index = 0; index < suggestionCount; ++index) {
          suggestions.append(QString::fromUtf8(candidates.at(index)));
        }
        const qsizetype characterStart = sourceOffset + match.capturedStart();
        issues.append({markdown.first(characterStart).toUtf8().size(),
                       utf8.size(), word, suggestions});
      }
    }
    sourceOffset += line.size() + 1;
  }
  return issues;
}

} // namespace qt_editor
