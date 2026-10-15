// Bundles src/ into main.js (no dependencies) and syncs versions.json with manifest.json.
// manifest.json is the single source of truth for the plugin version and minAppVersion.
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const read = file => fs.readFileSync(path.join(dir, file), 'utf8');

// Replace exactly one occurrence of `target`. A function replacer is used so that `$1`, `$&`,
// `$'` etc. inside the inserted source are not treated as replacement patterns.
function replaceOnce(source, target, replacement, file) {
    const count = source.split(target).length - 1;
    if (count !== 1) throw new Error(`build: expected exactly one ${JSON.stringify(target)} in ${file}, found ${count}`);
    return source.replace(target, () => replacement);
}

const commonmark = read('src/vendor/commonmark.js');
let policy = read('src/policy.cjs');
policy = replaceOnce(policy, 'require("./vendor/commonmark.js")',
    '(() => { const module = { exports: {} }; const exports = module.exports;\n' + commonmark + '\nreturn module.exports; })()',
    'src/policy.cjs');
policy = replaceOnce(policy, 'module.exports = { inspect, canChange, fenceTextRanges, sections, documentationCodeBlocks };',
    'return { inspect, canChange, fenceTextRanges, sections, documentationCodeBlocks };', 'src/policy.cjs');
// Locales: every src/locales/<language>.json is embedded; en.json is the required reference.
const localesDir = path.join(dir, 'src/locales');
const locales = {};
for (const file of fs.readdirSync(localesDir).filter(name => name.endsWith('.json')).sort()) {
    try {
        locales[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    } catch (error) {
        throw new Error(`build: src/locales/${file} is not valid JSON: ${error.message}`);
    }
}
if (!locales.en) throw new Error('build: src/locales/en.json is required');
const i18n = replaceOnce(read('src/i18n.js'), 'LOCALES_IMPLEMENTATION', JSON.stringify(locales, null, 4), 'src/i18n.js');
const asModule = source => '(() => { const module = { exports: {} }; const exports = module.exports;\n' + source + '\nreturn module.exports; })()';

let plugin = replaceOnce(read('src/plugin.js'), 'POLICY_IMPLEMENTATION', '(() => {\n' + policy + '\n})()', 'src/plugin.js');
plugin = replaceOnce(plugin, 'I18N_IMPLEMENTATION', asModule(i18n), 'src/plugin.js');
fs.writeFileSync(path.join(dir, 'main.js'), plugin);

const manifest = JSON.parse(read('manifest.json'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) throw new Error('build: manifest.json has no valid "version"');
if (!manifest.minAppVersion) throw new Error('build: manifest.json has no "minAppVersion"');
const versionsFile = path.join(dir, 'versions.json');
const versions = fs.existsSync(versionsFile) ? JSON.parse(fs.readFileSync(versionsFile, 'utf8')) : {};
if (versions[manifest.version] !== manifest.minAppVersion) {
    versions[manifest.version] = manifest.minAppVersion;
    fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 4) + '\n');
}
console.log(`Built main.js for ${manifest.name} ${manifest.version} (Obsidian ${manifest.minAppVersion}+)`);
