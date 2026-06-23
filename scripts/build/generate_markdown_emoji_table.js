const fs = require ( 'fs' );
const path = require ( 'path' );

const root = path.resolve ( __dirname, '..', '..' );
const source = fs.readFileSync ( path.join ( root, 'src/common/emoji.ts' ), 'utf8' );
const entries = new Map ();
const entryRe = /^\s*(?:'([^']+)'|([a-zA-Z0-9_+\-]+)):\s*'([^']*)',?$/gm;

for ( let match; ( match = entryRe.exec ( source ) ); ) {
  entries.set ( ( match[1] || match[2] ).toLowerCase (), match[3] );
}

try {
  const gemoji = require ( 'gemoji' ).gemoji || require ( 'gemoji' );
  for ( const entry of gemoji ) {
    for ( const name of entry.names || [] ) entries.set ( String ( name ).toLowerCase (), String ( entry.emoji || '' ) );
  }
} catch {}

const sourceEntries = [...entries.entries ()]
  .filter (([, emoji]) => emoji )
  .sort (([left], [right]) => left.localeCompare ( right ) );
const hash = value => {
  let result = 2166136261;
  for ( const character of Buffer.from ( value, 'utf8' ) ) {
    result ^= character;
    result = Math.imul ( result, 16777619 ) >>> 0;
  }
  return result;
};
let capacity = 1;
while ( capacity < sourceEntries.length * 2 ) capacity <<= 1;
const table = Array.from ({ length: capacity }, () => undefined );
for ( const entry of sourceEntries ) {
  let index = hash ( entry[0] ) & ( capacity - 1 );
  while ( table[index] ) index = ( index + 1 ) & ( capacity - 1 );
  table[index] = entry;
}
const rows = table.map ( entry => entry ? `  {${JSON.stringify ( entry[0] )}, ${JSON.stringify ( entry[1] )}}` : '  {"", ""}' );
const output = `#pragma once\n#include <array>\n#include <cstdint>\n#include <string_view>\n\nnamespace markdown_native {\nstruct EmojiEntry { std::string_view name; std::string_view emoji; };\nconstexpr uint32_t EmojiHash ( std::string_view value ) {\n  uint32_t result = 2166136261u;\n  for ( const unsigned char character : value ) { result = ( result ^ character ) * 16777619u; }\n  return result;\n}\ninline constexpr std::array<EmojiEntry, ${capacity}> kEmojiEntries{{\n${rows.join ( ',\n' )}\n}};\n}\n`;
const destination = path.join ( root, 'native/markdown/generated/emoji_table.h' );

fs.mkdirSync ( path.dirname ( destination ), { recursive: true } );
fs.writeFileSync ( destination, output );
