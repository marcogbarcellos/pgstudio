import { useConnectionStore } from "@/stores/connection-store";
import { Database, Circle } from "lucide-react";

export function TopBar() {
  const { isConnected, activeConnectionId, connections } = useConnectionStore();
  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  return (
    <header
      data-tauri-drag-region
      style={{
        display: "flex",
        height: "48px",
        alignItems: "center",
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        padding: "0 20px",
      }}
    >
      {/* Spacer for macOS traffic lights */}
      <div style={{ width: "64px" }} data-tauri-drag-region />

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }} data-tauri-drag-region>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
          PgStudio
        </span>

        {activeConnection && (
          <>
            <span style={{ color: "var(--color-text-muted)" }}>/</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", borderRadius: "8px", padding: "6px 10px", fontSize: "14px", color: "var(--color-text-secondary)" }}>
              <Database size={14} />
              <span>{activeConnection.name}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Circle
                size={8}
                style={{
                  fill: isConnected ? "var(--color-accent)" : "var(--color-text-muted)",
                  color: isConnected ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
              />
              <span style={{ fontSize: "12px", color: isConnected ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
