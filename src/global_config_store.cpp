#include "global_config_store.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QSaveFile>

#include <yaml-cpp/yaml.h>

#include <stdexcept>
#include <string>

namespace qt_editor {
namespace {

const QStringList kConfigNames = {
    QStringLiteral(".el-baton.yml"),  QStringLiteral(".el-baton.yaml"),
    QStringLiteral(".el-baton.json"), QStringLiteral(".notable.yml"),
    QStringLiteral(".notable.yaml"),  QStringLiteral(".notable.json"),
    QStringLiteral("config.yml"),     QStringLiteral("config.yaml"),
    QStringLiteral("config.json")};

QVariant fromYaml(const YAML::Node &node) {
  if (!node || node.IsNull())
    return {};
  if (node.IsSequence()) {
    QVariantList values;
    for (const YAML::Node &child : node)
      values.append(fromYaml(child));
    return values;
  }
  if (node.IsMap()) {
    QVariantMap values;
    for (const auto &entry : node)
      values.insert(QString::fromStdString(entry.first.as<std::string>()),
                    fromYaml(entry.second));
    return values;
  }
  const QString scalar = QString::fromStdString(node.Scalar());
  if (scalar.compare(QStringLiteral("true"), Qt::CaseInsensitive) == 0)
    return true;
  if (scalar.compare(QStringLiteral("false"), Qt::CaseInsensitive) == 0)
    return false;
  bool integerOk = false;
  const qlonglong integer = scalar.toLongLong(&integerOk);
  if (integerOk)
    return integer;
  bool numberOk = false;
  const double number = scalar.toDouble(&numberOk);
  return numberOk ? QVariant(number) : QVariant(scalar);
}

YAML::Node toYaml(const QVariant &value) {
  const int type = value.metaType().id();
  if (!value.isValid() || value.isNull())
    return YAML::Node(YAML::NodeType::Null);
  if (type == QMetaType::QVariantMap) {
    YAML::Node node(YAML::NodeType::Map);
    const QVariantMap map = value.toMap();
    for (auto it = map.cbegin(); it != map.cend(); ++it)
      node[it.key().toStdString()] = toYaml(it.value());
    return node;
  }
  if (type == QMetaType::QVariantList) {
    YAML::Node node(YAML::NodeType::Sequence);
    for (const QVariant &item : value.toList())
      node.push_back(toYaml(item));
    return node;
  }
  if (type == QMetaType::QStringList) {
    YAML::Node node(YAML::NodeType::Sequence);
    for (const QString &item : value.toStringList()) {
      node.push_back(YAML::Node(item.toStdString()));
    }
    return node;
  }
  if (type == QMetaType::Bool)
    return YAML::Node(value.toBool());
  if (type == QMetaType::Float || type == QMetaType::Double) {
    return YAML::Node(value.toDouble());
  }
  if (type == QMetaType::UInt || type == QMetaType::ULongLong) {
    return YAML::Node(value.toULongLong());
  }
  if (type == QMetaType::Int || type == QMetaType::LongLong ||
      type == QMetaType::Short || type == QMetaType::Long ||
      type == QMetaType::SChar) {
    return YAML::Node(value.toLongLong());
  }
  if (type == QMetaType::QByteArray) {
    return YAML::Node(value.toByteArray().toStdString());
  }
  return YAML::Node(value.toString().toStdString());
}

bool decodeLegacyByteString(const QVariant &value, QString *decoded) {
  if (value.metaType().id() == QMetaType::QString) {
    *decoded = value.toString();
    return true;
  }
  const QVariantList bytes = value.toList();
  if (value.metaType().id() != QMetaType::QVariantList || bytes.isEmpty())
    return false;
  QByteArray encoded;
  encoded.reserve(bytes.size());
  for (const QVariant &byte : bytes) {
    bool ok = false;
    const int number = byte.toInt(&ok);
    if (!ok || number < 0 || number > 255)
      return false;
    encoded.append(static_cast<char>(number));
  }
  *decoded = QString::fromUtf8(encoded);
  return true;
}

QVariantMap normalizeLegacyStringContainers(QVariantMap values) {
  QVariantMap plantUml = values.value(QStringLiteral("plantuml")).toMap();
  QString serverUrl;
  if (decodeLegacyByteString(
          plantUml.value(QStringLiteral("externalServerUrl")), &serverUrl)) {
    plantUml.insert(QStringLiteral("externalServerUrl"), serverUrl);
    values.insert(QStringLiteral("plantuml"), plantUml);
  }

  QVariantMap spellcheck = values.value(QStringLiteral("spellcheck")).toMap();
  const QVariant configuredWords =
      spellcheck.value(QStringLiteral("addedWords"));
  if (configuredWords.metaType().id() == QMetaType::QVariantList ||
      configuredWords.metaType().id() == QMetaType::QStringList) {
    QStringList words;
    const QVariantList items = configuredWords.toList();
    for (const QVariant &item : items) {
      QString word;
      if (decodeLegacyByteString(item, &word) && !word.trimmed().isEmpty()) {
        words.append(word);
      }
    }
    spellcheck.insert(QStringLiteral("addedWords"), words);
    values.insert(QStringLiteral("spellcheck"), spellcheck);
  }
  return values;
}

QVariantMap mergeMaps(QVariantMap base, const QVariantMap &overrides) {
  for (auto it = overrides.cbegin(); it != overrides.cend(); ++it) {
    if (base.value(it.key()).metaType().id() == QMetaType::QVariantMap &&
        it.value().metaType().id() == QMetaType::QVariantMap) {
      base.insert(it.key(),
                  mergeMaps(base.value(it.key()).toMap(), it.value().toMap()));
    } else {
      base.insert(it.key(), it.value());
    }
  }
  return base;
}

QVariantMap setNested(QVariantMap map, const QStringList &parts,
                      qsizetype index, const QVariant &value) {
  if (index == parts.size() - 1) {
    map.insert(parts.at(index), value);
    return map;
  }
  map.insert(parts.at(index), setNested(map.value(parts.at(index)).toMap(),
                                        parts, index + 1, value));
  return map;
}

} // namespace

QVariantMap GlobalConfigStore::defaults() {
  return {
      {QStringLiteral("autoupdate"), true},
      {QStringLiteral("performance"),
       QVariantMap{{QStringLiteral("highPerformanceMode"), false}}},
      {QStringLiteral("battery"),
       QVariantMap{{QStringLiteral("enabled"), false},
                   {QStringLiteral("autoDetect"), true},
                   {QStringLiteral("targetFps"), 30},
                   {QStringLiteral("optimizeRendering"), true},
                   {QStringLiteral("renderDelayMs"), 400},
                   {QStringLiteral("disableSpellcheck"), false},
                   {QStringLiteral("disableAutocomplete"), false},
                   {QStringLiteral("disableAnimations"), true}}},
      {QStringLiteral("spellcheck"),
       QVariantMap{{QStringLiteral("addedWords"), QVariantList()},
                   {QStringLiteral("disable"), false}}},
      {QStringLiteral("notes"),
       QVariantMap{{QStringLiteral("disableAutomaticRenaming"), false}}},
      {QStringLiteral("ui"),
       QVariantMap{{QStringLiteral("disableAnimations"), false}}},
      {QStringLiteral("input"),
       QVariantMap{{QStringLiteral("disableMiddleClickPaste"), false}}},
      {QStringLiteral("preview"),
       QVariantMap{{QStringLiteral("largeNoteFullRenderDelay"), 500},
                   {QStringLiteral("disableScriptSanitization"), false},
                   {QStringLiteral("disableSplitViewSync"), false}}},
      {QStringLiteral("monaco"),
       QVariantMap{
           {QStringLiteral("tableFormattingDelay"), 2000},
           {QStringLiteral("disableAutomaticTableFormatting"), false},
           {QStringLiteral("editorOptions"),
            QVariantMap{{QStringLiteral("lineNumbers"), QStringLiteral("on")},
                        {QStringLiteral("disableSuggestions"), false},
                        {QStringLiteral("tabSize"), 2}}}}},
      {QStringLiteral("plantuml"),
       QVariantMap{{QStringLiteral("externalServerUrl"), QString()},
                   {QStringLiteral("requestTimeoutMs"), 12000},
                   {QStringLiteral("cacheMaxEntries"), 400},
                   {QStringLiteral("cacheMaxBytes"), 64 * 1024 * 1024}}}};
}

void GlobalConfigStore::setWorkspaceRoot(const QString &workspaceRoot) {
  if (workspaceRoot.isEmpty()) {
    workspaceRoot_.clear();
    filePath_.clear();
    values_ = defaults();
    return;
  }
  workspaceRoot_ = QFileInfo(workspaceRoot).absoluteFilePath();
  const QDir root(workspaceRoot_);
  filePath_.clear();
  for (const QString &name : kConfigNames) {
    if (QFileInfo::exists(root.filePath(name))) {
      filePath_ = root.filePath(name);
      break;
    }
  }
  if (filePath_.isEmpty() && !workspaceRoot_.isEmpty())
    filePath_ = root.filePath(QStringLiteral(".el-baton.yml"));
  (void)reload();
}

bool GlobalConfigStore::reload(QString *errorMessage) {
  loadError_.clear();
  values_ = defaults();
  if (filePath_.isEmpty() || !QFileInfo::exists(filePath_)) {
    return true;
  }
  QFile file(filePath_);
  if (!file.open(QIODevice::ReadOnly)) {
    if (errorMessage != nullptr)
      *errorMessage = file.errorString();
    return false;
  }
  try {
    const QByteArray content = file.readAll();
    QVariantMap parsed;
    if (QFileInfo(filePath_).suffix().compare(QStringLiteral("json"),
                                              Qt::CaseInsensitive) == 0) {
      QJsonParseError parseError;
      const QJsonDocument document =
          QJsonDocument::fromJson(content, &parseError);
      if (parseError.error != QJsonParseError::NoError)
        throw std::runtime_error(parseError.errorString().toStdString());
      if (!document.isObject())
        throw std::runtime_error("Configuration root must be an object.");
      parsed = document.object().toVariantMap();
    } else {
      const YAML::Node root = YAML::Load(content.constData());
      if (!root.IsMap())
        throw std::runtime_error("Configuration root must be a map.");
      parsed = fromYaml(root).toMap();
    }
    values_ = normalizeLegacyStringContainers(mergeMaps(defaults(), parsed));
    return true;
  } catch (const std::exception &error) {
    loadError_ = QString::fromUtf8(error.what());
    if (errorMessage != nullptr)
      *errorMessage = loadError_;
    return false;
  }
}

bool GlobalConfigStore::save(QString *errorMessage) const {
  if (!loadError_.isEmpty()) {
    if (errorMessage != nullptr) {
      *errorMessage =
          QStringLiteral("Refusing to overwrite invalid configuration: %1")
              .arg(loadError_);
    }
    return false;
  }
  if (filePath_.isEmpty()) {
    if (errorMessage != nullptr)
      *errorMessage =
          QStringLiteral("No workspace data directory is selected.");
    return false;
  }
  QByteArray content;
  if (QFileInfo(filePath_).suffix().compare(QStringLiteral("json"),
                                            Qt::CaseInsensitive) == 0) {
    content =
        QJsonDocument::fromVariant(values_).toJson(QJsonDocument::Indented);
  } else {
    YAML::Emitter emitter;
    emitter.SetIndent(2);
    emitter << toYaml(values_);
    content =
        QByteArray(emitter.c_str(), static_cast<qsizetype>(emitter.size())) +
        '\n';
  }
  QSaveFile file(filePath_);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(content) != content.size() || !file.commit()) {
    if (errorMessage != nullptr)
      *errorMessage = file.errorString();
    return false;
  }
  return true;
}

QVariant GlobalConfigStore::value(const QString &dottedKey,
                                  const QVariant &fallback) const {
  QVariant current = values_;
  for (const QString &part :
       dottedKey.split(QLatin1Char('.'), Qt::SkipEmptyParts)) {
    const QVariantMap map = current.toMap();
    if (!map.contains(part))
      return fallback;
    current = map.value(part);
  }
  return current;
}

void GlobalConfigStore::setValue(const QString &dottedKey,
                                 const QVariant &value) {
  const QStringList parts =
      dottedKey.split(QLatin1Char('.'), Qt::SkipEmptyParts);
  if (!parts.isEmpty())
    values_ = setNested(values_, parts, 0, value);
}

} // namespace qt_editor
