// Smoke test for the built main.js: it must load without the source tree and expose
// the same policy behaviour as src/policy.cjs. Obsidian and CodeMirror are stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('main.js loads standalone and exports the plugin class', () => {
 const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
 assert.doesNotMatch(code, /require\("\.\/vendor/);
 assert.doesNotMatch(code, /POLICY_IMPLEMENTATION/);
 class Plugin {}
 const stubs = { obsidian: { Plugin, MarkdownView: class {}, editorInfoField: {}, parseYaml: () => ({}) },
  '@codemirror/state': {}, '@codemirror/view': { WidgetType: class {} } };
 const module = { exports: {} };
 const req = name => { if (!(name in stubs)) throw new Error('unexpected require ' + name); return stubs[name]; };
 vm.runInNewContext(code, { module, exports: module.exports, require: req, queueMicrotask }, { filename: 'main.js' });
 assert.equal(typeof module.exports, 'function');
 assert.ok(module.exports.prototype instanceof Plugin);
});

test('manifest.json and versions.json agree', () => {
 const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
 const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
 assert.equal(versions[manifest.version], manifest.minAppVersion);
});
