# PgStudio

An AI-native PostgreSQL desktop client for macOS. Browse schemas, edit tables, write and run SQL with AI assistance — all in a fast native app.

## Features

- **Connection Manager** — Save multiple PostgreSQL connections with secure credential storage
- **SQL Editor** — CodeMirror-powered editor with syntax highlighting, autocomplete, and query history
- **Table Editor** — Browse and edit table data with multi-tab support, row selection, copy/export (CSV, JSON, SQL, HTML), and row deletion
- **Schema Browser** — Explore schemas, tables, columns, primary keys, and foreign key relationships
- **AI Assistant** — Natural language to SQL, query explanation, optimization, and chat (Anthropic Claude or OpenAI)
- **Query History** — Persistent history with deduplication and run counts
- **Saved Queries** — Bookmark frequently used queries
- **Export** — Native file save dialog for CSV, JSON, SQL, and styled HTML exports

## Install on macOS

### From Release (recommended)

1. Download the latest `.dmg` from the [Releases](https://github.com/user/pgstudio/releases) page
2. Open the `.dmg` and drag **PgStudio** into your Applications folder
3. On first launch, macOS may block the app. Go to **System Settings > Privacy & Security** and click **Open Anyway**

### From Homebrew (when available)

```sh
brew install --cask pgstudio
```

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Rust](https://rustup.rs/) (latest stable)
- Xcode Command Line Tools (`xcode-select --install`)

### Install and Run

```sh
# Clone the repo
git clone https://github.com/user/pgstudio.git
cd pgstudio

# Install frontend dependencies
pnpm install

# Run in development mode (starts Vite dev server + Tauri window)
pnpm tauri dev
```

The app will open a native window pointing at `http://localhost:1420`.

### Build for Production

```sh
# Build the optimized app bundle
pnpm tauri build
```

The output `.dmg` and `.app` will be in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer    | Technology                           |
| -------- | ------------------------------------ |
| Shell    | Tauri 2                              |
| Frontend | React 18, TypeScript, Vite           |
| Editor   | CodeMirror 6                         |
| Backend  | Rust, tokio-postgres, rusqlite       |
| AI       | Anthropic Claude / OpenAI (optional) |
| State    | Zustand                              |
| Icons    | Lucide React                         |

## Project Structure

```
pgstudio/
├── src/                   # React frontend
│   ├── views/             # Page-level components
│   ├── components/        # Reusable UI (DataGrid, Sidebar, etc.)
│   ├── stores/            # Zustand stores
│   └── lib/tauri.ts       # Typed Tauri command bindings
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── lib.rs         # App setup & plugin registration
│   │   ├── commands.rs    # Tauri command handlers
│   │   ├── db/            # PostgreSQL connection & queries
│   │   ├── storage/       # Local SQLite (history, saved queries, config)
│   │   └── ai/            # AI provider integrations
│   └── capabilities/      # Tauri v2 permission config
└── package.json
```

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests — all help is appreciated.

1. **Fork** the repository
2. **Create a branch** for your feature or fix (`git checkout -b my-feature`)
3. **Commit** your changes (`git commit -m "Add my feature"`)
4. **Push** to your branch (`git push origin my-feature`)
5. **Open a Pull Request**

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow existing code patterns (inline styles for UI, Tauri commands for backend)
- Test your changes with `pnpm tauri dev` before submitting
- For larger changes, open an issue first to discuss the approach

### Ideas for Contribution

- Windows / Linux support
- SSH tunnel connections
- Query result visualization (charts)
- Import from CSV/SQL files
- Keyboard shortcuts
- Themes and customization

## License

MIT
