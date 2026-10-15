"use strict";
// Plugin localization. Translations live in src/locales/<language>.json; build.cjs embeds
// them into the constant below at build time, so the plugin has no runtime file access or deps.
// en.json is the reference: every key must exist there and is the fallback for others.
const obsidian = require("obsidian");
const locales = LOCALES_IMPLEMENTATION;

// Keys whose text Obsidian itself already translates. Using Obsidian's string keeps the
// heading identical to the native Properties block in every app language. i18next is a
// runtime global, not a public API, so our own locale files remain the fallback.
const OBSIDIAN_KEYS = { "properties.heading": "properties.label-heading" };

function language() {
    try {
        // getLanguage() is public since Obsidian 1.8.7; older versions keep it in localStorage.
        return obsidian.getLanguage?.() || globalThis.localStorage?.getItem("language") || "en";
    } catch {
        return "en";
    }
}

function fromObsidian(key) {
    const obsidianKey = OBSIDIAN_KEYS[key];
    if (!obsidianKey) return undefined;
    try {
        const i18n = globalThis.i18next;
        if (i18n?.exists?.(obsidianKey)) return i18n.t(obsidianKey);
    } catch { /* use our own translation */ }
    return undefined;
}

// t("placeholder.title"); t("properties.aria-label", { heading, readOnly }) fills {{name}}.
function t(key, params = {}) {
    const code = language();
    const table = locales[code] || locales[code.split("-")[0]] || locales.en;
    const text = fromObsidian(key) ?? table[key] ?? locales.en[key] ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (match, name) => name in params ? String(params[name]) : match);
}

module.exports = { t, language, locales };
