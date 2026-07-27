// Qt 6.10.3 bundles Chromium 134.0.6998.208. Its MojoMessage byte buffer is
// allocated with operator new(variable_size), but owned by unique_ptr<uint8_t>.
// GCC's AddressSanitizer consequently reports a sized scalar-delete mismatch
// during QtWebEngine startup, before application code creates the preview.
//
// Keep this default on GUI executables only. Native unit-test executables do
// not link this file and therefore retain ASan's new/delete type check.
#if defined(QT_EDITOR_WEBENGINE_ASAN_WORKAROUND)
extern "C" const char* __asan_default_options() {
  return "new_delete_type_mismatch=0";
}
#endif
