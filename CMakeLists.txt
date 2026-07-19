cmake_minimum_required(VERSION 3.22)

project(el_baton_native VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(CTest)
set(QT_EDITOR_BUILD_STANDALONE OFF CACHE BOOL "Build the isolated Qt editor executable")
add_subdirectory(experiments/qt_editor)
add_subdirectory(native)
