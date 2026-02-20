import { create } from "zustand";
import type { ConnectionRecord, SchemaInfo, TableInfo, SchemaContext } from "@/lib/tauri";

interface ConnectionState {
  connections: ConnectionRecord[];
  activeConnectionId: string | null;
  isConnected: boolean;
  schemas: SchemaInfo[];
  tables: Record<string, TableInfo[]>;
  schemaContext: SchemaContext | null;

  setConnections: (connections: ConnectionRecord[]) => void;
  setActiveConnection: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  setSchemas: (schemas: SchemaInfo[]) => void;
  setTables: (schema: string, tables: TableInfo[]) => void;
  setSchemaContext: (ctx: SchemaContext) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  activeConnectionId: null,
  isConnected: false,
  schemas: [],
  tables: {},
  schemaContext: null,

  setConnections: (connections) => set({ connections }),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  setSchemas: (schemas) => set({ schemas }),
  setTables: (schema, tables) =>
    set((state) => ({
      tables: { ...state.tables, [schema]: tables },
    })),
  setSchemaContext: (ctx) => set({ schemaContext: ctx }),
  reset: () =>
    set({
      activeConnectionId: null,
      isConnected: false,
      schemas: [],
      tables: {},
      schemaContext: null,
    }),
}));
