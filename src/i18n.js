"use strict";
// Plugin localization. Translations live in src/locales/<language>.json, named with the
// language codes Obsidian uses (https://github.com/obsidianmd/obsidian-translations).
// build.cjs embeds them into the constant below, so there are no runtime file reads.
// en.json is the reference: every key must exist there, and it is the final fallback.
const { getLanguage } = require("obsidian");
const locales = LOCALES_IMPLEMENTATION;

// Resolve Obsidian's language to one of our locales: exact code ("pt-BR", "zh-TW"),
// then its base language ("en-GB" -> "en"), then English.
function resolveLocale(code) {
    if (locales[code]) return code;
    const base = String(code).split("-")[0];
    return locales[base] ? base : "en";
}

// t("placeholder.title"); t("properties.aria-label", { heading, readOnly }) fills {{name}}.
function t(key, params = {}) {
    const text = locales[resolveLocale(getLanguage())][key] ?? locales.en[key] ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (match, name) => name in params ? String(params[name]) : match);
}

module.exports = { t, resolveLocale };
