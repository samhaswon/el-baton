cmake_minimum_required(VERSION 3.22)

if(NOT PRUNE_SCRIPT OR NOT TEST_ROOT)
  message(FATAL_ERROR "PRUNE_SCRIPT and TEST_ROOT are required")
endif()

file(REMOVE_RECURSE "${TEST_ROOT}")
file(MAKE_DIRECTORY
  "${TEST_ROOT}/resources"
  "${TEST_ROOT}/translations/qtwebengine_locales")
file(WRITE "${TEST_ROOT}/resources/qtwebengine_resources.pak" "required")
file(WRITE "${TEST_ROOT}/resources/qtwebengine_devtools_resources.pak" "unused")
file(WRITE "${TEST_ROOT}/translations/qtwebengine_locales/en-US.pak" "english")
file(WRITE "${TEST_ROOT}/translations/qtwebengine_locales/fr.pak" "french")

set(EL_BATON_DEPLOYMENT_ROOT_OVERRIDE "${TEST_ROOT}")
include("${PRUNE_SCRIPT}")

foreach(REQUIRED_FILE IN ITEMS
    "resources/qtwebengine_resources.pak"
    "translations/qtwebengine_locales/en-US.pak")
  if(NOT EXISTS "${TEST_ROOT}/${REQUIRED_FILE}")
    message(FATAL_ERROR "Deployment pruning removed ${REQUIRED_FILE}")
  endif()
endforeach()

foreach(REMOVED_FILE IN ITEMS
    "resources/qtwebengine_devtools_resources.pak"
    "translations/qtwebengine_locales/fr.pak")
  if(EXISTS "${TEST_ROOT}/${REMOVED_FILE}")
    message(FATAL_ERROR "Deployment pruning retained ${REMOVED_FILE}")
  endif()
endforeach()
