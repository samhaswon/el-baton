"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const plantuml_1 = require("../../src/common/plantuml");
/* TESTS */
(0, node_test_1.test)('plantuml normalizeSource: wraps plain source with startuml/enduml', () => {
    const source = 'Alice -> Bob : hello', normalized = plantuml_1.default.normalizeSource(source);
    assert.equal(normalized, '@startuml\nAlice -> Bob : hello\n@enduml');
});
(0, node_test_1.test)('plantuml normalizeSource: keeps already wrapped source as-is', () => {
    const source = '@startuml\nAlice -> Bob : hello\n@enduml';
    assert.equal(plantuml_1.default.normalizeSource(source), source);
});
(0, node_test_1.test)('plantuml normalizeSource: appends missing end marker that matches the start marker', () => {
    const source = '@startmindmap\n* Root';
    assert.equal(plantuml_1.default.normalizeSource(source), '@startmindmap\n* Root\n@endmindmap');
});
(0, node_test_1.test)('plantuml normalizeSource: prepends missing start marker that matches the end marker', () => {
    const source = 'Alice -> Bob : hello\n@enduml';
    assert.equal(plantuml_1.default.normalizeSource(source), '@startuml\nAlice -> Bob : hello\n@enduml');
});
(0, node_test_1.test)('plantuml graphviz detection: recognizes missing Graphviz errors from dot output', () => {
    const message = 'Dot Executable: /opt/local/bin/dot\nFile does not exist\nCannot find Graphviz.';
    assert.equal(plantuml_1.default.isGraphvizMissingError(message), true);
    assert.equal(plantuml_1.default.normalizeLocalError(message), 'Graphviz is required for local PlantUML rendering but was not found.');
    assert.equal(plantuml_1.default.getErrorHelpUrl(message, 'local'), 'https://www.graphviz.org/download/');
});
(0, node_test_1.test)('plantuml remote URL builder: appends /svg when missing', () => {
    const url = plantuml_1.default.buildRemoteSvgUrl('https://plantuml.example.com/plantuml', 'ENCODED');
    assert.equal(url, 'https://plantuml.example.com/plantuml/svg/ENCODED');
});
(0, node_test_1.test)('plantuml remote URL builder: does not duplicate /svg when already present', () => {
    const url = plantuml_1.default.buildRemoteSvgUrl('https://plantuml.example.com/plantuml/svg', 'ENCODED');
    assert.equal(url, 'https://plantuml.example.com/plantuml/svg/ENCODED');
});
(0, node_test_1.test)('plantuml remote URL builder: replaces sample payload when URL already points to /svg/<payload>', () => {
    const url = plantuml_1.default.buildRemoteSvgUrl('https://plantuml.example.com/plantuml/svg/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000', 'ENCODED');
    assert.equal(url, 'https://plantuml.example.com/plantuml/svg/ENCODED');
});
