cmake_minimum_required(VERSION 3.22)

project(el_baton_qt_editor VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 6.4 REQUIRED COMPONENTS Core Gui Widgets WebChannel WebEngineWidgets Test)
find_library(QSCINTILLA_LIBRARY NAMES qscintilla2_qt6 REQUIRED)
find_path(QSCINTILLA_INCLUDE_DIR Qsci/qsciscintilla.h
  PATH_SUFFIXES qt6
  REQUIRED
)

set(CMARK_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/cmark-gfm")
set(CMARK_SOURCES
  ${CMARK_ROOT}/src/arena.c
  ${CMARK_ROOT}/src/blocks.c
  ${CMARK_ROOT}/src/buffer.c
  ${CMARK_ROOT}/src/cmark.c
  ${CMARK_ROOT}/src/cmark_ctype.c
  ${CMARK_ROOT}/src/commonmark.c
  ${CMARK_ROOT}/src/footnotes.c
  ${CMARK_ROOT}/src/houdini_href_e.c
  ${CMARK_ROOT}/src/houdini_html_e.c
  ${CMARK_ROOT}/src/houdini_html_u.c
  ${CMARK_ROOT}/src/html.c
  ${CMARK_ROOT}/src/inlines.c
  ${CMARK_ROOT}/src/iterator.c
  ${CMARK_ROOT}/src/latex.c
  ${CMARK_ROOT}/src/linked_list.c
  ${CMARK_ROOT}/src/man.c
  ${CMARK_ROOT}/src/map.c
  ${CMARK_ROOT}/src/node.c
  ${CMARK_ROOT}/src/plaintext.c
  ${CMARK_ROOT}/src/plugin.c
  ${CMARK_ROOT}/src/references.c
  ${CMARK_ROOT}/src/registry.c
  ${CMARK_ROOT}/src/render.c
  ${CMARK_ROOT}/src/scanners.c
  ${CMARK_ROOT}/src/syntax_extension.c
  ${CMARK_ROOT}/src/utf8.c
  ${CMARK_ROOT}/src/xml.c
  ${CMARK_ROOT}/extensions/autolink.c
  ${CMARK_ROOT}/extensions/core-extensions.c
  ${CMARK_ROOT}/extensions/ext_scanners.c
  ${CMARK_ROOT}/extensions/strikethrough.c
  ${CMARK_ROOT}/extensions/table.c
  ${CMARK_ROOT}/extensions/tagfilter.c
  ${CMARK_ROOT}/extensions/tasklist.c
)

add_library(qt_editor_cmark STATIC ${CMARK_SOURCES})
target_include_directories(qt_editor_cmark PUBLIC
  ${CMARK_ROOT}/src
  ${CMARK_ROOT}/extensions
  ${CMAKE_CURRENT_SOURCE_DIR}/cmark_include
)
target_compile_definitions(qt_editor_cmark PUBLIC
  CMARK_GFM_STATIC_DEFINE
  CMARK_GFM_EXTENSIONS_STATIC_DEFINE
)
set_target_properties(qt_editor_cmark PROPERTIES C_STANDARD 99 C_STANDARD_REQUIRED ON)

set(QT_EDITOR_SOURCES
  src/benchmark_options.cpp
  src/main_window.cpp
  src/markdown_pipeline.cpp
  src/preview_bridge.cpp
  src/sync_controller.cpp
)

add_library(qt_editor_core STATIC ${QT_EDITOR_SOURCES})
target_include_directories(qt_editor_core PUBLIC src ${QSCINTILLA_INCLUDE_DIR})
target_link_libraries(qt_editor_core PUBLIC
  Qt6::Core
  Qt6::Gui
  Qt6::Widgets
  Qt6::WebChannel
  Qt6::WebEngineWidgets
  qt_editor_cmark
  ${QSCINTILLA_LIBRARY}
)

add_executable(qt_editor src/main.cpp)
target_link_libraries(qt_editor PRIVATE qt_editor_core)

# Chromium-side renderers are copied beside the executable so they can be used
# by a real Web Worker. This keeps the prototype independent of Electron while
# reusing the exact versions already locked by the repository.
set(QT_EDITOR_WEB_DIR "${CMAKE_CURRENT_BINARY_DIR}/web")
file(MAKE_DIRECTORY "${QT_EDITOR_WEB_DIR}/vendor/katex/fonts")
configure_file(resources/preview.html "${QT_EDITOR_WEB_DIR}/preview.html" COPYONLY)
configure_file(resources/preview.css "${QT_EDITOR_WEB_DIR}/preview.css" COPYONLY)
configure_file(resources/preview.js "${QT_EDITOR_WEB_DIR}/preview.js" COPYONLY)
configure_file(resources/katex_worker.js "${QT_EDITOR_WEB_DIR}/katex_worker.js" COPYONLY)
configure_file(resources/mermaid_renderer.html "${QT_EDITOR_WEB_DIR}/mermaid_renderer.html" COPYONLY)
configure_file(resources/mermaid_renderer.js "${QT_EDITOR_WEB_DIR}/mermaid_renderer.js" COPYONLY)
configure_file(../../src/renderer/template/runtime/css/notable.css "${QT_EDITOR_WEB_DIR}/vendor/notable.css" COPYONLY)
configure_file(../../node_modules/katex/dist/katex.min.js "${QT_EDITOR_WEB_DIR}/vendor/katex/katex.min.js" COPYONLY)
configure_file(../../node_modules/katex/dist/katex.min.css "${QT_EDITOR_WEB_DIR}/vendor/katex/katex.min.css" COPYONLY)
configure_file(../../node_modules/mermaid/dist/mermaid.min.js "${QT_EDITOR_WEB_DIR}/vendor/mermaid.min.js" COPYONLY)
configure_file(../../node_modules/dompurify/dist/purify.min.js "${QT_EDITOR_WEB_DIR}/vendor/purify.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-core.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-core.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-markup.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-markup.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-css.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-css.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-clike.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-clike.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-javascript.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-javascript.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-typescript.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-typescript.min.js" COPYONLY)
configure_file(../../node_modules/prismjs/components/prism-python.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-python.min.js" COPYONLY)
file(COPY ../../node_modules/katex/dist/fonts/ DESTINATION "${QT_EDITOR_WEB_DIR}/vendor/katex/fonts")
target_compile_definitions(qt_editor_core PUBLIC QT_EDITOR_WEB_DIR="${QT_EDITOR_WEB_DIR}")

include(CTest)
if(BUILD_TESTING)
  add_executable(markdown_pipeline_tests tests/markdown_pipeline_test.cpp)
  target_link_libraries(markdown_pipeline_tests PRIVATE qt_editor_core Qt6::Test)
  add_test(NAME markdown_pipeline_tests COMMAND markdown_pipeline_tests)

  add_executable(sync_controller_tests tests/sync_controller_test.cpp)
  target_link_libraries(sync_controller_tests PRIVATE qt_editor_core Qt6::Test)
  add_test(NAME sync_controller_tests COMMAND sync_controller_tests)
  set_tests_properties(sync_controller_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endif()
