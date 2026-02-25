import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useConnectionStore } from "@/stores/connection-store";
import {
  connect,
  getDatabases,
  getSchemas,
  getTables,
  getColumns,
  getTableData,
  executeQuery,
  exportFile,
  searchTableHistory,
  switchDatabase,
} from "@/lib/tauri";
import type {
  ConnectionRecord,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ConnectionInput,
  QueryHistoryEntry,
} from "@/lib/tauri";
import {
  Server,
  Database,
  Folder,
  FolderOpen,
  Table2,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  AlertCircle,
  Copy,
  FileCode2,
  Info,
  Hash,
  Terminal,
  Download,
  Trash2,
} from "lucide-react";

// ── Types ──

interface TreeData {
  databases: Record<string, DatabaseInfo[]>;
  schemas: Record<string, SchemaInfo[]>;
  tables: Record<string, TableInfo[]>;
}

interface LoadingState {
  connections: Set<string>;
  databases: Set<string>;
  schemas: Set<string>;
}

interface ErrorState {
  connections: Record<string, string>;
  databases: Record<string, string>;
  schemas: Record<string, string>;
}

interface CtxMenu {
  x: number;
  y: number;
  connId: string;
  dbName: string;
  schema: string;
  table: string;
  sub: "querytool" | "scripts" | "export" | null;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 24;
const INDENT = 16;

// ── Utility functions ──

function fqTable(schema: string, table: string) {
  return `"${schema}"."${table}"`;
}

function generateCreateScript(schema: string, table: string, cols: ColumnInfo[]): string {
  const lines = cols.map((c) => {
    let line = `  "${c.name}" ${c.data_type}`;
    if (!c.is_nullable) line += " NOT NULL";
    if (c.column_default) line += ` DEFAULT ${c.column_default}`;
    return line;
  });
  const pks = cols.filter((c) => c.is_primary_key).map((c) => `"${c.name}"`);
  if (pks.length > 0) lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  const fks = cols.filter((c) => c.is_foreign_key && c.foreign_table && c.foreign_column);
  for (const fk of fks) lines.push(`  FOREIGN KEY ("${fk.name}") REFERENCES "${fk.foreign_table}"("${fk.foreign_column}")`);
  return `CREATE TABLE "${schema}"."${table}" (\n${lines.join(",\n")}\n);`;
}

function formatExport(format: "csv" | "sql" | "html" | "json", schema: string, table: string, data: { columns: { name: string }[]; rows: unknown[][] }): string {
  const cols = data.columns;
  const rows = data.rows;
  if (format === "json") {
    const objects = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col.name] = row[i]; });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }
  if (format === "csv") {
    const header = cols.map((c) => `"${c.name}"`).join(",");
    const body = rows.map((row) => row.map((val) => { if (val === null) return ""; const s = typeof val === "object" ? JSON.stringify(val) : String(val); return `"${s.replace(/"/g, '""')}"`; }).join(",")).join("\n");
    return `${header}\n${body}`;
  }
  if (format === "sql") {
    const colNames = cols.map((c) => `"${c.name}"`).join(", ");
    const ft = `"${schema}"."${table}"`;
    return rows.map((row) => { const values = row.map((val) => { if (val === null) return "NULL"; if (typeof val === "number" || typeof val === "boolean") return String(val); const s = typeof val === "object" ? JSON.stringify(val) : String(val); return `'${s.replace(/'/g, "''")}'`; }).join(", "); return `INSERT INTO ${ft} (${colNames}) VALUES (${values});`; }).join("\n");
  }
  const truncate = (val: unknown, max: number) => { if (val === null) return '<span style="color:#666">NULL</span>'; const s = typeof val === "object" ? JSON.stringify(val) : String(val); const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); return escaped.length > max ? escaped.slice(0, max) + "..." : escaped; };
  const headerCells = cols.map((c) => `<th>${c.name}</th>`).join("");
  const bodyRows = rows.map((row) => `<tr>${row.map((val) => `<td>${truncate(val, 120)}</td>`).join("")}</tr>`).join("\n");
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${schema}.${table}</title>\n<style>\nbody{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#e5e5e5;padding:32px}\n.card{background:#171717;border:1px solid #2e2e2e;border-radius:12px;overflow:hidden;max-width:100%}\n.meta{padding:16px 20px;border-bottom:1px solid #2e2e2e;font-size:13px;color:#a3a3a3}\n.meta strong{color:#e5e5e5}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;padding:10px 16px;border-bottom:1px solid #2e2e2e;color:#a3a3a3;font-weight:500}\ntd{padding:10px 16px;border-bottom:1px solid #2e2e2e}\ntr:hover td{background:#1e1e1e}\n</style></head><body>\n<div class="card">\n<div class="meta"><strong>${schema}.${table}</strong> — ${rows.length} rows, ${cols.length} columns</div>\n<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>\n</div></body></html>`;
}

// ── Main Component ──

export function ObjectTreeSidebar() {
  const navigate = useNavigate();
  const {
    connections,
    connectedIds,
    activeConnectionId,
    connectTo,
    setActiveConnection,
    setConnectionActiveDatabase,
    setPendingTable,
    setPendingSql,
    setDatabases,
    setSchemas: setStoreSchemas,
    connectionData,
  } = useConnectionStore();

  // Panel state
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const resizing = useRef(false);

  // Tree expand state
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  // Cached data
  const [treeData, setTreeData] = useState<TreeData>({
    databases: {},
    schemas: {},
    tables: {},
  });

  // Loading / error states
  const [loading, setLoading] = useState<LoadingState>({
    connections: new Set(),
    databases: new Set(),
    schemas: new Set(),
  });
  const [errors, setErrors] = useState<ErrorState>({
    connections: {},
    databases: {},
    schemas: {},
  });

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [countResult, setCountResult] = useState<string | null>(null);
  const [recentTableQueries, setRecentTableQueries] = useState<QueryHistoryEntry[]>([]);
  const [hoveredQueryId, setHoveredQueryId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Context menu handlers ──

  const handleContextMenu = useCallback((e: React.MouseEvent, connId: string, dbName: string, schema: string, table: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, connId, dbName, schema, table, sub: null });
    setCountResult(null);
    setRecentTableQueries([]);
    if (connectedIds.includes(connId)) {
      searchTableHistory(connId, table, 8)
        .then(setRecentTableQueries)
        .catch(() => {});
    }
  }, [connectedIds]);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const ensureConnectionAndDb = useCallback(async (connId: string, dbName: string) => {
    if (activeConnectionId !== connId) {
      setActiveConnection(connId);
    }
    const currentDb = treeData.databases[connId]?.find((d) => d.is_current);
    if (currentDb && currentDb.name !== dbName) {
      await switchDatabase(connId, dbName);
      setTreeData((prev) => ({
        ...prev,
        databases: {
          ...prev.databases,
          [connId]: prev.databases[connId]?.map((d) => ({ ...d, is_current: d.name === dbName })) ?? [],
        },
      }));
    }
    // Always sync the store so other views (SQL editor, Table editor) see the correct active database
    setConnectionActiveDatabase(connId, dbName);
  }, [activeConnectionId, setActiveConnection, setConnectionActiveDatabase, treeData.databases]);

  const handleCopyName = useCallback(() => {
    if (!ctxMenu) return;
    navigator.clipboard.writeText(ctxMenu.table);
    closeMenu();
  }, [ctxMenu, closeMenu]);

  const handleCopySchema = useCallback(async () => {
    if (!ctxMenu) return;
    try {
      const cols = await getColumns(ctxMenu.connId, ctxMenu.schema, ctxMenu.table);
      navigator.clipboard.writeText(generateCreateScript(ctxMenu.schema, ctxMenu.table, cols));
    } catch (e) { console.error(e); }
    closeMenu();
  }, [ctxMenu, closeMenu]);

  const handleCountRows = useCallback(async () => {
    if (!ctxMenu) return;
    try {
      await ensureConnectionAndDb(ctxMenu.connId, ctxMenu.dbName);
      const result = await executeQuery(ctxMenu.connId, `SELECT COUNT(*) FROM ${fqTable(ctxMenu.schema, ctxMenu.table)};`);
      setCountResult(String(result.rows[0]?.[0]));
    } catch { setCountResult("Error"); }
  }, [ctxMenu, ensureConnectionAndDb]);

  const handleQueryTool = useCallback(async () => {
    if (!ctxMenu) return;
    await ensureConnectionAndDb(ctxMenu.connId, ctxMenu.dbName);
    setPendingSql(`SELECT * FROM ${fqTable(ctxMenu.schema, ctxMenu.table)} LIMIT 100;`, true);
    closeMenu();
    navigate("/sql");
  }, [ctxMenu, ensureConnectionAndDb, setPendingSql, closeMenu, navigate]);

  const handleTableDefinitions = useCallback(async () => {
    if (!ctxMenu) return;
    await ensureConnectionAndDb(ctxMenu.connId, ctxMenu.dbName);
    // Navigate to tables view and open this table
    setPendingTable({ connectionId: ctxMenu.connId, schema: ctxMenu.schema, table: ctxMenu.table });
    closeMenu();
    navigate("/tables");
  }, [ctxMenu, ensureConnectionAndDb, setPendingTable, closeMenu, navigate]);

  const handleScript = useCallback(async (type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE") => {
    if (!ctxMenu) return;
    const { connId, dbName, schema, table } = ctxMenu;
    await ensureConnectionAndDb(connId, dbName);
    const cols = await getColumns(connId, schema, table);
    let sql: string;
    if (type === "CREATE") { sql = generateCreateScript(schema, table, cols); }
    else {
      const colNames = cols.map((c) => `"${c.name}"`).join(", ");
      const ft = fqTable(schema, table);
      switch (type) {
        case "SELECT": sql = `SELECT ${colNames}\nFROM ${ft}\nLIMIT 100;`; break;
        case "INSERT": sql = `INSERT INTO ${ft} (${colNames})\nVALUES (${cols.map(() => "?").join(", ")});`; break;
        case "UPDATE": { const pk = cols.find((c) => c.is_primary_key); const sc = cols.filter((c) => !c.is_primary_key).map((c) => `"${c.name}" = ?`).join(",\n  "); sql = `UPDATE ${ft}\nSET ${sc}\nWHERE ${pk ? `"${pk.name}" = ?` : "/* condition */"};`; break; }
        case "DELETE": { const pk = cols.find((c) => c.is_primary_key); sql = `DELETE FROM ${ft}\nWHERE ${pk ? `"${pk.name}" = ?` : "/* condition */"};`; break; }
      }
    }
    setPendingSql(sql);
    closeMenu();
    navigate("/sql");
  }, [ctxMenu, ensureConnectionAndDb, setPendingSql, closeMenu, navigate]);

  const handleExport = useCallback(async (format: "csv" | "sql" | "html" | "json") => {
    if (!ctxMenu) return;
    try {
      await ensureConnectionAndDb(ctxMenu.connId, ctxMenu.dbName);
      const data = await getTableData(ctxMenu.connId, ctxMenu.schema, ctxMenu.table, 10000);
      const content = formatExport(format, ctxMenu.schema, ctxMenu.table, data);
      await exportFile(content, `${ctxMenu.table}.${format}`);
    } catch (e) { console.error("Export failed:", e); }
    closeMenu();
  }, [ctxMenu, ensureConnectionAndDb, closeMenu]);

  const handleDeleteTable = useCallback(async () => {
    if (!ctxMenu) return;
    const { connId, dbName, schema, table } = ctxMenu;
    if (!window.confirm(`Are you sure you want to drop "${schema}"."${table}"? This cannot be undone.`)) { closeMenu(); return; }
    try {
      await ensureConnectionAndDb(connId, dbName);
      await executeQuery(connId, `DROP TABLE ${fqTable(schema, table)};`);
      // Refresh tables in the tree for this schema
      const schemaKey = `${connId}:${dbName}:${schema}`;
      const updated = await getTables(connId, schema);
      setTreeData((prev) => ({ ...prev, tables: { ...prev.tables, [schemaKey]: updated } }));
    } catch (e) { console.error("Drop failed:", e); }
    closeMenu();
  }, [ctxMenu, ensureConnectionAndDb, closeMenu]);

  // ── Resize handling ──

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      resizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  // ── Connection toggle ──

  const toggleConnection = useCallback(async (conn: ConnectionRecord) => {
    const connId = conn.id;
    const isExpanded = expandedConnections.has(connId);

    if (isExpanded) {
      setExpandedConnections((prev) => { const next = new Set(prev); next.delete(connId); return next; });
      return;
    }

    setExpandedConnections((prev) => new Set(prev).add(connId));

    const isAlreadyConnected = connectedIds.includes(connId);
    if (!isAlreadyConnected) {
      setLoading((prev) => ({ ...prev, connections: new Set(prev.connections).add(connId) }));
      setErrors((prev) => { const next = { ...prev.connections }; delete next[connId]; return { ...prev, connections: next }; });
      try {
        const input: ConnectionInput = { ...conn, password: "" };
        await connect(input);
        connectTo(connId);
      } catch (e) {
        setErrors((prev) => ({ ...prev, connections: { ...prev.connections, [connId]: String(e) } }));
        setLoading((prev) => { const next = new Set(prev.connections); next.delete(connId); return { ...prev, connections: next }; });
        return;
      }
      setLoading((prev) => { const next = new Set(prev.connections); next.delete(connId); return { ...prev, connections: next }; });
    }

    if (!treeData.databases[connId]) {
      setLoading((prev) => ({ ...prev, connections: new Set(prev.connections).add(connId) }));
      try {
        const dbs = await getDatabases(connId);
        setTreeData((prev) => ({ ...prev, databases: { ...prev.databases, [connId]: dbs } }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, connections: { ...prev.connections, [connId]: String(e) } }));
      }
      setLoading((prev) => { const next = new Set(prev.connections); next.delete(connId); return { ...prev, connections: next }; });
    }
  }, [expandedConnections, connectedIds, connectTo, treeData.databases]);

  // ── Database toggle ──

  const toggleDatabase = useCallback(async (connId: string, dbName: string) => {
    const key = `${connId}:${dbName}`;
    const isExpanded = expandedDatabases.has(key);

    if (isExpanded) {
      setExpandedDatabases((prev) => { const next = new Set(prev); next.delete(key); return next; });
      return;
    }

    setExpandedDatabases((prev) => new Set(prev).add(key));

    const currentDb = treeData.databases[connId]?.find((d) => d.is_current);
    if (currentDb && currentDb.name !== dbName) {
      try {
        await switchDatabase(connId, dbName);
        setTreeData((prev) => ({
          ...prev,
          databases: {
            ...prev.databases,
            [connId]: prev.databases[connId]?.map((d) => ({ ...d, is_current: d.name === dbName })) ?? [],
          },
        }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, databases: { ...prev.databases, [key]: String(e) } }));
        return;
      }
    }
    // Sync the store so SQL editor tabs capture the correct database
    setConnectionActiveDatabase(connId, dbName);

    if (!treeData.schemas[key]) {
      setLoading((prev) => ({ ...prev, databases: new Set(prev.databases).add(key) }));
      try {
        const schemas = await getSchemas(connId);
        setTreeData((prev) => ({ ...prev, schemas: { ...prev.schemas, [key]: schemas } }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, databases: { ...prev.databases, [key]: String(e) } }));
      }
      setLoading((prev) => { const next = new Set(prev.databases); next.delete(key); return { ...prev, databases: next }; });
    }
  }, [expandedDatabases, treeData.databases, treeData.schemas, setConnectionActiveDatabase]);

  // ── Schema toggle ──

  const toggleSchema = useCallback(async (connId: string, dbName: string, schemaName: string) => {
    const key = `${connId}:${dbName}:${schemaName}`;
    const isExpanded = expandedSchemas.has(key);

    if (isExpanded) {
      setExpandedSchemas((prev) => { const next = new Set(prev); next.delete(key); return next; });
      return;
    }

    setExpandedSchemas((prev) => new Set(prev).add(key));

    const currentDb = treeData.databases[connId]?.find((d) => d.is_current);
    if (currentDb && currentDb.name !== dbName) {
      try {
        await switchDatabase(connId, dbName);
        setTreeData((prev) => ({
          ...prev,
          databases: {
            ...prev.databases,
            [connId]: prev.databases[connId]?.map((d) => ({ ...d, is_current: d.name === dbName })) ?? [],
          },
        }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, schemas: { ...prev.schemas, [key]: String(e) } }));
        return;
      }
    }

    if (!treeData.tables[key]) {
      setLoading((prev) => ({ ...prev, schemas: new Set(prev.schemas).add(key) }));
      try {
        const tables = await getTables(connId, schemaName);
        setTreeData((prev) => ({ ...prev, tables: { ...prev.tables, [key]: tables } }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, schemas: { ...prev.schemas, [key]: String(e) } }));
      }
      setLoading((prev) => { const next = new Set(prev.schemas); next.delete(key); return { ...prev, schemas: next }; });
    }
  }, [expandedSchemas, treeData.databases, treeData.tables]);

  // ── Table click (open in table editor) ──

  const handleTableClick = useCallback(async (connId: string, dbName: string, schemaName: string, tableName: string) => {
    if (activeConnectionId !== connId) {
      setActiveConnection(connId);
    }

    const currentDb = treeData.databases[connId]?.find((d) => d.is_current);
    if (currentDb && currentDb.name !== dbName) {
      try {
        await switchDatabase(connId, dbName);
        setTreeData((prev) => ({
          ...prev,
          databases: {
            ...prev.databases,
            [connId]: prev.databases[connId]?.map((d) => ({ ...d, is_current: d.name === dbName })) ?? [],
          },
        }));
      } catch {
        return;
      }
    }
    setConnectionActiveDatabase(connId, dbName);

    const dbKey = `${connId}:${dbName}`;
    if (treeData.schemas[dbKey]) {
      setStoreSchemas(treeData.schemas[dbKey]);
    }
    if (connectionData[connId]) {
      setDatabases(treeData.databases[connId] ?? []);
    }

    setPendingTable({ connectionId: connId, schema: schemaName, table: tableName });
    navigate("/tables");
  }, [activeConnectionId, setActiveConnection, setConnectionActiveDatabase, setPendingTable, navigate, treeData, setStoreSchemas, setDatabases, connectionData]);

  // ── Refresh ──

  const handleRefresh = useCallback(() => {
    setTreeData({ databases: {}, schemas: {}, tables: {} });
    setErrors({ connections: {}, databases: {}, schemas: {} });
  }, []);

  // ── Render helpers ──

  const renderSpinner = () => (
    <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--color-text-muted)" }} />
  );

  const renderError = (msg: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0", paddingLeft: INDENT * 2 }}>
      <AlertCircle size={12} style={{ color: "var(--color-danger, #ef4444)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--color-danger, #ef4444)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {msg}
      </span>
    </div>
  );

  if (connections.length === 0) return null;

  if (collapsed) {
    return (
      <div
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 8,
          borderRight: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-secondary)",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(false)}
        title="Expand object browser"
      >
        <PanelLeftOpen size={14} style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexShrink: 0, height: "100%" }}>
      <div
        style={{
          width,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-secondary)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Object Browser
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => navigate("/settings")}
              title="Add connection"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}
            >
              <Plus size={13} />
            </button>
            <button
              onClick={handleRefresh}
              title="Refresh"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0" }}>
          {connections.map((conn) => (
            <ConnectionNode
              key={conn.id}
              conn={conn}
              isConnected={connectedIds.includes(conn.id)}
              isActive={activeConnectionId === conn.id}
              isExpanded={expandedConnections.has(conn.id)}
              isLoading={loading.connections.has(conn.id)}
              error={errors.connections[conn.id]}
              databases={treeData.databases[conn.id]}
              expandedDatabases={expandedDatabases}
              expandedSchemas={expandedSchemas}
              treeData={treeData}
              loading={loading}
              errors={errors}
              onToggleConnection={() => toggleConnection(conn)}
              onToggleDatabase={(db) => toggleDatabase(conn.id, db)}
              onToggleSchema={(db, schema) => toggleSchema(conn.id, db, schema)}
              onClickTable={(db, schema, table) => handleTableClick(conn.id, db, schema, table)}
              onContextMenuTable={(e, db, schema, table) => handleContextMenu(e, conn.id, db, schema, table)}
              renderSpinner={renderSpinner}
              renderError={renderError}
            />
          ))}
          <TreeRow depth={0} onClick={() => navigate("/settings")}>
            <Plus size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Add connection
            </span>
          </TreeRow>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: 4,
          cursor: "col-resize",
          flexShrink: 0,
          backgroundColor: "transparent",
          position: "relative",
          marginLeft: -2,
          zIndex: 10,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent)"; }}
        onMouseLeave={(e) => { if (!resizing.current) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
      />

      {/* Context Menu */}
      {ctxMenu && (
        <div ref={menuRef} style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999, minWidth: "200px", backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)", borderRadius: "8px", padding: "4px 0", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", fontSize: "13px" }}>
          <MenuItem icon={<Copy size={14} />} label="Copy name" onClick={handleCopyName} />
          <MenuItem icon={<FileCode2 size={14} />} label="Copy table schema" onClick={handleCopySchema} />
          <MenuDivider />
          <MenuItem icon={<Info size={14} />} label="Open in Table Editor" onClick={handleTableDefinitions} />
          <MenuItem icon={<Hash size={14} />} label={countResult !== null ? `Count: ${countResult}` : "Count Rows"} onClick={handleCountRows} />
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "querytool" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <div onClick={handleQueryTool} style={{ cursor: "pointer" }}>
              <MenuItemWithArrow icon={<Terminal size={14} />} label="Query Tool" />
            </div>
            {ctxMenu.sub === "querytool" && (
              <SubMenu>
                <MenuItem label="SELECT * LIMIT 100" onClick={handleQueryTool} />
                {recentTableQueries.length > 0 && <MenuDivider />}
                {recentTableQueries.length > 0 && (
                  <div style={{ padding: "4px 14px 2px", fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Recent queries</div>
                )}
                {recentTableQueries.map((q) => (
                  <div key={q.id} style={{ position: "relative" }} onMouseEnter={() => setHoveredQueryId(q.id)} onMouseLeave={() => setHoveredQueryId(null)}>
                    <MenuItem label={q.sql.replace(/\s+/g, " ").slice(0, 45) + (q.sql.length > 45 ? "..." : "")} onClick={() => { setPendingSql(q.sql, true); closeMenu(); navigate("/sql"); }} />
                    {hoveredQueryId === q.id && (
                      <div style={{
                        position: "absolute", left: "100%", top: 0, marginLeft: "4px",
                        width: "320px", maxHeight: "240px", overflow: "auto",
                        backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)",
                        borderRadius: "8px", padding: "12px 14px",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.5)", zIndex: 1,
                      }}>
                        <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{q.sql}</pre>
                        <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {q.row_count} row{q.row_count !== 1 ? "s" : ""} &middot; {q.execution_time_ms}ms &middot; {new Date(q.created_at).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </SubMenu>
            )}
          </div>
          <MenuDivider />
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "scripts" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <MenuItemWithArrow icon={<FileCode2 size={14} />} label="Scripts" />
            {ctxMenu.sub === "scripts" && (
              <SubMenu>
                <MenuItem label="SELECT Script" onClick={() => handleScript("SELECT")} />
                <MenuItem label="INSERT Script" onClick={() => handleScript("INSERT")} />
                <MenuItem label="UPDATE Script" onClick={() => handleScript("UPDATE")} />
                <MenuItem label="DELETE Script" onClick={() => handleScript("DELETE")} />
                <MenuDivider />
                <MenuItem label="CREATE Script" onClick={() => handleScript("CREATE")} />
              </SubMenu>
            )}
          </div>
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "export" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <MenuItemWithArrow icon={<Download size={14} />} label="Export data" />
            {ctxMenu.sub === "export" && (
              <SubMenu>
                <MenuItem label="Export as CSV" onClick={() => handleExport("csv")} />
                <MenuItem label="Export as SQL" onClick={() => handleExport("sql")} />
                <MenuItem label="Export as HTML" onClick={() => handleExport("html")} />
                <MenuItem label="Export as JSON" onClick={() => handleExport("json")} />
              </SubMenu>
            )}
          </div>
          <MenuDivider />
          <MenuItem icon={<Trash2 size={14} />} label="Delete table" onClick={handleDeleteTable} danger />
        </div>
      )}
    </div>
  );
}

// ── Tree Node Components ──

function ConnectionNode({
  conn,
  isConnected,
  isActive,
  isExpanded,
  isLoading,
  error,
  databases,
  expandedDatabases,
  expandedSchemas,
  treeData,
  loading,
  errors,
  onToggleConnection,
  onToggleDatabase,
  onToggleSchema,
  onClickTable,
  onContextMenuTable,
  renderSpinner,
  renderError,
}: {
  conn: ConnectionRecord;
  isConnected: boolean;
  isActive: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  error?: string;
  databases?: DatabaseInfo[];
  expandedDatabases: Set<string>;
  expandedSchemas: Set<string>;
  treeData: TreeData;
  loading: LoadingState;
  errors: ErrorState;
  onToggleConnection: () => void;
  onToggleDatabase: (db: string) => void;
  onToggleSchema: (db: string, schema: string) => void;
  onClickTable: (db: string, schema: string, table: string) => void;
  onContextMenuTable: (e: React.MouseEvent, db: string, schema: string, table: string) => void;
  renderSpinner: () => React.ReactNode;
  renderError: (msg: string) => React.ReactNode;
}) {
  const connId = conn.id;

  return (
    <div>
      <TreeRow depth={0} onClick={onToggleConnection} title={`${conn.host}:${conn.port}`}>
        {isLoading ? renderSpinner() : (
          isExpanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} /> : <ChevronRight size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
        )}
        <Server
          size={14}
          style={{
            flexShrink: 0,
            color: isConnected
              ? (isActive ? "var(--color-accent)" : "var(--color-text-secondary)")
              : "var(--color-text-muted)",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: isActive ? 600 : 400,
            color: isConnected ? "var(--color-text-primary)" : "var(--color-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {conn.name || conn.host}
        </span>
        {conn.color && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: conn.color, flexShrink: 0 }} />
        )}
      </TreeRow>

      {error && renderError(error)}

      {isExpanded && databases && databases.map((db) => {
        const dbKey = `${connId}:${db.name}`;
        const dbExpanded = expandedDatabases.has(dbKey);
        const dbLoading = loading.databases.has(dbKey);
        const dbError = errors.databases[dbKey];
        const schemas = treeData.schemas[dbKey];

        return (
          <div key={db.name}>
            <TreeRow depth={1} onClick={() => onToggleDatabase(db.name)} title={db.name}>
              {dbLoading ? renderSpinner() : (
                dbExpanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} /> : <ChevronRight size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
              )}
              <Database
                size={14}
                style={{
                  flexShrink: 0,
                  color: db.is_current ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: db.is_current ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  fontWeight: db.is_current ? 600 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {db.name}
              </span>
            </TreeRow>

            {dbError && renderError(dbError)}

            {dbExpanded && schemas && schemas.map((schema) => {
              const schemaKey = `${connId}:${db.name}:${schema.name}`;
              const schemaExpanded = expandedSchemas.has(schemaKey);
              const schemaLoading = loading.schemas.has(schemaKey);
              const schemaError = errors.schemas[schemaKey];
              const tables = treeData.tables[schemaKey];

              return (
                <div key={schema.name}>
                  <TreeRow depth={2} onClick={() => onToggleSchema(db.name, schema.name)} title={schema.name}>
                    {schemaLoading ? renderSpinner() : (
                      schemaExpanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} /> : <ChevronRight size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
                    )}
                    {schemaExpanded
                      ? <FolderOpen size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
                      : <Folder size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
                    }
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {schema.name}
                    </span>
                  </TreeRow>

                  {schemaError && renderError(schemaError)}

                  {schemaExpanded && tables && tables.map((table) => (
                    <TreeRow
                      key={table.name}
                      depth={3}
                      onClick={() => onClickTable(db.name, schema.name, table.name)}
                      onContextMenu={(e) => onContextMenuTable(e, db.name, schema.name, table.name)}
                      title={`${table.name} (~${table.row_estimate} rows, ${table.size})`}
                      isLeaf
                    >
                      <Table2 size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {table.name}
                      </span>
                    </TreeRow>
                  ))}

                  {schemaExpanded && tables && tables.length === 0 && (
                    <div style={{ paddingLeft: INDENT * 4 + 8, fontSize: 11, color: "var(--color-text-muted)", padding: "2px 0 2px " + (INDENT * 4 + 8) + "px" }}>
                      No tables
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic tree row ──

function TreeRow({
  depth,
  onClick,
  onContextMenu,
  title,
  isLeaf,
  children,
}: {
  depth: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title?: string;
  isLeaf?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 26,
        paddingLeft: INDENT * depth + (isLeaf ? INDENT + 8 : 8),
        paddingRight: 8,
        cursor: "pointer",
        backgroundColor: hovered ? "var(--color-accent-muted, rgba(255,255,255,0.06))" : "transparent",
        transition: "background-color 0.1s ease",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

// ── Menu components ──

function MenuItem({ icon, label, onClick, danger }: { icon?: React.ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: "10px", padding: "8px 14px", fontSize: "13px", color: danger ? "var(--color-danger)" : "var(--color-text-primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background-color 0.1s ease" }}
      onMouseEnter={(e) => { (e.currentTarget).style.backgroundColor = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget).style.backgroundColor = "transparent"; }}>
      {icon && <span style={{ flexShrink: 0, color: danger ? "var(--color-danger)" : "var(--color-text-muted)" }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function MenuItemWithArrow({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "10px", padding: "8px 14px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer", transition: "background-color 0.1s ease" }}
      onMouseEnter={(e) => { (e.currentTarget).style.backgroundColor = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget).style.backgroundColor = "transparent"; }}>
      {icon && <span style={{ flexShrink: 0, color: "var(--color-text-muted)" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
    </div>
  );
}

function SubMenu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: "100%", top: 0, minWidth: "180px", backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)", borderRadius: "8px", padding: "4px 0", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
      {children}
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "4px 0" }} />;
}
