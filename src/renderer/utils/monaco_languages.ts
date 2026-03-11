/* IMPORT */

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

/* TYPES */

type MonacoLanguageModule = {
  conf: monaco.languages.LanguageConfiguration,
  language: monaco.languages.IMonarchLanguage
};

type MonacoLanguageLoader = () => MonacoLanguageModule;

/* CONSTANTS */

const BASIC_LANGUAGE_LOADERS: Record<string, MonacoLanguageLoader> = {
  abap: () => require ( 'monaco-editor/esm/vs/basic-languages/abap/abap.js' ),
  apex: () => require ( 'monaco-editor/esm/vs/basic-languages/apex/apex.js' ),
  azcli: () => require ( 'monaco-editor/esm/vs/basic-languages/azcli/azcli.js' ),
  bat: () => require ( 'monaco-editor/esm/vs/basic-languages/bat/bat.js' ),
  bicep: () => require ( 'monaco-editor/esm/vs/basic-languages/bicep/bicep.js' ),
  cameligo: () => require ( 'monaco-editor/esm/vs/basic-languages/cameligo/cameligo.js' ),
  clojure: () => require ( 'monaco-editor/esm/vs/basic-languages/clojure/clojure.js' ),
  coffee: () => require ( 'monaco-editor/esm/vs/basic-languages/coffee/coffee.js' ),
  cpp: () => require ( 'monaco-editor/esm/vs/basic-languages/cpp/cpp.js' ),
  csharp: () => require ( 'monaco-editor/esm/vs/basic-languages/csharp/csharp.js' ),
  csp: () => require ( 'monaco-editor/esm/vs/basic-languages/csp/csp.js' ),
  css: () => require ( 'monaco-editor/esm/vs/basic-languages/css/css.js' ),
  cypher: () => require ( 'monaco-editor/esm/vs/basic-languages/cypher/cypher.js' ),
  dart: () => require ( 'monaco-editor/esm/vs/basic-languages/dart/dart.js' ),
  dockerfile: () => require ( 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.js' ),
  ecl: () => require ( 'monaco-editor/esm/vs/basic-languages/ecl/ecl.js' ),
  elixir: () => require ( 'monaco-editor/esm/vs/basic-languages/elixir/elixir.js' ),
  flow9: () => require ( 'monaco-editor/esm/vs/basic-languages/flow9/flow9.js' ),
  freemarker2: () => require ( 'monaco-editor/esm/vs/basic-languages/freemarker2/freemarker2.js' ),
  fsharp: () => require ( 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp.js' ),
  go: () => require ( 'monaco-editor/esm/vs/basic-languages/go/go.js' ),
  graphql: () => require ( 'monaco-editor/esm/vs/basic-languages/graphql/graphql.js' ),
  handlebars: () => require ( 'monaco-editor/esm/vs/basic-languages/handlebars/handlebars.js' ),
  hcl: () => require ( 'monaco-editor/esm/vs/basic-languages/hcl/hcl.js' ),
  html: () => require ( 'monaco-editor/esm/vs/basic-languages/html/html.js' ),
  ini: () => require ( 'monaco-editor/esm/vs/basic-languages/ini/ini.js' ),
  java: () => require ( 'monaco-editor/esm/vs/basic-languages/java/java.js' ),
  javascript: () => require ( 'monaco-editor/esm/vs/basic-languages/javascript/javascript.js' ),
  julia: () => require ( 'monaco-editor/esm/vs/basic-languages/julia/julia.js' ),
  kotlin: () => require ( 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.js' ),
  less: () => require ( 'monaco-editor/esm/vs/basic-languages/less/less.js' ),
  lexon: () => require ( 'monaco-editor/esm/vs/basic-languages/lexon/lexon.js' ),
  liquid: () => require ( 'monaco-editor/esm/vs/basic-languages/liquid/liquid.js' ),
  lua: () => require ( 'monaco-editor/esm/vs/basic-languages/lua/lua.js' ),
  m3: () => require ( 'monaco-editor/esm/vs/basic-languages/m3/m3.js' ),
  markdown: () => require ( 'monaco-editor/esm/vs/basic-languages/markdown/markdown.js' ),
  mdx: () => require ( 'monaco-editor/esm/vs/basic-languages/mdx/mdx.js' ),
  mips: () => require ( 'monaco-editor/esm/vs/basic-languages/mips/mips.js' ),
  msdax: () => require ( 'monaco-editor/esm/vs/basic-languages/msdax/msdax.js' ),
  mysql: () => require ( 'monaco-editor/esm/vs/basic-languages/mysql/mysql.js' ),
  'objective-c': () => require ( 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.js' ),
  pascal: () => require ( 'monaco-editor/esm/vs/basic-languages/pascal/pascal.js' ),
  pascaligo: () => require ( 'monaco-editor/esm/vs/basic-languages/pascaligo/pascaligo.js' ),
  perl: () => require ( 'monaco-editor/esm/vs/basic-languages/perl/perl.js' ),
  pgsql: () => require ( 'monaco-editor/esm/vs/basic-languages/pgsql/pgsql.js' ),
  php: () => require ( 'monaco-editor/esm/vs/basic-languages/php/php.js' ),
  pla: () => require ( 'monaco-editor/esm/vs/basic-languages/pla/pla.js' ),
  postiats: () => require ( 'monaco-editor/esm/vs/basic-languages/postiats/postiats.js' ),
  powerquery: () => require ( 'monaco-editor/esm/vs/basic-languages/powerquery/powerquery.js' ),
  powershell: () => require ( 'monaco-editor/esm/vs/basic-languages/powershell/powershell.js' ),
  protobuf: () => require ( 'monaco-editor/esm/vs/basic-languages/protobuf/protobuf.js' ),
  pug: () => require ( 'monaco-editor/esm/vs/basic-languages/pug/pug.js' ),
  python: () => require ( 'monaco-editor/esm/vs/basic-languages/python/python.js' ),
  qsharp: () => require ( 'monaco-editor/esm/vs/basic-languages/qsharp/qsharp.js' ),
  r: () => require ( 'monaco-editor/esm/vs/basic-languages/r/r.js' ),
  razor: () => require ( 'monaco-editor/esm/vs/basic-languages/razor/razor.js' ),
  redis: () => require ( 'monaco-editor/esm/vs/basic-languages/redis/redis.js' ),
  redshift: () => require ( 'monaco-editor/esm/vs/basic-languages/redshift/redshift.js' ),
  restructuredtext: () => require ( 'monaco-editor/esm/vs/basic-languages/restructuredtext/restructuredtext.js' ),
  ruby: () => require ( 'monaco-editor/esm/vs/basic-languages/ruby/ruby.js' ),
  rust: () => require ( 'monaco-editor/esm/vs/basic-languages/rust/rust.js' ),
  sb: () => require ( 'monaco-editor/esm/vs/basic-languages/sb/sb.js' ),
  scala: () => require ( 'monaco-editor/esm/vs/basic-languages/scala/scala.js' ),
  scheme: () => require ( 'monaco-editor/esm/vs/basic-languages/scheme/scheme.js' ),
  scss: () => require ( 'monaco-editor/esm/vs/basic-languages/scss/scss.js' ),
  shell: () => require ( 'monaco-editor/esm/vs/basic-languages/shell/shell.js' ),
  solidity: () => require ( 'monaco-editor/esm/vs/basic-languages/solidity/solidity.js' ),
  sophia: () => require ( 'monaco-editor/esm/vs/basic-languages/sophia/sophia.js' ),
  sparql: () => require ( 'monaco-editor/esm/vs/basic-languages/sparql/sparql.js' ),
  sql: () => require ( 'monaco-editor/esm/vs/basic-languages/sql/sql.js' ),
  st: () => require ( 'monaco-editor/esm/vs/basic-languages/st/st.js' ),
  swift: () => require ( 'monaco-editor/esm/vs/basic-languages/swift/swift.js' ),
  systemverilog: () => require ( 'monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog.js' ),
  tcl: () => require ( 'monaco-editor/esm/vs/basic-languages/tcl/tcl.js' ),
  twig: () => require ( 'monaco-editor/esm/vs/basic-languages/twig/twig.js' ),
  typescript: () => require ( 'monaco-editor/esm/vs/basic-languages/typescript/typescript.js' ),
  typespec: () => require ( 'monaco-editor/esm/vs/basic-languages/typespec/typespec.js' ),
  vb: () => require ( 'monaco-editor/esm/vs/basic-languages/vb/vb.js' ),
  wgsl: () => require ( 'monaco-editor/esm/vs/basic-languages/wgsl/wgsl.js' ),
  xml: () => require ( 'monaco-editor/esm/vs/basic-languages/xml/xml.js' ),
  yaml: () => require ( 'monaco-editor/esm/vs/basic-languages/yaml/yaml.js' )
};

const BASIC_LANGUAGE_IDS = Object.keys ( BASIC_LANGUAGE_LOADERS );
const ensuredLanguages = new Set<string> ();

/* MONACO LANGUAGES */

const MonacoLanguages = {

  ids: BASIC_LANGUAGE_IDS,

  async ensure ( language: string ): Promise<boolean> {

    const normalized = String ( language || '' ).trim ().toLowerCase ();

    if ( !normalized ) return false;

    if ( ensuredLanguages.has ( normalized ) ) return true;

    const loader = BASIC_LANGUAGE_LOADERS[normalized];

    if ( !loader ) {
      return monaco.languages.getLanguages ().some ( entry => entry.id === normalized );
    }

    try {
      const module = loader ();
      if ( !module?.language || !module?.conf ) return false;

      if ( !monaco.languages.getLanguages ().some ( entry => entry.id === normalized ) ) {
        monaco.languages.register ({ id: normalized });
      }

      monaco.languages.setMonarchTokensProvider ( normalized, module.language );
      monaco.languages.setLanguageConfiguration ( normalized, module.conf );

      ensuredLanguages.add ( normalized );

      return true;
    } catch ( error ) {
      return false;
    }

  }

};

/* EXPORT */

export default MonacoLanguages;
