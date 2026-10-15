// Smoke test for the built main.js: it must load without the source tree and expose
// the same policy behaviour as src/policy.cjs. Obsidian and CodeMirror are stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('main.js loads standalone and exports the plugin class', () => {
 const code = fs.readFileSync(path.join(__dirname, 'dist', 'main.js'), 'utf8');
 assert.doesNotMatch(code, /require\("\.\/vendor/);
 assert.doesNotMatch(code, /POLICY_IMPLEMENTATION/);
 class Plugin {}
 const stubs = { obsidian: { Plugin, MarkdownView: class {}, editorInfoField: {}, parseYaml: () => ({}) },
  '@codemirror/state': {}, '@codemirror/view': { WidgetType: class {} } };
 const module = { exports: {} };
 const req = name => { if (!(name in stubs)) throw new Error('unexpected require ' + name); return stubs[name]; };
 vm.runInNewContext(code, { module, exports: module.exports, require: req, queueMicrotask }, { filename: 'dist/main.js' });
 assert.equal(typeof module.exports, 'function');
 assert.ok(module.exports.prototype instanceof Plugin);
});

function loadBundle(language = 'en') {
 const code = fs.readFileSync(path.join(__dirname, 'dist', 'main.js'), 'utf8');
 const obsidian = { Plugin: class {}, MarkdownView: class {}, editorInfoField: {}, parseYaml: () => ({}),
  getLanguage: () => language };
 const stubs = { obsidian, '@codemirror/state': {}, '@codemirror/view': { WidgetType: class {} } };
 const module = { exports: {} };
 vm.runInNewContext(code, { module, exports: module.exports, require: name => stubs[name], queueMicrotask },
  { filename: 'dist/main.js' });
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

test('package.cjs builds an installable, reproducible archive from dist/', () => {
 const { execFileSync } = require('node:child_process');
 const zlib = require('node:zlib');
 const dist = path.join(__dirname, 'dist');
 const archive = path.join(dist, 'runpad-markdown.zip');
 execFileSync(process.execPath, [path.join(__dirname, 'package.cjs')]);
 const zip = fs.readFileSync(archive);
 // Read the central directory and unpack every entry with zlib.
 const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
 const count = zip.readUInt16LE(end + 10);
 let at = zip.readUInt32LE(end + 16);
 const files = {};
 for (let i = 0; i < count; i++) {
  const nameLength = zip.readUInt16LE(at + 28), size = zip.readUInt32LE(at + 20), local = zip.readUInt32LE(at + 42);
  const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
  const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  files[name] = zlib.inflateRawSync(zip.subarray(dataStart, dataStart + size));
  at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
 }
 assert.deepEqual(Object.keys(files).sort(),
  ['runpad-markdown/main.js', 'runpad-markdown/manifest.json', 'runpad-markdown/styles.css']);
 for (const [name, data] of Object.entries(files))
  assert.ok(data.equals(fs.readFileSync(path.join(dist, path.basename(name)))), name);
 execFileSync(process.execPath, [path.join(__dirname, 'package.cjs')]);
 assert.ok(fs.readFileSync(archive).equals(zip), 'same input gives a byte-identical archive');
});
