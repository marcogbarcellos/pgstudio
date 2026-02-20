import {
  EditorView,
  Decoration,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { aiComplete } from "@/lib/tauri";
import type { SchemaContext } from "@/lib/tauri";

// Effects to set/clear ghost text
const setGhostText = StateEffect.define<string>();
const clearGhostText = StateEffect.define<null>();

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ghost-text";
    span.textContent = this.text;
    span.style.opacity = "0.35";
    span.style.fontStyle = "italic";
    span.style.pointerEvents = "none";
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// State field to store current ghost text
const ghostTextField = StateField.define<string>({
  create() {
    return "";
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) return effect.value;
      if (effect.is(clearGhostText)) return "";
    }
    // Clear ghost text on any document change
    if (tr.docChanged) return "";
    return value;
  },
});

// Decoration to render ghost text
const ghostTextDecoration = EditorView.decorations.compute(
  [ghostTextField],
  (state) => {
    const text = state.field(ghostTextField);
    if (!text) return Decoration.none;

    const pos = state.selection.main.head;
    const deco = Decoration.widget({
      widget: new GhostTextWidget(text),
      side: 1,
    });
    return Decoration.set([deco.range(pos)]);
  },
);

/**
 * Creates a CodeMirror extension for AI-powered ghost text autocomplete.
 * Debounces on keystrokes, sends context to the AI backend, and renders
 * ghost text that can be accepted with Tab.
 */
export function aiGhostText(getSchemaContext: () => SchemaContext | null) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged) return;

        // Clear any pending request
        if (debounceTimer) clearTimeout(debounceTimer);
        if (abortController) abortController.abort();

        const schemaContext = getSchemaContext();
        if (!schemaContext) return;

        // Debounce 500ms
        debounceTimer = setTimeout(async () => {
          const state = this.view.state;
          const pos = state.selection.main.head;
          const doc = state.doc.toString();
          const prefix = doc.slice(0, pos);
          const suffix = doc.slice(pos);

          // Don't complete if prefix is too short or empty line
          if (prefix.trim().length < 3) return;

          abortController = new AbortController();

          try {
            const completion = await aiComplete(prefix, suffix, schemaContext);
            const trimmed = completion.trim();
            if (trimmed && !abortController.signal.aborted) {
              this.view.dispatch({
                effects: setGhostText.of(trimmed),
              });
            }
          } catch {
            // Silently ignore errors (network issues, AI not configured, etc.)
          }
        }, 500);
      }

      destroy() {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (abortController) abortController.abort();
      }
    },
  );

  // Tab to accept ghost text
  const acceptKeymap = EditorView.domEventHandlers({
    keydown(event, view) {
      const ghostText = view.state.field(ghostTextField);

      if (event.key === "Tab" && ghostText) {
        event.preventDefault();
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: ghostText },
          effects: clearGhostText.of(null),
          selection: { anchor: pos + ghostText.length },
        });
        return true;
      }

      if (event.key === "Escape" && ghostText) {
        event.preventDefault();
        view.dispatch({ effects: clearGhostText.of(null) });
        return true;
      }

      return false;
    },
  });

  return [ghostTextField, ghostTextDecoration, plugin, acceptKeymap];
}
