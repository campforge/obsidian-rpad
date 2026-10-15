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

function loadBundle(language = 'en') {
 const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
 const obsidian = { Plugin: class {}, MarkdownView: class {}, editorInfoField: {}, parseYaml: () => ({}),
  getLanguage: () => language };
 const stubs = { obsidian, '@codemirror/state': {}, '@codemirror/view': { WidgetType: class {} } };
 const module = { exports: {} };
 vm.runInNewContext(code, { module, exports: module.exports, require: name => stubs[name], queueMicrotask },
  { filename: 'main.js' });
 return module.exports.localize;
}

test('strings follow the Obsidian language', () => {
 assert.equal(loadBundle('ru')('properties.heading'), 'Свойства');
 assert.equal(loadBundle('de')('properties.heading'), 'Eigenschaften');
 assert.equal(loadBundle('zh-TW')('placeholder.title'), '標題');
 assert.equal(loadBundle('zh')('placeholder.title'), '标题');
 assert.equal(loadBundle('pt-BR')('properties.read-only'), 'somente leitura');
 assert.equal(loadBundle('pt')('properties.read-only'), 'só de leitura');
});

test('regional and unknown languages fall back to the base language, then English', () => {
 assert.equal(loadBundle('en-GB')('placeholder.title'), 'Title');
 assert.equal(loadBundle('de-AT')('placeholder.title'), 'Titel');
 assert.equal(loadBundle('kk')('placeholder.title'), 'Title');
 assert.equal(loadBundle('ru')('missing.key'), 'missing.key');
});

test('placeholders are interpolated', () => {
 const t = loadBundle('ru');
 assert.equal(t('properties.aria-label', { heading: 'Свойства', readOnly: 'только для чтения' }),
  'RunPad: Свойства, только для чтения');
 assert.equal(t('properties.aria-label', { heading: 'X' }), 'RunPad: X, {{readOnly}}');
});

test('manifest.json and versions.json agree', () => {
 const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
 const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
 assert.equal(versions[manifest.version], manifest.minAppVersion);
});
