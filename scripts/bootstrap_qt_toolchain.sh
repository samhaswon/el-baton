#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"

QT_VERSION="6.10.3"
QSCINTILLA_VERSION="2.14.1"
PLANTUML_VERSION="1.2026.3"
DEPS_ROOT="${PROJECT_ROOT}/.deps"
QT_INSTALLER_PATH=""
FORCE_QSCINTILLA=0
SKIP_QT_INSTALL=0

# The Qt online installer URL is a moving alias. This checksum pins the
# Installer Framework 4.11.0 Linux x64 artifact published on 2026-03-11.
# Override both URL and checksum together when intentionally updating it.
QT_INSTALLER_URL="${QT_INSTALLER_URL:-https://download.qt.io/official_releases/online_installers/qt-online-installer-linux-x64-online.run}"
QT_INSTALLER_SHA256="${QT_INSTALLER_SHA256:-40b76bdf74f6a396341efb70ae2e754fcd878474babb6cd9d7f07eff12a85c62}"

QSCINTILLA_URL="${QSCINTILLA_URL:-https://www.riverbankcomputing.com/static/Downloads/QScintilla/2.14.1/QScintilla_src-2.14.1.tar.gz}"
QSCINTILLA_SHA256="${QSCINTILLA_SHA256:-dfe13c6acc9d85dfcba76ccc8061e71a223957a6c02f3c343b30a9d43a4cdd4d}"

# Pin the full GPL distribution from the upstream PlantUML release rather than
# the significantly older JAR bundled transitively by node-plantuml.
PLANTUML_URL="${PLANTUML_URL:-https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar}"
PLANTUML_SHA256="${PLANTUML_SHA256:-53af6760d96bb2737e5e4386e832b46339fc29dec74f412d7c12db7c30db8ec4}"

declare -a QT_COMPONENTS=()
declare -a QT_INSTALLER_ARGS=()

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap_qt_toolchain.sh [options]

Installs a project-local Qt toolchain and builds QScintilla against it. Nothing
is installed into /usr and no shell profile is modified. It also downloads a
checksum-verified PlantUML JAR for local diagram rendering.

Options:
  --qt-version VERSION          Qt version directory to use (default: 6.10.3)
  --deps-root PATH              Local dependency root (default: PROJECT/.deps)
  --qt-installer PATH           Use an existing Qt installer executable
  --qt-component COMPONENT     Installer component; repeat for multiple entries
  --qt-installer-arg=ARG        Extra installer argument; repeat as needed
  --skip-qt-install             Require Qt to exist; do not launch an installer
  --force-qscintilla            Rebuild the local QScintilla installation
  -h, --help                    Show this help

Default Qt installation is interactive so credentials and license acceptance
are never placed on a command line. In the installer select Qt 6.10.3 Desktop
GCC 64-bit with Qt WebEngine, Qt WebChannel, Qt SVG, and Qt Tools, using the
preselected project-local installation root.

For deliberate unattended use, pass explicit components and installer options,
for example:

  --qt-component COMPONENT \
  --qt-installer-arg=--accept-licenses \
  --qt-installer-arg=--accept-obligations \
  --qt-installer-arg=--default-answer \
  --qt-installer-arg=--confirm-command

Run the installer's `search` command to discover component identifiers for the
currently published repository. They are intentionally not guessed here.
EOF
}

log() {
  printf '[qt-bootstrap] %s\n' "$*"
}

die() {
  printf '[qt-bootstrap] error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

sha256_of() {
  sha256sum "$1" | awk '{print $1}'
}

download_verified() {
  local url="$1"
  local destination="$2"
  local expected_sha256="$3"
  local actual_sha256=""
  local partial="${destination}.part"

  if [[ -f "${destination}" ]]; then
    actual_sha256="$(sha256_of "${destination}")"
    if [[ "${actual_sha256}" == "${expected_sha256}" ]]; then
      log "using verified download ${destination}"
      return
    fi
    die "checksum mismatch for existing ${destination}; remove it or update the pinned checksum intentionally"
  fi

  rm -f -- "${partial}"
  log "downloading ${url}"
  curl --fail --location --retry 3 --output "${partial}" "${url}"
  actual_sha256="$(sha256_of "${partial}")"
  if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    rm -f -- "${partial}"
    die "checksum mismatch for ${url}: expected ${expected_sha256}, got ${actual_sha256}"
  fi
  mv -- "${partial}" "${destination}"
}

remove_generated_directory() {
  local target="$1"
  case "${target}" in
    "${DEPS_ROOT}"/*) rm -rf -- "${target}" ;;
    *) die "refusing to remove path outside the dependency root: ${target}" ;;
  esac
}

while (($#)); do
  case "$1" in
    --qt-version)
      (($# >= 2)) || die "--qt-version requires a value"
      QT_VERSION="$2"
      shift 2
      ;;
    --deps-root)
      (($# >= 2)) || die "--deps-root requires a value"
      DEPS_ROOT="$(realpath -m -- "$2")"
      shift 2
      ;;
    --qt-installer)
      (($# >= 2)) || die "--qt-installer requires a value"
      QT_INSTALLER_PATH="$(realpath -m -- "$2")"
      shift 2
      ;;
    --qt-component)
      (($# >= 2)) || die "--qt-component requires a value"
      QT_COMPONENTS+=("$2")
      shift 2
      ;;
    --qt-installer-arg=*)
      QT_INSTALLER_ARGS+=("${1#*=}")
      shift
      ;;
    --skip-qt-install)
      SKIP_QT_INSTALL=1
      shift
      ;;
    --force-qscintilla)
      FORCE_QSCINTILLA=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1 (use --help)"
      ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || die "this bootstrap currently supports Linux only"
[[ "$(uname -m)" == "x86_64" ]] || die "this bootstrap currently supports Linux x86_64 only"
[[ "${QT_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "invalid Qt version: ${QT_VERSION}"
[[ -n "${DEPS_ROOT}" && "${DEPS_ROOT}" != "/" && "${DEPS_ROOT}" != "${PROJECT_ROOT}" && "${DEPS_ROOT}" != "${HOME}" ]] \
  || die "unsafe dependency root: ${DEPS_ROOT}"

require_command awk
require_command curl
require_command make
require_command realpath
require_command sha256sum
require_command tar

readonly DOWNLOAD_DIR="${DEPS_ROOT}/downloads"
readonly SOURCE_DIR="${DEPS_ROOT}/sources"
readonly QT_INSTALL_ROOT="${DEPS_ROOT}/qt"
readonly QT_PREFIX="${QT_INSTALL_ROOT}/${QT_VERSION}/gcc_64"
readonly QSCINTILLA_ROOT="${DEPS_ROOT}/qscintilla/${QSCINTILLA_VERSION}"
readonly QSCINTILLA_ARCHIVE="${DOWNLOAD_DIR}/QScintilla_src-${QSCINTILLA_VERSION}.tar.gz"
readonly QSCINTILLA_SOURCE="${SOURCE_DIR}/QScintilla_src-${QSCINTILLA_VERSION}"
readonly QSCINTILLA_BUILD="${QSCINTILLA_ROOT}/build"
readonly QSCINTILLA_PREFIX="${QSCINTILLA_ROOT}/install"
readonly QSCINTILLA_STAMP="${QSCINTILLA_PREFIX}/.built-with-qt-${QT_VERSION}"
readonly PLANTUML_ROOT="${DEPS_ROOT}/plantuml/${PLANTUML_VERSION}"
readonly PLANTUML_JAR="${PLANTUML_ROOT}/plantuml.jar"
readonly ENV_FILE="${DEPS_ROOT}/qt-toolchain.env"
readonly CMAKE_TOOLCHAIN_FILE="${DEPS_ROOT}/qt-toolchain.cmake"

mkdir -p -- "${DOWNLOAD_DIR}" "${SOURCE_DIR}" "${QT_INSTALL_ROOT}"

validate_qt() {
  local qmake="${QT_PREFIX}/bin/qmake"
  local actual_version=""
  local module=""

  [[ -x "${qmake}" ]] || return 1
  actual_version="$(${qmake} -query QT_VERSION)"
  [[ "${actual_version}" == "${QT_VERSION}" ]] || die "${qmake} reports Qt ${actual_version}, expected ${QT_VERSION}"

  for module in Qt6 Qt6Svg Qt6Test Qt6WebChannel Qt6WebEngineCore Qt6WebEngineWidgets; do
    [[ -d "${QT_PREFIX}/lib/cmake/${module}" ]] || die "Qt ${QT_VERSION} is missing ${module}; rerun the Maintenance Tool and add the required module"
  done
}

install_qt() {
  local installer="${QT_INSTALLER_PATH}"
  local downloaded_installer="${DOWNLOAD_DIR}/qt-online-installer-linux-x64-online.run"
  declare -a command_args=()

  if ((SKIP_QT_INSTALL)); then
    die "Qt is not installed at ${QT_PREFIX} and --skip-qt-install was requested"
  fi

  if [[ -x "${QT_INSTALL_ROOT}/MaintenanceTool" ]]; then
    installer="${QT_INSTALL_ROOT}/MaintenanceTool"
    command_args+=("${QT_INSTALLER_ARGS[@]}")
  else
    if [[ -z "${installer}" ]]; then
      download_verified "${QT_INSTALLER_URL}" "${downloaded_installer}" "${QT_INSTALLER_SHA256}"
      chmod 700 -- "${downloaded_installer}"
      installer="${downloaded_installer}"
    fi
    [[ -x "${installer}" ]] || die "Qt installer is not executable: ${installer}"
    command_args+=(--root "${QT_INSTALL_ROOT}" "${QT_INSTALLER_ARGS[@]}")
  fi

  if ((${#QT_COMPONENTS[@]})); then
    log "running Qt installer for explicitly selected components"
    "${installer}" "${command_args[@]}" install "${QT_COMPONENTS[@]}"
  else
    cat <<EOF

The Qt installer will open interactively.

Installation root:
  ${QT_INSTALL_ROOT}

Select Qt ${QT_VERSION} Desktop GCC 64-bit and ensure these modules are present:
  Qt WebEngine, Qt WebChannel, Qt SVG, and Qt Tools.

Close the installer after installation completes; bootstrap will then validate
the result and build QScintilla.

EOF
    "${installer}" "${command_args[@]}"
  fi
}

if validate_qt; then
  log "found Qt ${QT_VERSION} at ${QT_PREFIX}"
else
  install_qt
  validate_qt || die "Qt installation did not create the expected prefix: ${QT_PREFIX}"
  log "validated Qt ${QT_VERSION} at ${QT_PREFIX}"
fi

build_qscintilla() {
  local jobs="${QSCINTILLA_JOBS:-}"
  local library_count=0
  local library_path=""

  if [[ -z "${jobs}" ]]; then
    if command -v nproc >/dev/null 2>&1; then
      jobs="$(nproc)"
    else
      jobs=2
    fi
  fi
  [[ "${jobs}" =~ ^[1-9][0-9]*$ ]] || die "QSCINTILLA_JOBS must be a positive integer"

  download_verified "${QSCINTILLA_URL}" "${QSCINTILLA_ARCHIVE}" "${QSCINTILLA_SHA256}"

  if ((FORCE_QSCINTILLA)); then
    [[ -d "${QSCINTILLA_BUILD}" ]] && remove_generated_directory "${QSCINTILLA_BUILD}"
    [[ -d "${QSCINTILLA_PREFIX}" ]] && remove_generated_directory "${QSCINTILLA_PREFIX}"
  fi

  if [[ ! -f "${QSCINTILLA_SOURCE}/src/qscintilla.pro" ]]; then
    [[ -d "${QSCINTILLA_SOURCE}" ]] && remove_generated_directory "${QSCINTILLA_SOURCE}"
    log "extracting QScintilla ${QSCINTILLA_VERSION}"
    tar -xzf "${QSCINTILLA_ARCHIVE}" -C "${SOURCE_DIR}"
  fi

  mkdir -p -- "${QSCINTILLA_BUILD}" "${QSCINTILLA_PREFIX}/include" "${QSCINTILLA_PREFIX}/lib"
  log "configuring QScintilla ${QSCINTILLA_VERSION} with Qt ${QT_VERSION}"
  (
    cd -- "${QSCINTILLA_BUILD}"
    "${QT_PREFIX}/bin/qmake" "${QSCINTILLA_SOURCE}/src/qscintilla.pro" CONFIG+=release
    make -j"${jobs}"
  )

  cp -a -- "${QSCINTILLA_SOURCE}/src/Qsci" "${QSCINTILLA_PREFIX}/include/"

  while IFS= read -r -d '' library_path; do
    cp -a -- "${library_path}" "${QSCINTILLA_PREFIX}/lib/"
    library_count=$((library_count + 1))
  done < <(find "${QSCINTILLA_BUILD}" -maxdepth 2 \( -type f -o -type l \) -name 'libqscintilla2_qt6.so*' -print0)

  ((library_count > 0)) || die "QScintilla build completed without producing libqscintilla2_qt6.so"
  printf 'QScintilla %s\nQt %s\nSource SHA-256 %s\n' \
    "${QSCINTILLA_VERSION}" "${QT_VERSION}" "${QSCINTILLA_SHA256}" > "${QSCINTILLA_STAMP}"
}

if [[ -f "${QSCINTILLA_STAMP}" && -f "${QSCINTILLA_PREFIX}/include/Qsci/qsciscintilla.h" && -e "${QSCINTILLA_PREFIX}/lib/libqscintilla2_qt6.so" && ${FORCE_QSCINTILLA} -eq 0 ]]; then
  log "using QScintilla ${QSCINTILLA_VERSION} from ${QSCINTILLA_PREFIX}"
else
  build_qscintilla
  log "built QScintilla ${QSCINTILLA_VERSION} at ${QSCINTILLA_PREFIX}"
fi

QSCINTILLA_LIBRARY="${QSCINTILLA_PREFIX}/lib/libqscintilla2_qt6.so"
[[ -e "${QSCINTILLA_LIBRARY}" ]] || die "missing unversioned QScintilla library: ${QSCINTILLA_LIBRARY}"

mkdir -p -- "${PLANTUML_ROOT}"
download_verified "${PLANTUML_URL}" "${PLANTUML_JAR}" "${PLANTUML_SHA256}"
log "using PlantUML ${PLANTUML_VERSION} from ${PLANTUML_JAR}"

{
  printf '# Generated by scripts/bootstrap_qt_toolchain.sh. Source this file.\n'
  printf 'export EL_BATON_DEPS_ROOT=%q\n' "${DEPS_ROOT}"
  printf 'export EL_BATON_QT_PREFIX=%q\n' "${QT_PREFIX}"
  printf 'export EL_BATON_QSCINTILLA_PREFIX=%q\n' "${QSCINTILLA_PREFIX}"
  printf 'export EL_BATON_PLANTUML_JAR=%q\n' "${PLANTUML_JAR}"
  printf 'export QSCINTILLA_ROOT=%q\n' "${QSCINTILLA_PREFIX}"
  printf 'export CMAKE_PREFIX_PATH=%q\n' "${QT_PREFIX}:${QSCINTILLA_PREFIX}"
  printf 'export PATH=%q:$PATH\n' "${QT_PREFIX}/bin"
  printf 'export LD_LIBRARY_PATH=%q:${LD_LIBRARY_PATH:-}\n' "${QSCINTILLA_PREFIX}/lib:${QT_PREFIX}/lib"
} > "${ENV_FILE}"

cat > "${CMAKE_TOOLCHAIN_FILE}" <<EOF
# Generated by scripts/bootstrap_qt_toolchain.sh.
list(PREPEND CMAKE_PREFIX_PATH
  "${QT_PREFIX}"
  "${QSCINTILLA_PREFIX}"
)
set(QT_HOST_PATH "${QT_PREFIX}" CACHE PATH "Project-local Qt host prefix")
set(QSCINTILLA_ROOT "${QSCINTILLA_PREFIX}" CACHE PATH "Project-local QScintilla prefix")
set(QSCINTILLA_INCLUDE_DIR "${QSCINTILLA_PREFIX}/include" CACHE PATH "QScintilla include directory")
set(QSCINTILLA_LIBRARY "${QSCINTILLA_LIBRARY}" CACHE FILEPATH "QScintilla library")
set(PLANTUML_JAR "${PLANTUML_JAR}" CACHE FILEPATH "Pinned local PlantUML executable JAR")
EOF

cat <<EOF

Local Qt toolchain is ready.

Qt:
  ${QT_PREFIX}

QScintilla:
  ${QSCINTILLA_PREFIX}

PlantUML:
  ${PLANTUML_JAR}

For the current shell:
  source "${ENV_FILE}"

Configure with the generated toolchain hints:
  "${QT_PREFIX}/bin/qt-cmake" -G Ninja \\
    -S "${PROJECT_ROOT}/experiments/qt_editor" \\
    -B "${PROJECT_ROOT}/build/qt-local" \\
    -C "${CMAKE_TOOLCHAIN_FILE}"

EOF
