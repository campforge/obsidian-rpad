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

function loadBundle({ i18next, getLanguage, language } = {}) {
 const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
 const obsidian = { Plugin: class {}, MarkdownView: class {}, editorInfoField: {}, parseYaml: () => ({}) };
 if (getLanguage) obsidian.getLanguage = getLanguage;
 const stubs = { obsidian, '@codemirror/state': {}, '@codemirror/view': { WidgetType: class {} } };
 const module = { exports: {} };
 const localStorage = { getItem: key => key === 'language' ? language ?? null : null };
 vm.runInNewContext(code, { module, exports: module.exports, require: name => stubs[name], queueMicrotask,
  i18next, localStorage }, { filename: 'main.js' });
 return module.exports.localize;
}

test('Properties heading comes from Obsidian translations, then from our locales', () => {
 const i18next = { exists: key => key === 'properties.label-heading', t: () => 'Eigenschaften' };
 assert.equal(loadBundle({ i18next, getLanguage: () => 'de' })('properties.heading'), 'Eigenschaften');
 // No i18next (or it throws): our own file for the app language, then English.
 assert.equal(loadBundle({ getLanguage: () => 'ru' })('properties.heading'), 'Свойства');
 assert.equal(loadBundle()('properties.heading'), 'Properties');
 const broken = { exists: () => { throw new Error('boom'); } };
 assert.equal(loadBundle({ i18next: broken, getLanguage: () => 'ru' })('properties.heading'), 'Свойства');
});

test('plugin strings follow the Obsidian language, defaulting to English', () => {
 assert.equal(loadBundle({ getLanguage: () => 'ru' })('placeholder.title'), 'Название');
 assert.equal(loadBundle({ getLanguage: () => 'en-GB' })('placeholder.title'), 'Title');
 assert.equal(loadBundle({ getLanguage: () => 'pt-BR' })('placeholder.description'), 'Description — Markdown, lists, links');
 // Obsidian before 1.8.7 has no getLanguage(); the language is in localStorage.
 assert.equal(loadBundle({ language: 'ru' })('placeholder.documentation'), 'Дополнительная документация');
 assert.equal(loadBundle()('missing.key'), 'missing.key');
});

test('placeholders are interpolated', () => {
 const t = loadBundle({ getLanguage: () => 'ru' });
 assert.equal(t('properties.aria-label', { heading: 'Свойства', readOnly: 'только чтение' }), 'RunPad: Свойства, только чтение');
 assert.equal(t('properties.aria-label', { heading: 'X' }), 'RunPad: X, {{readOnly}}');
});

test('manifest.json and versions.json agree', () => {
 const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
 const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
 assert.equal(versions[manifest.version], manifest.minAppVersion);
});
