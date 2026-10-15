// Checks the translation files in src/locales against the reference en.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'src/locales');
const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const en = read('en.json');
const placeholders = text => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
const usedKeys = [...fs.readFileSync(path.join(__dirname, 'src/plugin.js'), 'utf8')
    .matchAll(/\bt\("([^"]+)"/g)].map(m => m[1]);

test('every key used in src/plugin.js exists in en.json', () => {
    for (const key of usedKeys) assert.ok(key in en, key);
});

for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
    test(`${file}: same keys as en.json, non-empty, same {{placeholders}}`, () => {
        const locale = read(file);
        assert.deepEqual(Object.keys(locale).sort(), Object.keys(en).sort());
        for (const [key, value] of Object.entries(locale)) {
            assert.equal(typeof value, 'string', key);
            assert.ok(value.trim(), `${file}: ${key} is empty`);
            assert.deepEqual(placeholders(value), placeholders(en[key]), `${file}: ${key}`);
        }
    });
}
