import { useState, useEffect, useCallback } from "react";
import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import { DataGrid } from "@/components/table/DataGrid";
import {
  getTableData,
  getColumns,
  getSchemas,
  getDatabases,
  getFullSchema,
  executeQuery,
  listConnections,
  connect,
} from "@/lib/tauri";
import type {
  QueryResult,
  ColumnInfo,
  ConnectionInput,
} from "@/lib/tauri";
import {
  Table2,
  X,
  Database,
  Plug,
  AlertCircle,
} from "lucide-react";

// ── Types ──

interface TableTab {
  id: string;
  kind: "data" | "details";
  schema: string;
  table: string;
  data: QueryResult | null;
  columns: ColumnInfo[] | null;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  totalRows: number | null;
  sortColumn: string | null;
  sortDirection: "ASC" | "DESC" | null;
  recentSortColumns: string[];
}

// ── Main Component ──

export function TableEditorView() {
  const {
    connections,
    setConnections,
    activeConnectionId,
    connectTo,
    setSchemas,
    setSchemaContext,
    setDatabases,
    setActiveDatabase,
  } = useConnectionStore();
  const isConnected = useIsConnected();
  const [tabs, setTabs] = useState<TableTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;


  const fqTable = (schema: string, table: string) => `"${schema}"."${table}"`;

  // ── Tab operations ──

  const DEFAULT_PAGE_SIZE = 100;

  const openTable = useCallback(
    async (schemaName: string, tableName: string) => {
      if (!activeConnectionId) return;
      const tabId = `data:${schemaName}.${tableName}`;
      const existingTab = tabs.find((t) => t.id === tabId);
      if (existingTab) { setActiveTabId(existingTab.id); return; }
      const newTab: TableTab = { id: tabId, kind: "data", schema: schemaName, table: tableName, data: null, columns: null, loading: true, error: null, page: 0, pageSize: DEFAULT_PAGE_SIZE, totalRows: null, sortColumn: null, sortDirection: null, recentSortColumns: [] };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      try {
        const [data, countResult, colInfo] = await Promise.all([
          getTableData(activeConnectionId, schemaName, tableName, DEFAULT_PAGE_SIZE, 0),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${schemaName}"."${tableName}"`),
          getColumns(activeConnectionId, schemaName, tableName),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, columns: colInfo, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  // Consume pendingTable from the store (set by ObjectTreeSidebar)
  const pendingTable = useConnectionStore((s) => s.pendingTable);
  const setPendingTable = useConnectionStore((s) => s.setPendingTable);
  useEffect(() => {
    if (pendingTable && activeConnectionId === pendingTable.connectionId) {
      openTable(pendingTable.schema, pendingTable.table);
      setPendingTable(null);
    }
  }, [pendingTable, activeConnectionId, openTable, setPendingTable]);

  const closeTab = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(newTabs);
      if (activeTabId === tabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[Math.max(0, idx - 1)].id : null);
      }
    },
    [tabs, activeTabId],
  );

  const refreshTab = useCallback(
    async (tabId: string) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, loading: true, error: null } : t));
      try {
        const offset = tab.page * tab.pageSize;
        const [data, countResult] = await Promise.all([
          getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, offset, tab.sortColumn, tab.sortDirection),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${tab.schema}"."${tab.table}"`),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handlePageChange = useCallback(
    async (tabId: string, newPage: number) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const offset = newPage * tab.pageSize;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: newPage, loading: true, error: null } : t));
      try {
        const data = await getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, offset, tab.sortColumn, tab.sortDirection);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handlePageSizeChange = useCallback(
    async (tabId: string, newSize: number) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: 0, pageSize: newSize, loading: true, error: null } : t));
      try {
        const [data, countResult] = await Promise.all([
          getTableData(activeConnectionId, tab.schema, tab.table, newSize, 0, tab.sortColumn, tab.sortDirection),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${tab.schema}"."${tab.table}"`),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handleSortChange = useCallback(
    async (tabId: string, column: string | null, direction: "ASC" | "DESC" | null) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      // Track recent sort columns (most recent first, max 5)
      const updatedRecent = column
        ? [column, ...tab.recentSortColumns.filter((c) => c !== column)].slice(0, 5)
        : tab.recentSortColumns;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: 0, sortColumn: column, sortDirection: direction, recentSortColumns: updatedRecent, loading: true, error: null } : t));
      try {
        const data = await getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, 0, column, direction);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handleDeleteRows = useCallback(
    async (rowIndices: number[]) => {
      if (!activeConnectionId || !activeTab?.data) return;
      const cols = activeTab.data.columns;
      const rows = activeTab.data.rows;
      const deletes: string[] = [];
      for (const idx of rowIndices) {
        const row = rows[idx];
        const conditions = buildWhereClause(row, cols, activeTab.columns);
        deletes.push(`DELETE FROM ${fqTable(activeTab.schema, activeTab.table)} WHERE ${conditions};`);
      }
      try {
        for (const sql of deletes) { await executeQuery(activeConnectionId, sql); }
        await refreshTab(activeTab.id);
      } catch (e) { console.error("Delete failed:", e); }
    },
    [activeConnectionId, activeTab, refreshTab],
  );

  const handleSaveEdits = useCallback(
    async (edits: { rowIdx: number; colIdx: number; newValue: unknown }[]) => {
      if (!activeConnectionId || !activeTab?.data) return;
      const cols = activeTab.data.columns;
      const dataRows = activeTab.data.rows;
      const editsByRow = new Map<number, { colIdx: number; newValue: unknown }[]>();
      for (const edit of edits) {
        if (!editsByRow.has(edit.rowIdx)) editsByRow.set(edit.rowIdx, []);
        editsByRow.get(edit.rowIdx)!.push(edit);
      }
      for (const [rowIdx, rowEdits] of editsByRow) {
        const row = dataRows[rowIdx];
        const setClause = rowEdits.map(({ colIdx, newValue }) => {
          const colName = cols[colIdx].name;
          if (newValue === null) return `"${colName}" = NULL`;
          if (typeof newValue === "number" || typeof newValue === "boolean") return `"${colName}" = ${newValue}`;
          const s = typeof newValue === "object" ? JSON.stringify(newValue) : String(newValue);
          return `"${colName}" = '${s.replace(/'/g, "''")}'`;
        }).join(", ");
        const conditions = buildWhereClause(row, cols, activeTab.columns);
        await executeQuery(activeConnectionId, `UPDATE ${fqTable(activeTab.schema, activeTab.table)} SET ${setClause} WHERE ${conditions};`);
      }
      await refreshTab(activeTab.id);
    },
    [activeConnectionId, activeTab, refreshTab],
  );

  // Load saved connections when not connected
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      listConnections().then(setConnections).catch(() => {});
    }
  }, [isConnected, setConnections]);

  const handleConnectFromList = async (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    setConnectingId(connId);
    setConnectError(null);
    const input: ConnectionInput = { ...conn, port: conn.port, password: "" };
    try {
      await connect(input);
      connectTo(connId);
      const [newSchemas, schemaCtx, dbs] = await Promise.all([
        getSchemas(connId),
        getFullSchema(connId),
        getDatabases(connId),
      ]);
      setSchemas(newSchemas);
      setSchemaContext(schemaCtx);
      setDatabases(dbs);
      const currentDb = dbs.find((d) => d.is_current);
      setActiveDatabase(currentDb?.name ?? conn.database);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnectingId(null);
    }
  };

  if (!isConnected) {
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: "520px", margin: "0 auto", padding: "48px 32px" }}>
          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "6px" }}>
              Database Explorer
            </h2>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
              Select a connection to browse databases, schemas, and tables.
            </p>
          </div>

          {connectError && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              borderRadius: "10px", padding: "12px 14px", fontSize: "12px",
              marginBottom: "16px", backgroundColor: "rgba(239,68,68,0.1)",
              color: "var(--color-danger)", lineHeight: 1.5,
            }}>
              <AlertCircle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
              <span style={{ wordBreak: "break-all" }}>{connectError}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {connections.map((conn) => {
              const isConnecting = connectingId === conn.id;
              return (
                <button
                  key={conn.id}
                  onClick={() => handleConnectFromList(conn.id)}
                  disabled={!!connectingId}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    borderRadius: "12px", border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)", padding: "16px 20px",
                    cursor: connectingId ? "default" : "pointer",
                    opacity: connectingId && !isConnecting ? 0.5 : 1,
                    transition: "background-color 0.15s ease, border-color 0.15s ease",
                    textAlign: "left", width: "100%",
                  }}
                  onMouseEnter={(e) => { if (!connectingId) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                >
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0,
                    backgroundColor: conn.color || "var(--color-accent)",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {conn.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px" }}>
                      {conn.user}@{conn.host}:{conn.port}/{conn.database}
                    </div>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    fontSize: "12px", color: isConnecting ? "var(--color-accent)" : "var(--color-text-muted)",
                    flexShrink: 0,
                  }}>
                    <Plug size={12} />
                    {isConnecting ? "Connecting..." : "Connect"}
                  </div>
                </button>
              );
            })}

            {connections.length === 0 && (
              <div style={{
                borderRadius: "12px", border: "1px dashed var(--color-border)",
                padding: "48px 20px", textAlign: "center",
              }}>
                <Database size={24} style={{ color: "var(--color-text-muted)", marginBottom: "12px", opacity: 0.5 }} />
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  No saved connections. Go to <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>Home</span> to add one.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* ── Main content: tabs + data ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tabs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", flexShrink: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTabId(tab.id)} style={{ display: "flex", alignItems: "center", gap: "8px", borderTop: "none", borderBottom: "none", borderLeft: "none", borderRight: "1px solid var(--color-border)", padding: "8px 16px", fontSize: "12px", backgroundColor: tab.id === activeTabId ? "var(--color-bg-primary)" : "transparent", color: tab.id === activeTabId ? "var(--color-text-primary)" : "var(--color-text-muted)", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s ease" }}>
                <Table2 size={12} style={{ flexShrink: 0 }} />
                <span>{tab.schema}.{tab.table}</span>
                <X size={12} style={{ flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} />
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeTab ? (
            activeTab.loading ? <CenteredMessage text="Loading..." /> :
            activeTab.error ? <CenteredMessage text={activeTab.error} danger /> :
            activeTab.data ? <DataGrid columns={activeTab.data.columns} rows={activeTab.data.rows} rowCount={activeTab.data.row_count} tableName={activeTab.table} schemaName={activeTab.schema} onDeleteRows={handleDeleteRows} onSaveEdits={handleSaveEdits} totalRows={activeTab.totalRows} page={activeTab.page} pageSize={activeTab.pageSize} rowOffset={activeTab.page * activeTab.pageSize} onPageChange={(p) => handlePageChange(activeTab.id, p)} onPageSizeChange={(s) => handlePageSizeChange(activeTab.id, s)} sortColumn={activeTab.sortColumn} sortDirection={activeTab.sortDirection} onSortChange={(col, dir) => handleSortChange(activeTab.id, col, dir)} recentSortColumns={activeTab.recentSortColumns} /> : null
          ) : <CenteredMessage text="Select a table to view its data" />}
        </div>
      </div>

    </div>
  );
}

function CenteredMessage({ text, danger }: { text: string; danger?: boolean }) {
  return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "14px", color: danger ? "var(--color-danger)" : "var(--color-text-muted)", padding: "32px" }}>{text}</div>;
}

// ── Format helpers ──

function sqlValue(val: unknown, colName: string): string {
  if (val === null) return `"${colName}" IS NULL`;
  if (typeof val === "number" || typeof val === "boolean") return `"${colName}" = ${val}`;
  const s = typeof val === "object" ? JSON.stringify(val) : String(val);
  return `"${colName}" = '${s.replace(/'/g, "''")}'`;
}

function buildWhereClause(
  row: unknown[],
  dataCols: { name: string; data_type: string }[],
  colInfo: ColumnInfo[] | null,
): string {
  // Use primary key columns if available — much more reliable than matching all columns
  const pkCols = colInfo?.filter((c) => c.is_primary_key) || [];
  if (pkCols.length > 0) {
    return pkCols
      .map((pk) => {
        const idx = dataCols.findIndex((c) => c.name === pk.name);
        if (idx < 0) return null;
        return sqlValue(row[idx], pk.name);
      })
      .filter(Boolean)
      .join(" AND ");
  }
  // Fallback: use all non-null columns
  return dataCols
    .map((col, i) => {
      if (row[i] === null) return null; // skip nulls in fallback — they're unreliable
      return sqlValue(row[i], col.name);
    })
    .filter(Boolean)
    .join(" AND ");
}

