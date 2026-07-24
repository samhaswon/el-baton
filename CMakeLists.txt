cmake_minimum_required(VERSION 3.22)

project(el_baton_native VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(EL_BATON_ENABLE_IPO "Enable interprocedural optimization in Release builds" ON)
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

include(CTest)
set(QT_EDITOR_BUILD_STANDALONE OFF CACHE BOOL "Build the isolated Qt editor executable")
add_subdirectory(experiments/qt_editor)
add_subdirectory(native)
