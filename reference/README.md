# Retained Electron reference

This directory contains the former Electron/TypeScript implementation. It
remains in Git temporarily as a behavioral and test-fixture reference while the
native Qt application reaches parity.

The production sources, build, and CI now live at the repository root:

- `../src/` — native C++ application
- `../tests/` — Qt Test and preview JavaScript tests
- `../resources/preview/` — native preview assets
- `../CMakeLists.txt` — primary build
- `../package.json` — build-time JavaScript assets only

`package.json` and `package-lock.json` in this directory preserve the old
Electron dependency graph. Native CI intentionally does not install or build
them. Some shared icons and demo fixtures remain in the root `resources/`
directory because the native application consumes them directly.
