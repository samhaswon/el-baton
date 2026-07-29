cmake_minimum_required(VERSION 3.22)

project(el_baton VERSION 0.0.0 LANGUAGES C CXX)

include(GNUInstallDirs)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

option(EL_BATON_ENABLE_IPO "Enable interprocedural optimization in Release builds" ON)
option(EL_BATON_ENABLE_FUZZING "Build Clang/libFuzzer targets" OFF)
if(EL_BATON_ENABLE_IPO)
  include(CheckIPOSupported)
  check_ipo_supported(RESULT EL_BATON_IPO_SUPPORTED OUTPUT EL_BATON_IPO_ERROR LANGUAGES C CXX)
  if(EL_BATON_IPO_SUPPORTED)
    set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE ON)
    message(STATUS "El Baton Release interprocedural optimization enabled")
  else()
    message(WARNING "Release interprocedural optimization is unavailable: ${EL_BATON_IPO_ERROR}")
  endif()
endif()

if(EL_BATON_ENABLE_FUZZING AND
   (NOT CMAKE_C_COMPILER_ID STREQUAL "Clang" OR
    NOT CMAKE_CXX_COMPILER_ID STREQUAL "Clang"))
  message(FATAL_ERROR
    "EL_BATON_ENABLE_FUZZING requires Clang for both C and C++ (libFuzzer).")
endif()

find_package(Qt6 6.8 REQUIRED COMPONENTS Concurrent Core Gui Network PrintSupport Sql Widgets WebChannel WebEngineWidgets Test)
find_package(KF6SyntaxHighlighting 6.28 REQUIRED)
find_package(yaml-cpp REQUIRED)
find_package(ZLIB REQUIRED)
find_program(NODE_EXECUTABLE node REQUIRED)
if(TARGET yaml-cpp::yaml-cpp)
  set(YAML_CPP_TARGET yaml-cpp::yaml-cpp)
else()
  set(YAML_CPP_TARGET yaml-cpp)
endif()

find_package(unofficial-qscintilla CONFIG QUIET)
if(TARGET unofficial::qscintilla::qscintilla)
  set(QSCINTILLA_TARGET unofficial::qscintilla::qscintilla)
else()
  find_library(QSCINTILLA_LIBRARY NAMES qscintilla2_qt6 REQUIRED)
  find_path(QSCINTILLA_INCLUDE_DIR Qsci/qsciscintilla.h PATH_SUFFIXES qt6 REQUIRED)
  add_library(el_baton_qscintilla UNKNOWN IMPORTED)
  set_target_properties(el_baton_qscintilla PROPERTIES
    IMPORTED_LOCATION "${QSCINTILLA_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${QSCINTILLA_INCLUDE_DIR}"
    INTERFACE_LINK_LIBRARIES "Qt6::Widgets;Qt6::PrintSupport"
  )
  set(QSCINTILLA_TARGET el_baton_qscintilla)
endif()

find_package(unofficial-hunspell CONFIG QUIET)
find_package(hunspell CONFIG QUIET)
if(TARGET unofficial::hunspell::hunspell)
  set(HUNSPELL_TARGET unofficial::hunspell::hunspell)
elseif(TARGET Hunspell::Hunspell)
  set(HUNSPELL_TARGET Hunspell::Hunspell)
elseif(TARGET hunspell::hunspell)
  set(HUNSPELL_TARGET hunspell::hunspell)
else()
  if(WIN32 AND NOT PKG_CONFIG_EXECUTABLE)
    set(EL_BATON_VCPKG_INSTALLED_DIR "")
    if(VCPKG_INSTALLED_DIR)
      set(EL_BATON_VCPKG_INSTALLED_DIR "${VCPKG_INSTALLED_DIR}")
    elseif(_VCPKG_INSTALLED_DIR)
      set(EL_BATON_VCPKG_INSTALLED_DIR "${_VCPKG_INSTALLED_DIR}")
    endif()

    if(EL_BATON_VCPKG_INSTALLED_DIR)
      set(EL_BATON_PKGCONF_HINTS "")
      foreach(EL_BATON_VCPKG_TRIPLET
          "${VCPKG_HOST_TRIPLET}"
          "${VCPKG_TARGET_TRIPLET}")
        if(EL_BATON_VCPKG_TRIPLET)
          list(APPEND EL_BATON_PKGCONF_HINTS
            "${EL_BATON_VCPKG_INSTALLED_DIR}/${EL_BATON_VCPKG_TRIPLET}/tools/pkgconf")
        endif()
      endforeach()
      find_program(PKG_CONFIG_EXECUTABLE
        NAMES pkgconf pkg-config
        HINTS ${EL_BATON_PKGCONF_HINTS})
    endif()
  endif()
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(HUNSPELL REQUIRED IMPORTED_TARGET hunspell)
  set(HUNSPELL_TARGET PkgConfig::HUNSPELL)
endif()

set(PLANTUML_JAR "$ENV{EL_BATON_PLANTUML_JAR}" CACHE FILEPATH "Pinned local PlantUML executable JAR")
if(NOT PLANTUML_JAR)
  set(PLANTUML_JAR "${CMAKE_CURRENT_SOURCE_DIR}/.deps/plantuml/1.2026.3/plantuml.jar")
endif()
if(NOT EXISTS "${PLANTUML_JAR}")
  message(FATAL_ERROR "PlantUML JAR not found. Run scripts/bootstrap_qt_toolchain.sh first or set PLANTUML_JAR.")
endif()

set(CMARK_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/third_party/cmark-gfm")
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

add_library(el_baton_cmark STATIC ${CMARK_SOURCES})
target_include_directories(el_baton_cmark PUBLIC
  ${CMARK_ROOT}/src
  ${CMARK_ROOT}/extensions
  ${CMAKE_CURRENT_SOURCE_DIR}/cmake/cmark_include
)
target_compile_definitions(el_baton_cmark PUBLIC
  CMARK_GFM_STATIC_DEFINE
  CMARK_GFM_EXTENSIONS_STATIC_DEFINE
)
set_target_properties(el_baton_cmark PROPERTIES C_STANDARD 99 C_STANDARD_REQUIRED ON)

add_library(el_baton_build_options INTERFACE)
target_compile_options(el_baton_build_options INTERFACE
  $<$<AND:$<CONFIG:Release>,$<COMPILE_LANG_AND_ID:CXX,MSVC>>:
    /Qpar
  >
  $<$<COMPILE_LANG_AND_ID:CXX,GNU,Clang,AppleClang>:
    -Wall
    -Wextra
    -Wpedantic
    -Wcast-qual
    -Wcast-align
    -Wnull-dereference
    -Wimplicit-fallthrough
    -Wnon-virtual-dtor
    -Wundef
    -Wshadow
    -Wformat=2
    -Wformat-security
    -fno-omit-frame-pointer
  >
  $<$<COMPILE_LANG_AND_ID:CXX,GNU>:
    -Wuseless-cast
  >
  $<$<COMPILE_LANG_AND_ID:CXX,MSVC>:
    /W4
    /permissive-
  >
  $<$<AND:$<CONFIG:Debug>,$<COMPILE_LANG_AND_ID:C,CXX,GNU,Clang,AppleClang>>:
    -fsanitize=address,undefined
  >
  $<$<AND:$<CONFIG:Release>,$<COMPILE_LANG_AND_ID:C,CXX,GNU,Clang>>:
    -fstack-protector-strong
    -fstack-clash-protection
    -D_FORTIFY_SOURCE=3
    -fPIE
  >
  $<$<AND:$<CONFIG:Release>,$<COMPILE_LANG_AND_ID:C,CXX,MSVC>>:
    /guard:cf
    /sdl
  >
)
target_link_options(el_baton_build_options INTERFACE
  $<$<AND:$<CONFIG:Debug>,$<LINK_LANG_AND_ID:CXX,GNU,Clang,AppleClang>>:
    -fsanitize=address,undefined
  >
  $<$<AND:$<CONFIG:Release>,$<LINK_LANG_AND_ID:CXX,GNU,Clang>>:
    -pie
    -Wl,-z,relro,-z,now,-z,noexecstack
  >
  $<$<AND:$<CONFIG:Release>,$<LINK_LANG_AND_ID:CXX,MSVC>>:
    /guard:cf
  >
)

# Keep third-party cmark free from the project's warning policy, while still
# instrumenting it in Debug so parser memory/undefined-behavior bugs are
# observable under the same sanitizers as native code.
target_compile_options(el_baton_cmark PRIVATE
  $<$<AND:$<CONFIG:Debug>,$<COMPILE_LANG_AND_ID:C,CXX,GNU,Clang,AppleClang>>:
    -fsanitize=address,undefined
  >
  $<$<AND:$<CONFIG:Release>,$<COMPILE_LANG_AND_ID:C,CXX,GNU,Clang>>:
    -fstack-protector-strong
    -fstack-clash-protection
    -D_FORTIFY_SOURCE=3
    -fPIE
  >
  $<$<AND:$<CONFIG:Release>,$<COMPILE_LANG_AND_ID:C,CXX,MSVC>>:
    /guard:cf
    /sdl
  >
)

# QtWebEngine's bundled Chromium 134 has a third-party Mojo allocation/deletion
# mismatch during startup. Apply the ASan runtime exception only to GUI
# executables; tests intentionally retain the complete detector set.
function(el_baton_enable_webengine_asan_workaround target)
  target_sources(${target} PRIVATE
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/src/webengine_asan_options.cpp"
  )
  target_compile_definitions(${target} PRIVATE
    $<$<AND:$<CONFIG:Debug>,$<CXX_COMPILER_ID:GNU,Clang,AppleClang>>:
      QT_EDITOR_WEBENGINE_ASAN_WORKAROUND
    >
  )
endfunction()

set(EL_BATON_SOURCES
  resources/preview/reference_icons.qrc
  src/application_paths.cpp
  src/benchmark_options.cpp
  src/document_file.cpp
  src/global_config_store.cpp
  src/main_window.cpp
  src/markdown_completion.cpp
  src/markdown_edits.cpp
  src/markdown_pipeline.cpp
  src/markdown_syntax_lexer.cpp
  src/note_transfer_service.cpp
  src/plantuml_renderer.cpp
  src/persistent_diagram_cache.cpp
  src/preview_bridge.cpp
  src/reference_icons.cpp
  src/settings_store.cpp
  src/spell_checker.cpp
  src/sync_controller.cpp
  src/workspace_repository.cpp
  src/workspace_graph_view.cpp
  src/workspace_watcher.cpp
)

set(QT_EDITOR_EMOJI_JSON "${CMAKE_CURRENT_BINARY_DIR}/generated/emoji-shortcodes.json")
set(QT_EDITOR_CHEATSHEET_MARKDOWN "${CMAKE_CURRENT_BINARY_DIR}/generated/cheatsheet.md")
add_custom_command(
  OUTPUT "${QT_EDITOR_EMOJI_JSON}"
  COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_qt_emoji_map.mjs"
          "${QT_EDITOR_EMOJI_JSON}"
  DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_qt_emoji_map.mjs"
    "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/gemoji/index.js"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  VERBATIM
)
add_custom_target(el_baton_emoji_data DEPENDS "${QT_EDITOR_EMOJI_JSON}")

add_custom_command(
  OUTPUT "${QT_EDITOR_CHEATSHEET_MARKDOWN}"
  COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_qt_cheatsheet.mjs"
          "${QT_EDITOR_CHEATSHEET_MARKDOWN}"
  DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_qt_cheatsheet.mjs"
    "${CMAKE_CURRENT_SOURCE_DIR}/reference/src/common/emoji.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/reference/src/renderer/components/main/mainbar/cheatsheet_content.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/typescript/lib/typescript.js"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  VERBATIM
)
add_custom_target(el_baton_cheatsheet_data DEPENDS "${QT_EDITOR_CHEATSHEET_MARKDOWN}")

add_library(el_baton_core STATIC ${EL_BATON_SOURCES})
add_dependencies(el_baton_core el_baton_emoji_data el_baton_cheatsheet_data)
target_include_directories(el_baton_core PUBLIC src)
target_link_libraries(el_baton_core PUBLIC
  el_baton_build_options
  Qt6::Core
  Qt6::Concurrent
  Qt6::Gui
  Qt6::Network
  Qt6::Sql
  Qt6::Widgets
  Qt6::WebChannel
  Qt6::WebEngineWidgets
  KF6::SyntaxHighlighting
  el_baton_cmark
  ${YAML_CPP_TARGET}
  ZLIB::ZLIB
  ${HUNSPELL_TARGET}
  ${QSCINTILLA_TARGET}
)

if(EL_BATON_ENABLE_FUZZING)
  add_library(el_baton_fuzz_instrumentation INTERFACE)
  target_compile_options(el_baton_fuzz_instrumentation INTERFACE
    -fsanitize=fuzzer-no-link,address,undefined
    -fno-omit-frame-pointer
  )
  target_link_options(el_baton_fuzz_instrumentation INTERFACE
    -fsanitize=fuzzer,address,undefined
  )

  # Instrument the native parser and the bundled C parser. The fuzzer runtime
  # itself is linked only into fuzz executables, never the application.
  target_link_libraries(el_baton_core PRIVATE el_baton_fuzz_instrumentation)
  target_link_libraries(el_baton_cmark PRIVATE el_baton_fuzz_instrumentation)

  function(el_baton_add_fuzzer target source)
    add_executable(${target} EXCLUDE_FROM_ALL ${source})
    target_link_libraries(${target} PRIVATE
      el_baton_core
      el_baton_fuzz_instrumentation
    )
  endfunction()

  el_baton_add_fuzzer(markdown_pipeline_fuzzer
    fuzz/markdown_pipeline_fuzzer.cpp)
  el_baton_add_fuzzer(document_file_fuzzer
    fuzz/document_file_fuzzer.cpp)
  el_baton_add_fuzzer(enex_import_fuzzer
    fuzz/enex_import_fuzzer.cpp)
  add_custom_target(fuzzers DEPENDS
    markdown_pipeline_fuzzer
    document_file_fuzzer
    enex_import_fuzzer
  )
endif()

qt_add_executable(el-baton src/main.cpp)
target_link_libraries(el-baton PRIVATE el_baton_core)
el_baton_enable_webengine_asan_workaround(el-baton)
set_target_properties(el-baton PROPERTIES
  OUTPUT_NAME "el-baton"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
  MACOSX_BUNDLE TRUE
  MACOSX_BUNDLE_BUNDLE_NAME "El Baton"
  MACOSX_BUNDLE_GUI_IDENTIFIER "com.elbaton.app"
  QT_QML_MODULE_NO_IMPORT_SCAN TRUE
)
if(UNIX AND NOT APPLE)
  set_property(TARGET el-baton PROPERTY INSTALL_RPATH "\$ORIGIN/../${CMAKE_INSTALL_LIBDIR}")
endif()

# Chromium-side renderers are copied into the build tree so they can be used by
# a real Web Worker. Node supplies build-time assets only; the native
# application does not launch Node at runtime.
set(QT_EDITOR_WEB_DIR "${CMAKE_CURRENT_BINARY_DIR}/web")
file(MAKE_DIRECTORY "${QT_EDITOR_WEB_DIR}/vendor/katex/fonts")
configure_file(resources/preview/preview.html "${QT_EDITOR_WEB_DIR}/preview.html" COPYONLY)
configure_file(resources/preview/preview.css "${QT_EDITOR_WEB_DIR}/preview.css" COPYONLY)
configure_file(resources/preview/preview.js "${QT_EDITOR_WEB_DIR}/preview.js" COPYONLY)
configure_file(resources/preview/katex_worker.js "${QT_EDITOR_WEB_DIR}/katex_worker.js" COPYONLY)
configure_file(resources/preview/mermaid_renderer.html "${QT_EDITOR_WEB_DIR}/mermaid_renderer.html" COPYONLY)
configure_file(resources/preview/mermaid_renderer.js "${QT_EDITOR_WEB_DIR}/mermaid_renderer.js" COPYONLY)
configure_file("${PLANTUML_JAR}" "${CMAKE_CURRENT_BINARY_DIR}/plantuml.jar" COPYONLY)
configure_file(resources/preview/notable.css "${QT_EDITOR_WEB_DIR}/vendor/notable.css" COPYONLY)
configure_file(node_modules/katex/dist/katex.min.js "${QT_EDITOR_WEB_DIR}/vendor/katex/katex.min.js" COPYONLY)
configure_file(node_modules/katex/dist/contrib/mhchem.min.js "${QT_EDITOR_WEB_DIR}/vendor/katex/mhchem.min.js" COPYONLY)
configure_file(node_modules/katex/dist/katex.min.css "${QT_EDITOR_WEB_DIR}/vendor/katex/katex.min.css" COPYONLY)
configure_file(node_modules/mermaid/dist/mermaid.min.js "${QT_EDITOR_WEB_DIR}/vendor/mermaid.min.js" COPYONLY)
configure_file(node_modules/dompurify/dist/purify.min.js "${QT_EDITOR_WEB_DIR}/vendor/purify.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-core.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-core.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-markup.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-markup.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-css.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-css.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-clike.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-clike.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-javascript.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-javascript.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-typescript.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-typescript.min.js" COPYONLY)
configure_file(node_modules/prismjs/components/prism-python.min.js "${QT_EDITOR_WEB_DIR}/vendor/prism-python.min.js" COPYONLY)
file(COPY node_modules/katex/dist/fonts/ DESTINATION "${QT_EDITOR_WEB_DIR}/vendor/katex/fonts")
target_compile_definitions(el_baton_core PUBLIC QT_EDITOR_WEB_DIR="${QT_EDITOR_WEB_DIR}")
target_compile_definitions(el_baton_core PRIVATE QT_EDITOR_EMOJI_JSON="${QT_EDITOR_EMOJI_JSON}")
target_compile_definitions(el_baton_core PRIVATE QT_EDITOR_CHEATSHEET_MARKDOWN="${QT_EDITOR_CHEATSHEET_MARKDOWN}")
target_compile_definitions(el_baton_core PUBLIC QT_EDITOR_PLANTUML_JAR="${CMAKE_CURRENT_BINARY_DIR}/plantuml.jar")

install(TARGETS el-baton
  BUNDLE DESTINATION .
  RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}"
)

if(APPLE)
  set(EL_BATON_DATA_DESTINATION "el-baton.app/Contents/Resources")
elseif(WIN32)
  set(EL_BATON_DATA_DESTINATION "${CMAKE_INSTALL_BINDIR}")
else()
  set(EL_BATON_DATA_DESTINATION "${CMAKE_INSTALL_DATADIR}/el-baton")
endif()

install(DIRECTORY "${QT_EDITOR_WEB_DIR}/"
  DESTINATION "${EL_BATON_DATA_DESTINATION}/web"
)
install(FILES
  "${QT_EDITOR_EMOJI_JSON}"
  "${QT_EDITOR_CHEATSHEET_MARKDOWN}"
  "${CMAKE_CURRENT_BINARY_DIR}/plantuml.jar"
  DESTINATION "${EL_BATON_DATA_DESTINATION}"
)

if(UNIX AND NOT APPLE)
  install(FILES resources/packaging/el-baton.desktop
    DESTINATION "${CMAKE_INSTALL_DATADIR}/applications")
  foreach(icon_size IN ITEMS 16 24 32 48 64 96 128 256 512 1024)
    install(FILES "resources/icon/${icon_size}x${icon_size}.png"
      DESTINATION "${CMAKE_INSTALL_DATADIR}/icons/hicolor/${icon_size}x${icon_size}/apps"
      RENAME el-baton.png)
  endforeach()
endif()

qt_generate_deploy_app_script(
  TARGET el-baton
  OUTPUT_SCRIPT EL_BATON_DEPLOY_SCRIPT
  NO_UNSUPPORTED_PLATFORM_ERROR
)
install(SCRIPT "${EL_BATON_DEPLOY_SCRIPT}")

set(CPACK_PACKAGE_NAME "el-baton")
set(CPACK_PACKAGE_VENDOR "El Baton")
set(CPACK_PACKAGE_CONTACT "Samuel Howard")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Markdown-based knowledge and note editor")
set(CPACK_PACKAGE_DESCRIPTION
  "El Baton is a native Qt Markdown knowledge and note editor.")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_FILE_NAME
  "${CPACK_PACKAGE_NAME}-${CPACK_PACKAGE_VERSION}-${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}")
set(CPACK_PACKAGE_DIRECTORY "${CMAKE_BINARY_DIR}/packages")
set(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_CURRENT_SOURCE_DIR}/LICENSE")
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT)
set(CPACK_DEBIAN_PACKAGE_SECTION "editors")
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS OFF)
set(CPACK_DEBIAN_PACKAGE_DEPENDS
  "libc6, libstdc++6, libhunspell-1.7-0, libminizip1t64, libyaml-cpp0.8, zlib1g")
set(CPACK_RPM_FILE_NAME RPM-DEFAULT)
set(CPACK_RPM_PACKAGE_LICENSE "AGPL-3.0-or-later")
set(CPACK_RPM_PACKAGE_GROUP "Applications/Editors")
include(CPack)

include(CTest)
if(BUILD_TESTING)
  add_executable(application_paths_tests tests/application_paths_test.cpp)
  target_link_libraries(application_paths_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME application_paths_tests COMMAND application_paths_tests)

  add_executable(markdown_pipeline_tests tests/markdown_pipeline_test.cpp)
  target_link_libraries(markdown_pipeline_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME markdown_pipeline_tests COMMAND markdown_pipeline_tests)

  add_executable(sync_controller_tests tests/sync_controller_test.cpp)
  target_link_libraries(sync_controller_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME sync_controller_tests COMMAND sync_controller_tests)
  set_tests_properties(sync_controller_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

  add_executable(document_file_tests tests/document_file_test.cpp)
  target_link_libraries(document_file_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME document_file_tests COMMAND document_file_tests)

  add_executable(data_sources_tests tests/data_sources_test.cpp)
  target_link_libraries(data_sources_tests PRIVATE el_baton_core Qt6::Test)
  # Keep a durable QtTest log because Windows CI can produce an empty CTest
  # output record for failed QtTest executables.
  add_test(NAME data_sources_tests COMMAND data_sources_tests
    -o "${CMAKE_BINARY_DIR}/Testing/Temporary/data_sources_tests.txt,txt")

  add_executable(note_transfer_service_tests tests/note_transfer_service_test.cpp)
  target_link_libraries(note_transfer_service_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME note_transfer_service_tests COMMAND note_transfer_service_tests)

  add_executable(workspace_watcher_tests tests/workspace_watcher_test.cpp)
  target_link_libraries(workspace_watcher_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME workspace_watcher_tests COMMAND workspace_watcher_tests
    -o "${CMAKE_BINARY_DIR}/Testing/Temporary/workspace_watcher_tests.txt,txt")

  add_executable(markdown_edits_tests tests/markdown_edits_test.cpp)
  target_link_libraries(markdown_edits_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME markdown_edits_tests COMMAND markdown_edits_tests)

  add_executable(markdown_completion_tests tests/markdown_completion_test.cpp)
  target_link_libraries(markdown_completion_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME markdown_completion_tests COMMAND markdown_completion_tests)

  add_executable(markdown_syntax_lexer_tests tests/markdown_syntax_lexer_test.cpp)
  target_link_libraries(markdown_syntax_lexer_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME markdown_syntax_lexer_tests COMMAND markdown_syntax_lexer_tests)
  set_tests_properties(markdown_syntax_lexer_tests PROPERTIES
    ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

  add_executable(plantuml_renderer_tests tests/plantuml_renderer_test.cpp)
  target_link_libraries(plantuml_renderer_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME plantuml_renderer_tests COMMAND plantuml_renderer_tests)

  add_executable(persistent_diagram_cache_tests tests/persistent_diagram_cache_test.cpp)
  target_link_libraries(persistent_diagram_cache_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME persistent_diagram_cache_tests COMMAND persistent_diagram_cache_tests)

  add_executable(spell_checker_tests tests/spell_checker_test.cpp)
  target_link_libraries(spell_checker_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME spell_checker_tests COMMAND spell_checker_tests)

  add_executable(reference_icons_tests tests/reference_icons_test.cpp)
  target_link_libraries(reference_icons_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME reference_icons_tests COMMAND reference_icons_tests)

  add_executable(cheatsheet_content_tests tests/cheatsheet_content_test.cpp)
  target_compile_definitions(cheatsheet_content_tests PRIVATE
    QT_EDITOR_CHEATSHEET_MARKDOWN="${QT_EDITOR_CHEATSHEET_MARKDOWN}")
  target_link_libraries(cheatsheet_content_tests PRIVATE el_baton_core Qt6::Test)
  add_test(NAME cheatsheet_content_tests COMMAND cheatsheet_content_tests)

  add_test(NAME katex_worker_tests
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/katex_worker_test.mjs"
            "${QT_EDITOR_WEB_DIR}")
endif()
