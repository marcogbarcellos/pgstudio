import { useState, useEffect } from "react";
import { getSavedQueries, deleteSavedQuery } from "@/lib/tauri";
import type { SavedQuery } from "@/lib/tauri";
import { Star, Trash2 } from "lucide-react";

export function SavedQueriesView() {
  const [queries, setQueries] = useState<SavedQuery[]>([]);

  useEffect(() => {
    getSavedQueries().then(setQueries).catch(console.error);
  }, []);

  const handleDelete = async (id: number) => {
    await deleteSavedQuery(id);
    setQueries((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <div style={{ borderBottom: "1px solid var(--color-border)", padding: "14px 20px" }}>
        <h1 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
          Saved Queries
        </h1>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {queries.length === 0 ? (
          <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "var(--color-text-muted)" }}>
            <Star size={24} />
            <span style={{ fontSize: "14px" }}>No saved queries yet</span>
          </div>
        ) : (
          <div>
            {queries.map((q) => (
              <div
                key={q.id}
                style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 20px", transition: "background-color 0.15s ease", borderBottom: "1px solid var(--color-border)" }}
              >
                <Star size={14} style={{ marginTop: "4px", color: "var(--color-warning)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                    {q.name}
                  </div>
                  {q.description && (
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      {q.description}
                    </div>
                  )}
                  <pre style={{ marginTop: "6px", fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.6 }}>
                    {q.sql}
                  </pre>
                </div>
                <button
                  onClick={() => handleDelete(q.id)}
                  style={{ borderRadius: "8px", padding: "6px", color: "var(--color-text-muted)", transition: "background-color 0.15s ease", background: "none", border: "none", cursor: "pointer" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
