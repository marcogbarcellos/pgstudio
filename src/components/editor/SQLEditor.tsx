import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { aiGhostText } from "./ai-complete";
import type { SchemaContext } from "@/lib/tauri";

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  schema?: Record<string, string[]>;
  schemaContext?: SchemaContext | null;
  placeholder?: string;
  height?: string;
}

export function SQLEditor({
  value,
  onChange,
  onExecute,
  schema,
  schemaContext,
  placeholder = "-- Write your SQL here...\n-- Press Cmd+Enter to execute",
  height = "200px",
}: SQLEditorProps) {
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  // Stable reference for AI ghost text to access latest schemaContext
  const schemaContextRef = useMemo(() => {
    let current = schemaContext;
    return {
      get: () => current,
      set: (ctx: SchemaContext | null | undefined) => {
        current = ctx;
      },
    };
  }, []);

  // Update the ref when schemaContext changes
  schemaContextRef.set(schemaContext);

  const extensions = useMemo(() => {
    const exts = [
      sql({
        dialect: PostgreSQL,
        upperCaseKeywords: true,
        schema: schema,
      }),
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            onExecute?.();
            return true;
          },
        },
      ]),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          backgroundColor: "var(--color-bg-tertiary)",
          borderRadius: "6px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--color-bg-tertiary)",
          borderRight: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--color-bg-hover)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--color-bg-hover)",
        },
      }),
      aiGhostText(() => schemaContextRef.get() ?? null),
    ];
    return exts;
  }, [schema, onExecute, schemaContextRef]);

  return (
    <CodeMirror
      value={value}
      height={height}
      theme={oneDark}
      extensions={extensions}
      onChange={handleChange}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: true,
        bracketMatching: true,
        autocompletion: true,
        closeBrackets: true,
      }}
    />
  );
}
