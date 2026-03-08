/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import PlantUML from '../../src/common/plantuml';

/* TESTS */

test ( 'plantuml normalizeSource: wraps plain source with startuml/enduml', () => {

  const source = 'Alice -> Bob : hello',
        normalized = PlantUML.normalizeSource ( source );

  assert.equal ( normalized, '@startuml\nAlice -> Bob : hello\n@enduml' );

} );

test ( 'plantuml normalizeSource: keeps already wrapped source as-is', () => {

  const source = '@startuml\nAlice -> Bob : hello\n@enduml';

  assert.equal ( PlantUML.normalizeSource ( source ), source );

} );

test ( 'plantuml normalizeSource: appends missing end marker that matches the start marker', () => {

  const source = '@startmindmap\n* Root';

  assert.equal ( PlantUML.normalizeSource ( source ), '@startmindmap\n* Root\n@endmindmap' );

} );

test ( 'plantuml normalizeSource: prepends missing start marker that matches the end marker', () => {

  const source = 'Alice -> Bob : hello\n@enduml';

  assert.equal ( PlantUML.normalizeSource ( source ), '@startuml\nAlice -> Bob : hello\n@enduml' );

} );

test ( 'plantuml graphviz detection: recognizes missing Graphviz errors from dot output', () => {

  const message = 'Dot Executable: /opt/local/bin/dot\nFile does not exist\nCannot find Graphviz.';

  assert.equal ( PlantUML.isGraphvizMissingError ( message ), true );
  assert.equal ( PlantUML.normalizeLocalError ( message ), 'Graphviz is required for local PlantUML rendering but was not found.' );
  assert.equal ( PlantUML.getErrorHelpUrl ( message, 'local' ), 'https://www.graphviz.org/download/' );

} );

test ( 'plantuml remote URL builder: appends /svg when missing', () => {

  const url = PlantUML.buildRemoteSvgUrl ( 'https://plantuml.example.com/plantuml', 'ENCODED' );

  assert.equal ( url, 'https://plantuml.example.com/plantuml/svg/ENCODED' );

} );

test ( 'plantuml remote URL builder: does not duplicate /svg when already present', () => {

  const url = PlantUML.buildRemoteSvgUrl ( 'https://plantuml.example.com/plantuml/svg', 'ENCODED' );

  assert.equal ( url, 'https://plantuml.example.com/plantuml/svg/ENCODED' );

} );

test ( 'plantuml remote URL builder: replaces sample payload when URL already points to /svg/<payload>', () => {

  const url = PlantUML.buildRemoteSvgUrl ( 'https://plantuml.example.com/plantuml/svg/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000', 'ENCODED' );

  assert.equal ( url, 'https://plantuml.example.com/plantuml/svg/ENCODED' );

} );
