#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPS_ROOT="${EL_BATON_CI_DEPS_ROOT:-${PROJECT_ROOT}/.ci-deps}"
readonly QT_PREFIX="${QT_ROOT_DIR:?QT_ROOT_DIR must point to the CI Qt installation}"
readonly QSCINTILLA_VERSION="2.14.1"
readonly ECM_VERSION="6.28.0"
readonly KSYNTAX_VERSION="6.28.1"
readonly PLANTUML_VERSION="1.2026.3"
readonly QSCINTILLA_SHA256="dfe13c6acc9d85dfcba76ccc8061e71a223957a6c02f3c343b30a9d43a4cdd4d"
readonly ECM_SHA256="a32e24b267e8528d0253bc8df18bdc00e676560a43b796533e1b1406f4eef4db"
readonly KSYNTAX_SHA256="fe0d4133af62c6b9c0cf7728928c64d2deb55fe808a264a5de871f4b6bc86f65"
readonly PLANTUML_SHA256="53af6760d96bb2737e5e4386e832b46339fc29dec74f412d7c12db7c30db8ec4"
readonly SOURCE_ROOT="${DEPS_ROOT}/sources"
readonly BUILD_ROOT="${DEPS_ROOT}/build"
readonly INSTALL_ROOT="${DEPS_ROOT}/install"

download() {
  local url="$1"
  local destination="$2"
  local checksum="$3"

  if [[ -f "${destination}" ]] &&
      [[ "$(shasum -a 256 "${destination}" | awk '{print $1}')" == "${checksum}" ]]; then
    return
  fi

  mkdir -p -- "$(dirname -- "${destination}")"
  curl --fail --location --retry 3 --output "${destination}.part" "${url}"
  if [[ "$(shasum -a 256 "${destination}.part" | awk '{print $1}')" != "${checksum}" ]]; then
    rm -f -- "${destination}.part"
    printf 'Checksum mismatch for %s\n' "${url}" >&2
    exit 1
  fi
  mv -- "${destination}.part" "${destination}"
}

mkdir -p -- "${SOURCE_ROOT}" "${BUILD_ROOT}" "${INSTALL_ROOT}"

qscintilla_archive="${SOURCE_ROOT}/QScintilla-${QSCINTILLA_VERSION}.tar.gz"
qscintilla_source="${SOURCE_ROOT}/QScintilla_src-${QSCINTILLA_VERSION}"
qscintilla_build="${BUILD_ROOT}/qscintilla-${QSCINTILLA_VERSION}"
download \
  "https://www.riverbankcomputing.com/static/Downloads/QScintilla/${QSCINTILLA_VERSION}/QScintilla_src-${QSCINTILLA_VERSION}.tar.gz" \
  "${qscintilla_archive}" \
  "${QSCINTILLA_SHA256}"
if [[ ! -f "${qscintilla_source}/src/qscintilla.pro" ]]; then
  tar -xzf "${qscintilla_archive}" -C "${SOURCE_ROOT}"
fi
if [[ ! -f "${qscintilla_build}/.complete" ]]; then
  rm -rf -- "${qscintilla_build}"
  mkdir -p -- "${qscintilla_build}"
  (
    cd -- "${qscintilla_build}"
    "${QT_PREFIX}/bin/qmake" "${qscintilla_source}/src/qscintilla.pro" CONFIG+=release
    make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)"
  )
  touch "${qscintilla_build}/.complete"
fi

qscintilla_library="$(find "${qscintilla_build}" -maxdepth 3 \
  \( -name 'libqscintilla2_qt6.so' -o -name 'libqscintilla2_qt6.dylib' \) \
  -print -quit)"
if [[ -z "${qscintilla_library}" ]]; then
  qscintilla_library="$(find "${qscintilla_build}" -maxdepth 3 \
    \( -name 'libqscintilla2_qt6.so.*' -o -name 'libqscintilla2_qt6.*.dylib' \) \
    -print -quit)"
fi
[[ -n "${qscintilla_library}" ]] || {
  printf 'QScintilla library not found in %s\n' "${qscintilla_build}" >&2
  exit 1
}

ecm_archive="${SOURCE_ROOT}/extra-cmake-modules-${ECM_VERSION}.tar.xz"
ecm_source="${SOURCE_ROOT}/extra-cmake-modules-${ECM_VERSION}"
ecm_build="${BUILD_ROOT}/ecm-${ECM_VERSION}"
ecm_prefix="${INSTALL_ROOT}/ecm-${ECM_VERSION}"
download \
  "https://download.kde.org/stable/frameworks/6.28/extra-cmake-modules-${ECM_VERSION}.tar.xz" \
  "${ecm_archive}" \
  "${ECM_SHA256}"
if [[ ! -f "${ecm_source}/CMakeLists.txt" ]]; then
  tar -xJf "${ecm_archive}" -C "${SOURCE_ROOT}"
fi
if [[ ! -f "${ecm_prefix}/share/ECM/cmake/ECMConfig.cmake" ]]; then
  cmake -S "${ecm_source}" -B "${ecm_build}" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${ecm_prefix}" \
    -DBUILD_TESTING=OFF
  cmake --build "${ecm_build}" --parallel
  cmake --install "${ecm_build}"
fi

ksyntax_archive="${SOURCE_ROOT}/syntax-highlighting-${KSYNTAX_VERSION}.tar.xz"
ksyntax_source="${SOURCE_ROOT}/syntax-highlighting-${KSYNTAX_VERSION}"
ksyntax_build="${BUILD_ROOT}/syntax-highlighting-${KSYNTAX_VERSION}"
ksyntax_prefix="${INSTALL_ROOT}/syntax-highlighting-${KSYNTAX_VERSION}"
download \
  "https://download.kde.org/stable/frameworks/6.28/syntax-highlighting-${KSYNTAX_VERSION}.tar.xz" \
  "${ksyntax_archive}" \
  "${KSYNTAX_SHA256}"
if [[ ! -f "${ksyntax_source}/CMakeLists.txt" ]]; then
  tar -xJf "${ksyntax_archive}" -C "${SOURCE_ROOT}"
fi
if [[ ! -f "${ksyntax_prefix}/lib/cmake/KF6SyntaxHighlighting/KF6SyntaxHighlightingConfig.cmake" ]]; then
  cmake -S "${ksyntax_source}" -B "${ksyntax_build}" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${ksyntax_prefix}" \
    "-DCMAKE_PREFIX_PATH=${QT_PREFIX};${ecm_prefix}" \
    -DBUILD_TESTING=OFF \
    -DCMAKE_DISABLE_FIND_PACKAGE_Qt6PrintSupport=ON \
    -DCMAKE_DISABLE_FIND_PACKAGE_Qt6Quick=ON \
    -DCMAKE_DISABLE_FIND_PACKAGE_Qt6Widgets=ON \
    -DKDE_INSTALL_LIBDIR=lib \
    -DKSYNTAXHIGHLIGHTING_USE_GUI=ON \
    -DNO_STANDARD_PATHS=ON \
    -DQRC_SYNTAX=ON
  cmake --build "${ksyntax_build}" --parallel
  cmake --install "${ksyntax_build}"
fi

plantuml_jar="${INSTALL_ROOT}/plantuml-${PLANTUML_VERSION}.jar"
download \
  "https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar" \
  "${plantuml_jar}" \
  "${PLANTUML_SHA256}"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    printf 'QSCINTILLA_INCLUDE_DIR=%s\n' "${qscintilla_source}/src"
    printf 'QSCINTILLA_LIBRARY=%s\n' "${qscintilla_library}"
    printf 'KF6SyntaxHighlighting_DIR=%s\n' \
      "${ksyntax_prefix}/lib/cmake/KF6SyntaxHighlighting"
    printf 'PLANTUML_JAR=%s\n' "${plantuml_jar}"
    printf 'EL_BATON_CI_LIBRARY_PATH=%s:%s\n' \
      "${qscintilla_build}" "${ksyntax_prefix}/lib"
  } >> "${GITHUB_ENV}"
else
  printf 'QSCINTILLA_INCLUDE_DIR=%q\n' "${qscintilla_source}/src"
  printf 'QSCINTILLA_LIBRARY=%q\n' "${qscintilla_library}"
  printf 'KF6SyntaxHighlighting_DIR=%q\n' \
    "${ksyntax_prefix}/lib/cmake/KF6SyntaxHighlighting"
  printf 'PLANTUML_JAR=%q\n' "${plantuml_jar}"
fi
