#include "reference_icons.h"

#include <QFile>
#include <QResource>

static void initializeResourceCollection() { Q_INIT_RESOURCE(reference_icons); }

namespace qt_editor {

void initializeReferenceIcons() {
  static const bool initialized = [] {
    initializeResourceCollection();
    return true;
  }();
  (void)initialized;
}

bool referenceIconsAvailable() {
  initializeReferenceIcons();
  static constexpr const char *names[] = {
      "delete",      "info",         "magnify",
      "note",        "notebook",     "notebook-multiple",
      "on_ac",       "on_battery",   "paperclip",
      "pencil",      "pin",          "pin-outline",
      "star",        "star-outline", "split-view",
      "tag-multiple"};
  for (const char *name : names) {
    if (!QFile::exists(QStringLiteral(":/reference-icons/") +
                       QString::fromLatin1(name) + QStringLiteral(".svg"))) {
      return false;
    }
  }
  return true;
}

} // namespace qt_editor
