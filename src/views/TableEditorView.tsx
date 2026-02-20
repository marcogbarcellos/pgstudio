import { useState, useEffect, useCallback } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { DataGrid } from "@/components/table/DataGrid";
import { getTables, getTableData, executeQuery } from "@/lib/tauri";
import type { TableInfo, QueryResult } from "@/lib/tauri";
import { Table2, ChevronRight, X } from "lucide-react";

interface TableTab {
  id: string;
  schema: string;
  table: string;
  data: QueryResult | null;
  loading: boolean;
  error: string | null;
}

export function TableEditorView() {
  const { activeConnectionId, isConnected, schemas } = useConnectionStore();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("public");
  const [tabs, setTabs] = useState<TableTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  useEffect(() => {
    if (!activeConnectionId || !isConnected) return;
    getTables(activeConnectionId, selectedSchema)
      .then(setTables)
      .catch(console.error);
  }, [activeConnectionId, isConnected, selectedSchema]);

  const openTable = useCallback(
    async (tableName: string) => {
      if (!activeConnectionId) return;

      // If tab already exists for this schema.table, switch to it
      const existingTab = tabs.find(
        (t) => t.schema === selectedSchema && t.table === tableName,
      );
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      // Create new tab
      const tabId = `${selectedSchema}.${tableName}`;
      const newTab: TableTab = {
        id: tabId,
        schema: selectedSchema,
        table: tableName,
        data: null,
        loading: true,
        error: null,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);

      try {
        const data = await getTableData(
          activeConnectionId,
          selectedSchema,
          tableName,
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, data, loading: false } : t,
          ),
        );
      } catch (e) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, error: String(e), loading: false }
              : t,
          ),
        );
      }
    },
    [activeConnectionId, selectedSchema, tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(newTabs);
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
        } else {
          setActiveTabId(null);
        }
      }
    },
    [tabs, activeTabId],
  );

  const refreshTab = useCallback(
    async (tabId: string) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, loading: true, error: null } : t,
        ),
      );

      try {
        const data = await getTableData(
          activeConnectionId,
          tab.schema,
          tab.table,
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, data, loading: false } : t,
          ),
        );
      } catch (e) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, error: String(e), loading: false }
              : t,
          ),
        );
      }
    },
    [activeConnectionId, tabs],
  );

  const handleDeleteRows = useCallback(
    async (rowIndices: number[]) => {
      if (!activeConnectionId || !activeTab?.data) return;

      const cols = activeTab.data.columns;
      const rows = activeTab.data.rows;

      // Find primary key column (first column as fallback)
      // Build DELETE statements using all columns for WHERE clause to be safe
      const deletes: string[] = [];
      for (const idx of rowIndices) {
        const row = rows[idx];
        const conditions = cols
          .map((col, colIdx) => {
            const val = row[colIdx];
            if (val === null) return `"${col.name}" IS NULL`;
            if (typeof val === "number" || typeof val === "boolean")
              return `"${col.name}" = ${val}`;
            const s = typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${col.name}" = '${s.replace(/'/g, "''")}'`;
          })
          .join(" AND ");
        const table =
          activeTab.schema !== "public"
            ? `"${activeTab.schema}"."${activeTab.table}"`
            : `"${activeTab.table}"`;
        deletes.push(`DELETE FROM ${table} WHERE ${conditions};`);
      }

      try {
        for (const sql of deletes) {
          await executeQuery(activeConnectionId, sql);
        }
        // Refresh the tab data
        await refreshTab(activeTab.id);
      } catch (e) {
        console.error("Delete failed:", e);
      }
    },
    [activeConnectionId, activeTab, refreshTab],
  );

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to browse tables
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Table list sidebar */}
      <div style={{ display: "flex", width: "240px", flexDirection: "column", borderRight: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)" }}>
        <div style={{ borderBottom: "1px solid var(--color-border)", padding: "12px 16px" }}>
          <select
            value={selectedSchema}
            onChange={(e) => setSelectedSchema(e.target.value)}
            style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)", padding: "6px 12px", fontSize: "12px", color: "var(--color-text-primary)", outline: "none" }}
          >
            {schemas.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
            {schemas.length === 0 && <option value="public">public</option>}
          </select>
        </div>
        <div style={{ flex: 1, overflow: "auto", paddingTop: "4px", paddingBottom: "4px" }}>
          {tables.map((table) => {
            const isOpen = tabs.some(
              (t) => t.schema === selectedSchema && t.table === table.name,
            );
            return (
              <button
                key={table.name}
                onClick={() => openTable(table.name)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 16px",
                  textAlign: "left",
                  fontSize: "14px",
                  transition: "background-color 0.15s ease",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  ...(activeTab?.schema === selectedSchema &&
                  activeTab?.table === table.name
                    ? {
                        backgroundColor: "rgba(62,207,142,0.1)",
                        color: "var(--color-accent)",
                      }
                    : isOpen
                      ? { color: "var(--color-text-primary)" }
                      : { color: "var(--color-text-secondary)" }),
                }}
              >
                <Table2 size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {table.name}
                </span>
                <ChevronRight size={12} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
              </button>
            );
          })}
          {tables.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "12px", color: "var(--color-text-muted)" }}>
              No tables found
            </div>
          )}
        </div>
      </div>

      {/* Main content: tabs + data */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Tab bar */}
        {tabs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", flexShrink: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderTop: "none",
                  borderBottom: "none",
                  borderLeft: "none",
                  borderRight: "1px solid var(--color-border)",
                  padding: "8px 16px",
                  fontSize: "12px",
                  transition: "background-color 0.15s ease",
                  backgroundColor: tab.id === activeTabId ? "var(--color-bg-primary)" : "transparent",
                  color: tab.id === activeTabId ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Table2 size={12} style={{ flexShrink: 0 }} />
                <span>{tab.schema}.{tab.table}</span>
                <X
                  size={12}
                  style={{ flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeTab ? (
            activeTab.loading ? (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--color-text-muted)" }}>
                Loading...
              </div>
            ) : activeTab.error ? (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--color-danger)", padding: "32px" }}>
                {activeTab.error}
              </div>
            ) : activeTab.data ? (
              <DataGrid
                columns={activeTab.data.columns}
                rows={activeTab.data.rows}
                rowCount={activeTab.data.row_count}
                tableName={activeTab.table}
                schemaName={activeTab.schema}
                onDeleteRows={handleDeleteRows}
              />
            ) : null
          ) : (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
              Select a table to view its data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
