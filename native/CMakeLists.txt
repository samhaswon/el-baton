find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Network Sql Test WebChannel WebEngineWidgets Widgets)

qt_standard_project_setup()

add_library(el_baton_native_core STATIC
  src/application_paths.cpp
  src/application_paths.h
)
target_link_libraries(el_baton_native_core PUBLIC Qt6::Core qt_editor_build_options)
target_include_directories(el_baton_native_core PUBLIC src)

qt_add_executable(el-baton
  src/main.cpp
)
qt_editor_enable_webengine_asan_workaround(el-baton)
target_link_libraries(el-baton PRIVATE
  el_baton_native_core
  qt_editor_core
  Qt6::Gui
  Qt6::Widgets
)

set_target_properties(el-baton PROPERTIES
  OUTPUT_NAME "el-baton"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

if(BUILD_TESTING)
  qt_add_executable(application_paths_tests
    tests/application_paths_test.cpp
  )
  target_link_libraries(application_paths_tests PRIVATE
    el_baton_native_core
    Qt6::Test
  )
  add_test(NAME application_paths_tests COMMAND application_paths_tests)
endif()
