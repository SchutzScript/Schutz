# Schutz

> An AI-native IDE that makes AI integration effortless and **shows you the AI editing your code, live**.

**Schutz** is an open-source IDE built around one goal: make an AI's edits **observable, beautiful, and controllable**. Where most AI coding tools hand you a finished diff, Schutz shows you the **process** — which files the AI opens and why, how it rewrites them, and what it plans to do next, all streaming into the UI as it happens.

## Core UX — real-time edit visualization

1. **Edit animation** — code streams in as if typed, with a glow on changed lines
2. **Diff visualization** — a clear diff of what changed and why, with per-line accept/reject
3. **Agent status & plan panel** — what the AI is doing right now, and what comes next
4. **Multi-file edit view** — an overview when several files change at once

## Design principles

- **Provider-agnostic** — Claude, OpenAI, Gemini, or local models behind a swappable adapter
- **Observable by default** — every AI action surfaces in the UI
- **Human-in-the-loop** — every change can be accepted, rejected, or reverted
- **Progressive fidelity** — validate the experience first, then deepen it at the editor core

## Install

Download the latest installer from the [Releases page](https://github.com/SchutzScript/Schutz/releases).

- **Windows** — `SchutzSetup-<version>.exe`
- **macOS / Linux** — build from source (see below)

## Build from source

The desktop app lives in [`ide/`](ide). Requires Node.js 20+.

```bash
cd ide
npm install
npm run dev        # Vite dev server (renderer only)
npm run electron   # run the Electron app
npm run dist:win   # Windows installer (Inno Setup)
npm run dist:mac   # macOS build
npm run dist:linux # Linux build
```

## Features

**Editor** — tabbed editing with 1/2/4 split groups, unsaved-changes guards, project-wide text search (`Ctrl+Shift+F`), TypeScript intelligence, a problems panel, command palette, outline, and LSP-backed support for additional languages.

**AI** — connect Claude or Codex accounts, chat with file (`@`) and selection (`✂`) context, inline edit with `Ctrl+K`, per-project conversation history, and per-agent stop control. An autonomy policy decides which low-risk edits apply automatically and which wait for review.

**Git** — a source control panel for staging, committing, and pushing; side-by-side diff against `HEAD`; gutter change markers; branch and ahead/behind status.

**Terminal** — a real PTY terminal (xterm.js) with ANSI color, scrollback, and multiple tabs, alongside a log tab showing live agent activity.

**MCP** — a built-in Model Context Protocol host: import existing servers, generate new ones from a program, manage them from the title bar, and expose their tools to the agent loop.

**Debugging** — breakpoints, call stack, variables, and stepping via DAP (Python/debugpy today).

**Extensions** — install VS Code extensions from Open VSX, with TextMate grammars and icon themes.

**Localization** — the full UI ships in Korean, English, German, and Japanese.

See [CHANGELOG.md](CHANGELOG.md) for release history and [docs/DESIGN.md](docs/DESIGN.md) for design notes.

## Roadmap

- **Phase 1** — validate the core experience *(done)*
- **Phase 2** — deepen renderer-level visual effects at the editor core
- **Phase 3** — multi-provider support, codebase indexing, ecosystem

## License

**FSL-1.1-Apache-2.0** (Functional Source License) — see [LICENSE](LICENSE).

The source is public: you may use, modify, and contribute to it freely. Use in a commercial product or service that competes with Schutz is restricted for two years; two years after publication, each version converts automatically to Apache 2.0.
