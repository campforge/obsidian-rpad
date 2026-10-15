"use strict";
const { Plugin, MarkdownView, editorInfoField, parseYaml } = require("obsidian");
const { EditorState, StateField, Transaction } = require("@codemirror/state");
const { Decoration, EditorView, WidgetType } = require("@codemirror/view");
const policy = POLICY_IMPLEMENTATION;
const { t } = I18N_IMPLEMENTATION;

class RunPadMarkdown extends Plugin {
    onload() {
        this.registerExtensions(["rpad"], "markdown");
        this.tracked = new Set();
        this.observers = new Map();
        // Preserve native code-block line layout. Replacing whole fence lines merges visual
        // lines and disrupts Obsidian's first-code-line styling, padding and font selection.
        class EmptySection extends WidgetType {
            constructor(label, position, text, caretOffset) {
                super(); Object.assign(this, { label, position, text, caretOffset });
            }
            eq(other) { return this.label === other.label && this.position === other.position; }
            toDOM(view) {
                const button = view.dom.ownerDocument.createElement("button");
                button.className = "runpad-section-placeholder";
                button.textContent = this.label;
                button.type = "button";
                button.addEventListener("click", () => {
                    view.dispatch({ changes: { from: this.position, insert: this.text },
                        selection: { anchor: this.position + this.caretOffset },
                        userEvent: "input" });
                    view.focus();
                });
                return button;
            }
            ignoreEvent() { return true; }
        }
        const fenceDecorations = state => {
            const info = state.field(editorInfoField, false);
            if (info?.file?.extension?.toLowerCase() !== "rpad") return Decoration.none;
            const text = state.doc.toString();
            const parsed = policy.inspect(text);
            const ranges = policy.fenceTextRanges(text, parsed);
            const decorations = ranges.map(({ from, to }) =>
                Decoration.mark({ class: "runpad-fence-text" }).range(from, to));
            const parts = policy.sections(text, parsed);
            if (parts) {
                const eol = text.includes("\r\n") ? "\r\n" : "\n";
                const decorateTextBlock = (part, kind) => {
                    const first = state.doc.lineAt(part.from).number;
                    const last = state.doc.lineAt(Math.max(part.from, part.to - 1)).number;
                    for (let number = first; number <= last; number++) {
                        const line = state.doc.line(number);
                        decorations.push(Decoration.line({ attributes: {
                            class: "runpad-markdown-block runpad-markdown-" + kind
                                + (number === first ? " runpad-block-first" : "")
                                + (number === last ? " runpad-block-last" : "")
                        } }).range(line.from));
                    }
                };
                const reserveLine = (position, label, empty, kind) => {
                    const line = state.doc.lineAt(position);
                    decorations.push(Decoration.line({ attributes: {
                        class: "runpad-pinned-section runpad-section-" + kind + (empty ? " runpad-section-empty" : ""),
                        "data-placeholder": label
                    } }).range(line.from));
                };
                if (parts.title) reserveLine(parts.title.from, t("placeholder.title"), parts.title.empty, "title");
                else decorations.push(Decoration.widget({ block: true, side: -1,
                    widget: new EmptySection(t("placeholder.title"), parsed.locks[0].to,
                        "# " + eol + eol, 2) }).range(parsed.locks[0].to));
                if (parts.intro.from < parts.intro.to) {
                    decorateTextBlock(parts.intro, "intro");
                    reserveLine(parts.intro.from, t("placeholder.description"), parts.intro.empty, "intro");
                } else {
                    decorations.push(Decoration.widget({ block: true, side: -1,
                        widget: new EmptySection(t("placeholder.description"), parts.intro.from, eol, 0)
                    }).range(parts.intro.from));
                }
                if (parts.outro.from === state.doc.lineAt(parts.outro.from).from) {
                    decorateTextBlock(parts.outro, "outro");
                    reserveLine(parts.outro.from, t("placeholder.documentation"), parts.outro.empty, "outro");
                } else {
                    decorations.push(Decoration.widget({ block: true, side: 1,
                        widget: new EmptySection(t("placeholder.documentation"), text.length, eol, eol.length)
                    }).range(text.length));
                }
            }
            return Decoration.set(decorations, true);
        };
        // Decorations depend only on the text and the file, not on the selection, so
        // recompute them only when one of those changes. The file is part of the key because
        // editorInfoField may not be populated yet when the state is first created.
        const fileKey = state => state.field(editorInfoField, false)?.file?.path ?? null;
        const computeDecorations = state => ({ key: fileKey(state), decorations: fenceDecorations(state) });
        this.registerEditorExtension(StateField.define({
            create: computeDecorations,
            update: (value, transaction) => !transaction.docChanged && fileKey(transaction.state) === value.key
                ? value : computeDecorations(transaction.state),
            provide: field => EditorView.decorations.from(field, value => value.decorations)
        }));
        this.registerEditorExtension(EditorState.changeFilter.of(tr => {
            const info = tr.startState.field(editorInfoField, false);
            if (!tr.docChanged || info?.file?.extension?.toLowerCase() !== "rpad") return true;
            // File reloads are authoritative; only guard editor edits, never roll back external files.
            if (tr.annotation(Transaction.remote)) return true;
            // Obsidian may populate a newly created editor with an unannotated transaction.
            if (tr.startState.doc.length === 0 && !tr.annotation(Transaction.userEvent)
                && policy.inspect(tr.newDoc.toString())) return true;
            const changes = [];
            tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => changes.push({ from, to, insertLength: inserted.length }));
            const allowed = policy.canChange(tr.startState.doc.toString(), tr.newDoc.toString(), changes);
            return allowed;
        }));
        const refresh = () => this.scheduleRefresh();
        this.registerEvent(this.app.workspace.on("layout-change", refresh));
        this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
        this.registerEvent(this.app.workspace.on("file-open", refresh));
        this.registerEvent(this.app.workspace.on("editor-change", refresh));
        this.app.workspace.onLayoutReady(refresh);
    }
    // Coalesce bursts of workspace events and DOM mutations into one refresh per microtask.
    scheduleRefresh() {
        if (this.refreshQueued) return;
        this.refreshQueued = true;
        queueMicrotask(() => {
            this.refreshQueued = false;
            if (!this.unloaded) this.refreshViews();
        });
    }
    untrack(root) {
        this.observers.get(root)?.disconnect();
        this.observers.delete(root);
        this.tracked.delete(root);
    }
    refreshViews() {
        for (const element of this.tracked) {
            if (!element.isConnected) this.untrack(element);
        }
        this.app.workspace.iterateAllLeaves(leaf => {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) return;
            const root = view.containerEl;
            const enabled = view.file?.extension?.toLowerCase() === "rpad";
            root.classList.toggle("runpad-protected", enabled);
            let summary = root.querySelector(".runpad-properties");
            if (!enabled) {
                // The leaf now shows another file type: stop watching it, otherwise every
                // keystroke in a regular note would trigger a refresh of all leaves.
                summary?.remove();
                this.untrack(root);
                return;
            }
            this.tracked.add(root);
            if (!this.observers.has(root)) {
                const observer = new root.ownerDocument.defaultView.MutationObserver(() => this.scheduleRefresh());
                observer.observe(root, { childList: true, subtree: true });
                this.observers.set(root, observer);
            }
            if (!summary) {
                summary = root.ownerDocument.createElement("details");
                summary.className = "runpad-properties";
                summary.dataset.path = view.file.path;
                summary.setAttribute("aria-label", t("properties.aria-label", { heading: t("properties.heading"), readOnly: t("properties.read-only") }));
                const heading = root.ownerDocument.createElement("summary");
                heading.textContent = t("properties.heading");
                summary.append(heading, root.ownerDocument.createElement("div"));
            }
            // Keep the same element while editing so a user's expanded/collapsed state survives.
            if (summary.dataset.path !== view.file.path) {
                summary.open = false;
                summary.dataset.path = view.file.path;
                delete summary.dataset.yaml;
            }
            const modeSelector = view.getMode() === "preview" ? ".markdown-preview-view" : ".markdown-source-view";
            const nativeProperties = root.querySelector(modeSelector + " .metadata-container");
            if (nativeProperties) {
                if (nativeProperties.nextElementSibling !== summary) nativeProperties.after(summary);
            } else {
                const host = root.querySelector(modeSelector) || view.contentEl || root;
                if (summary.parentElement !== host) host.prepend(summary);
            }
            const text = view.editor.getValue();
            const parsed = policy.inspect(text);
            const yaml = parsed ? text.slice(0, parsed.locks[0].to).replace(/^---[^\n]*\n/, "").replace(/---[ \t]*\r?\n?$/, "") : null;
            if (summary.dataset.yaml === (yaml ?? "INVALID")) return;
            summary.dataset.yaml = yaml ?? "INVALID";
            const content = summary.lastElementChild;
            content.replaceChildren();
            if (yaml === null) {
                content.textContent = t("notice.invalid-structure");
                return;
            }
            try {
                const properties = parseYaml(yaml);
                if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("Expected mapping");
                const table = root.ownerDocument.createElement("table");
                const body = table.createTBody();
                for (const [key, value] of Object.entries(properties)) {
                    const row = body.insertRow();
                    const name = root.ownerDocument.createElement("th");
                    name.scope = "row";
                    name.textContent = key;
                    const cell = row.insertCell();
                    cell.textContent = typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value ?? "");
                    row.prepend(name);
                }
                content.append(table);
            } catch {
                const pre = root.ownerDocument.createElement("pre");
                pre.textContent = yaml;
                content.append(pre);
            }
        });
    }
    onunload() {
        this.unloaded = true;
        for (const observer of this.observers.values()) observer.disconnect();
        this.observers.clear();
        for (const root of this.tracked) {
            root.classList.remove("runpad-protected");
            root.querySelector(".runpad-properties")?.remove();
        }
        this.tracked.clear();
    }
}
module.exports = RunPadMarkdown;
// Exposed for bundle.test.cjs; Obsidian only uses the default export.
module.exports.localize = t;
