{
  "targets": [
    {
      "target_name": "markdown_native",
      "sources": [
        "markdown_native.cc",
        "../../third_party/cmark-gfm/src/arena.c",
        "../../third_party/cmark-gfm/src/blocks.c",
        "../../third_party/cmark-gfm/src/buffer.c",
        "../../third_party/cmark-gfm/src/cmark.c",
        "../../third_party/cmark-gfm/src/cmark_ctype.c",
        "../../third_party/cmark-gfm/src/commonmark.c",
        "../../third_party/cmark-gfm/src/footnotes.c",
        "../../third_party/cmark-gfm/src/houdini_href_e.c",
        "../../third_party/cmark-gfm/src/houdini_html_e.c",
        "../../third_party/cmark-gfm/src/houdini_html_u.c",
        "../../third_party/cmark-gfm/src/html.c",
        "../../third_party/cmark-gfm/src/inlines.c",
        "../../third_party/cmark-gfm/src/iterator.c",
        "../../third_party/cmark-gfm/src/latex.c",
        "../../third_party/cmark-gfm/src/linked_list.c",
        "../../third_party/cmark-gfm/src/man.c",
        "../../third_party/cmark-gfm/src/map.c",
        "../../third_party/cmark-gfm/src/node.c",
        "../../third_party/cmark-gfm/src/plaintext.c",
        "../../third_party/cmark-gfm/src/plugin.c",
        "../../third_party/cmark-gfm/src/references.c",
        "../../third_party/cmark-gfm/src/registry.c",
        "../../third_party/cmark-gfm/src/render.c",
        "../../third_party/cmark-gfm/src/scanners.c",
        "../../third_party/cmark-gfm/src/syntax_extension.c",
        "../../third_party/cmark-gfm/src/utf8.c",
        "../../third_party/cmark-gfm/src/xml.c",
        "../../third_party/cmark-gfm/extensions/autolink.c",
        "../../third_party/cmark-gfm/extensions/core-extensions.c",
        "../../third_party/cmark-gfm/extensions/ext_scanners.c",
        "../../third_party/cmark-gfm/extensions/strikethrough.c",
        "../../third_party/cmark-gfm/extensions/table.c",
        "../../third_party/cmark-gfm/extensions/tagfilter.c",
        "../../third_party/cmark-gfm/extensions/tasklist.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include",
        "generated",
        "../../third_party/cmark-gfm/src",
        "../../third_party/cmark-gfm/extensions"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "CMARK_GFM_STATIC_DEFINE",
        "CMARK_GFM_EXTENSIONS_STATIC_DEFINE"
      ],
      "cflags_c": [ "-std=c99" ],
      "cflags_cc": [ "-std=c++20" ],
      "conditions": [
        ["OS=='win'", {
          "win_delay_load_hook": "true",
          "msvs_settings": {
            "VCCLCompilerTool": { "AdditionalOptions": [ "/O2", "/GL", "/Qpar" ] },
            "VCLinkerTool": { "AdditionalOptions": [ "/LTCG" ] }
          }
        }, {
          "cflags": [ "-O3", "-flto" ],
          "cflags_cc": [ "-O3", "-flto" ],
          "ldflags": [ "-flto" ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
            "GCC_OPTIMIZATION_LEVEL": "3",
            "LLVM_LTO": "YES_THIN"
          }
        }]
      ]
    }
  ]
}
