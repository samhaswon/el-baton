# Native fuzzing

The opt-in fuzz targets exercise untrusted-input boundaries with libFuzzer,
AddressSanitizer, and UndefinedBehaviorSanitizer. They never modify the source
workspace: file-based targets use a fresh `QTemporaryDir` for every input.

Configure a separate Clang build directory:

```sh
source .deps/qt-toolchain.env
cmake -S . -B build/fuzz -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_C_COMPILER=clang-18 \
  -DCMAKE_CXX_COMPILER=clang++-18 \
  -DEL_BATON_ENABLE_FUZZING=ON
cmake --build build/fuzz --target fuzzers
```

Run a bounded local smoke pass using the checked-in seed corpora:

```sh
ASAN_OPTIONS=detect_leaks=0 \
  build/fuzz/markdown_pipeline_fuzzer fuzz/corpus/markdown -max_total_time=60
ASAN_OPTIONS=detect_leaks=0 \
  build/fuzz/document_file_fuzzer fuzz/corpus/document -max_total_time=60
ASAN_OPTIONS=detect_leaks=0 \
  build/fuzz/enex_import_fuzzer fuzz/corpus/enex -max_total_time=60
```

Use longer, separately persisted corpus-growing jobs in nightly CI. On a crash,
commit the minimized reproducer as a regression test and, when appropriate, as
a corpus seed.
