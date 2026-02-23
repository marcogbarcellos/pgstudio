import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConnectionStore } from "@/stores/connection-store";
import {
  listConnections,
  saveConnection,
  deleteConnection,
  connect,
  testConnection,
  getSchemas,
  getFullSchema,
  getDatabases,
} from "@/lib/tauri";
import type { ConnectionInput } from "@/lib/tauri";
import { Plus, Trash2, Plug, Pencil, CheckCircle2, AlertCircle } from "lucide-react";

const defaultForm: ConnectionInput = {
  id: "",
  name: "",
  host: "localhost",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "",
  ssl_mode: "prefer",
  color: "#3ecf8e",
};

export function ConnectionView() {
  const store = useConnectionStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<ConnectionInput>({ ...defaultForm });
  const [isEditing, setIsEditing] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connUrl, setConnUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlParsed, setUrlParsed] = useState(false);

  const parseConnectionUrl = (raw: string) => {
    if (!raw.trim()) {
      setUrlError(null);
      return;
    }
    try {
      const normalized = raw.trim().replace(/^postgres:\/\//, "postgresql://");
      const url = new URL(normalized);
      if (url.protocol !== "postgresql:") {
        setUrlError("URL must start with postgresql:// or postgres://");
        return;
      }
      const host = url.hostname;
      const port = parseInt(url.port) || 5432;
      const database = decodeURIComponent(url.pathname.slice(1)) || "postgres";
      const user = decodeURIComponent(url.username) || "postgres";
      const password = decodeURIComponent(url.password);
      const sslMode = url.searchParams.get("sslmode") || "prefer";

      setForm((f) => ({
        ...f,
        host,
        port,
        database,
        user,
        password,
        ssl_mode: sslMode,
        name: f.name || `${database}@${host}`,
      }));
      setConnUrl("");
      setUrlError(null);
      setUrlParsed(true);
    } catch {
      setUrlError("Invalid connection URL");
    }
  };

  useEffect(() => {
    listConnections()
      .then(store.setConnections)
      .catch(console.error);
  }, [store.setConnections]);

  // Auto-open new connection form when navigated with state
  useEffect(() => {
    const state = location.state as { newConnection?: boolean } | null;
    if (state?.newConnection) {
      setForm({ ...defaultForm });
      setIsEditing(true);
      setTestResult(null);
      setUrlParsed(false);
      setConnUrl("");
      // Clear the state so refreshing doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const handleSave = async () => {
    const input = {
      ...form,
      id: form.id || crypto.randomUUID(),
    };
    try {
      await saveConnection(input);
      const updated = await listConnections();
      store.setConnections(updated);
      setForm({ ...defaultForm });
      setIsEditing(false);
      setTestResult(null);
      setUrlParsed(false);
      setConnUrl("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const version = await testConnection(form);
      setTestResult({ ok: true, message: version });
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = useCallback(
    async (connId: string) => {
      const conn = store.connections.find((c) => c.id === connId);
      if (!conn) return;

      setConnectError(null);

      const input: ConnectionInput = {
        ...conn,
        port: conn.port,
        password: "",
      };

      try {
        await connect(input);
        store.connectTo(connId);

        const [schemas, schemaCtx, databases] = await Promise.all([
          getSchemas(connId),
          getFullSchema(connId),
          getDatabases(connId),
        ]);
        store.setSchemas(schemas);
        store.setSchemaContext(schemaCtx);
        store.setDatabases(databases);
        const currentDb = databases.find((d) => d.is_current);
        store.setActiveDatabase(currentDb?.name ?? conn.database);
        navigate("/sql");
      } catch (e) {
        setConnectError(String(e));
      }
    },
    [store],
  );

  const handleEdit = (id: string) => {
    const conn = store.connections.find((c) => c.id === id);
    if (!conn) return;
    setForm({
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: "",
      ssl_mode: conn.ssl_mode,
      color: conn.color,
    });
    setIsEditing(true);
    setTestResult(null);
    setConnectError(null);
  };

  const handleDelete = async (id: string) => {
    await deleteConnection(id);
    const updated = await listConnections();
    store.setConnections(updated);
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Connections
            </h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Manage your PostgreSQL database connections
            </p>
          </div>
          <button
            onClick={() => {
              setForm({ ...defaultForm });
              setIsEditing(true);
              setTestResult(null);
              setUrlParsed(false);
              setConnUrl("");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "10px",
              backgroundColor: "var(--color-accent)",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 500,
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            New Connection
          </button>
        </div>

        {/* New / Edit connection form */}
        {isEditing && (
          <div
            style={{
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg-secondary)",
              borderRadius: "16px",
              padding: "28px",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "24px" }}>
              {form.id ? "Edit Connection" : "New Connection"}
            </h2>

            {/* Connection URL input — only for new connections */}
            {!form.id && (
              <>
                {urlParsed ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      borderRadius: "12px",
                      padding: "12px 16px",
                      marginBottom: "20px",
                      backgroundColor: "rgba(62,207,142,0.1)",
                      color: "var(--color-accent)",
                      fontSize: "12px",
                    }}
                  >
                    <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                    <span>Connection URL parsed — verify the fields below.</span>
                    <button
                      onClick={() => setUrlParsed(false)}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        color: "var(--color-text-muted)",
                        fontSize: "12px",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Paste another
                    </button>
                  </div>
                ) : (
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px" }}>
                      Connection URL
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={connUrl}
                        onChange={(e) => {
                          setConnUrl(e.target.value);
                          setUrlError(null);
                        }}
                        onBlur={() => parseConnectionUrl(connUrl)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") parseConnectionUrl(connUrl);
                        }}
                        placeholder="postgresql://user:password@host:port/database"
                        style={{
                          flex: 1,
                          borderRadius: "10px",
                          border: urlError ? "1px solid var(--color-danger)" : "1px solid var(--color-border)",
                          backgroundColor: "var(--color-bg-tertiary)",
                          padding: "10px 14px",
                          fontSize: "14px",
                          color: "var(--color-text-primary)",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        onClick={() => parseConnectionUrl(connUrl)}
                        style={{
                          borderRadius: "10px",
                          border: "1px solid var(--color-border)",
                          backgroundColor: "transparent",
                          padding: "10px 16px",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Parse
                      </button>
                    </div>
                    {urlError && (
                      <p style={{ fontSize: "12px", color: "var(--color-danger)", marginTop: "6px" }}>
                        {urlError}
                      </p>
                    )}
                  </div>
                )}

                {/* Separator */}
                {!urlParsed && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>or fill in manually</span>
                    <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
                  </div>
                )}
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
              <InputField
                label="Connection Name"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="My Database"
              />
              <InputField
                label="Host"
                value={form.host}
                onChange={(v) => setForm((f) => ({ ...f, host: v }))}
                placeholder="localhost"
              />
              <InputField
                label="Port"
                value={String(form.port)}
                onChange={(v) =>
                  setForm((f) => ({ ...f, port: parseInt(v) || 5432 }))
                }
                placeholder="5432"
              />
              <InputField
                label="Database"
                value={form.database}
                onChange={(v) => setForm((f) => ({ ...f, database: v }))}
                placeholder="postgres"
              />
              <InputField
                label="User"
                value={form.user}
                onChange={(v) => setForm((f) => ({ ...f, user: v }))}
                placeholder="postgres"
              />
              <InputField
                label="Password"
                value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="••••••••"
                type="password"
              />
            </div>

            {testResult && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  marginBottom: "20px",
                  backgroundColor: testResult.ok ? "rgba(62,207,142,0.1)" : "rgba(239,68,68,0.1)",
                  color: testResult.ok ? "var(--color-accent)" : "var(--color-danger)",
                }}
              >
                {testResult.ok ? (
                  <CheckCircle2 size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
                ) : (
                  <AlertCircle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
                )}
                <span style={{ wordBreak: "break-all" }}>{testResult.message}</span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={handleTest}
                disabled={isTesting}
                style={{
                  borderRadius: "10px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "transparent",
                  padding: "10px 18px",
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                  cursor: isTesting ? "default" : "pointer",
                  opacity: isTesting ? 0.5 : 1,
                }}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </button>
              <button
                onClick={handleSave}
                style={{
                  borderRadius: "10px",
                  backgroundColor: "var(--color-accent)",
                  padding: "10px 18px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Save Connection
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setTestResult(null);
                  setUrlParsed(false);
                  setConnUrl("");
                }}
                style={{
                  borderRadius: "10px",
                  padding: "10px 18px",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connection error */}
        {connectError && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              borderRadius: "12px",
              padding: "14px 16px",
              fontSize: "12px",
              lineHeight: 1.5,
              marginBottom: "16px",
              backgroundColor: "rgba(239,68,68,0.1)",
              color: "var(--color-danger)",
            }}
          >
            <AlertCircle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
            <span style={{ wordBreak: "break-all" }}>{connectError}</span>
          </div>
        )}

        {/* Connection list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {store.connections.map((conn) => (
            <div
              key={conn.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                borderRadius: "14px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-secondary)",
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  backgroundColor: conn.color || "var(--color-accent)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {conn.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  {conn.user}@{conn.host}:{conn.port}/{conn.database}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => handleConnect(conn.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "10px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: 500,
                    border: store.activeConnectionId === conn.id && store.isConnected
                      ? "none" : "1px solid var(--color-border)",
                    backgroundColor: store.activeConnectionId === conn.id && store.isConnected
                      ? "rgba(62,207,142,0.1)" : "transparent",
                    color: store.activeConnectionId === conn.id && store.isConnected
                      ? "var(--color-accent)" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <Plug size={12} />
                  {store.activeConnectionId === conn.id && store.isConnected
                    ? "Connected"
                    : "Connect"}
                </button>
                <button
                  onClick={() => handleEdit(conn.id)}
                  style={{
                    borderRadius: "10px",
                    padding: "8px",
                    color: "var(--color-text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(conn.id)}
                  style={{
                    borderRadius: "10px",
                    padding: "8px",
                    color: "var(--color-text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {store.connections.length === 0 && !isEditing && (
            <div
              style={{
                borderRadius: "14px",
                border: "1px dashed var(--color-border)",
                padding: "64px 20px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                No connections yet. Click{" "}
                <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>New Connection</span>{" "}
                to add one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          borderRadius: "10px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-tertiary)",
          padding: "10px 14px",
          fontSize: "14px",
          color: "var(--color-text-primary)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
