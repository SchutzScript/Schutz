<p align="center">
  <img src="docs/assets/logo.png" alt="Schutz" width="60">
</p>

<h1 align="center">Schutz</h1>

<p align="center">
  An AI-native IDE that shows you the AI editing your code, live.
</p>

<p align="center">
  <a href="https://github.com/SchutzScript/Schutz/releases"><img src="https://img.shields.io/github/v/release/SchutzScript/Schutz?label=release&color=8FA893" alt="Release"></a>
  <a href="https://github.com/SchutzScript/Schutz/actions/workflows/release.yml"><img src="https://github.com/SchutzScript/Schutz/actions/workflows/release.yml/badge.svg" alt="Build"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1--Apache--2.0-8FA893" alt="License"></a>
</p>

---

Most AI coding tools hand you a finished diff and ask you to trust it. Schutz shows you the **process** instead — which files the agent opens and why, how it rewrites them line by line, and what it intends to do next, all streaming into the UI as it happens. The goal is to make an AI's edits **observable, beautiful, and controllable**.

## The four pillars

| | |
|---|---|
| **Edit animation** | Code streams in as if typed, with a glow on the lines that changed |
| **Diff visualization** | A clear diff of what changed and why, with per-line accept and reject |
| **Agent status & plan** | A live panel showing what the agent is doing now and what comes next |
| **Multi-file view** | An overview that keeps the whole change in frame when several files move at once |

## Install

Download the latest build from the [Releases page](https://github.com/SchutzScript/Schutz/releases).

| Platform | Availability |
|---|---|
| Windows | `SchutzSetup-<version>.exe` installer |
| macOS | Build from source |
| Linux | Build from source |

## Quick start

1. **Run the setup wizard.** On first launch Schutz asks for a theme, code and UI fonts, a keymap (VS Code, Vim, or IntelliJ), and an autonomy policy. These apply immediately and can be changed later in Settings.
2. **Connect an AI account.** Open Settings (`⚙`) and sign in with Claude or Codex.
3. **Open a project folder**, then start a chat. Attach a file with `@` or the current selection with `✂` to give the agent context.
4. **Watch the edit land.** Proposals arrive as diffs you accept or reject per line — or apply automatically, depending on your autonomy policy.
5. **Edit inline.** Select code, press `Ctrl+K`, and describe the change to get a proposal scoped to just that range.

The spotlight tour covers the rest, and can be replayed any time from the Help menu.

### Keyboard essentials

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Inline edit on the current selection |
| `Ctrl+P` | Quick open a file |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+F` | Search across the project |
| `Ctrl+T` | Search workspace symbols |

## Features

**Editor** — Tabbed editing with 1/2/4 split groups, unsaved-changes guards, project-wide search and replace, TypeScript intelligence, a problems panel, command palette, and symbol outline. Additional languages are supported through LSP (Python via pyright, plus a bridge for custom servers) with formatting, code actions, folding, highlights, and inlay hints.

**AI** — Claude and Codex accounts, chat with file and selection context, inline edit, per-project conversation history, and per-agent stop control. The autonomy policy decides which low-risk changes apply on their own and which wait for review.

**Git** — Stage, commit, and push from the source control panel; side-by-side diff against `HEAD`; gutter change markers; branch and ahead/behind status; blame and stash.

**Terminal** — A real PTY terminal (xterm.js + node-pty) with ANSI color, scrollback, and multiple tabs, alongside a log tab showing live agent activity.

**MCP** — A built-in Model Context Protocol host. Import existing servers or generate one from a program, manage them from the title bar, and expose their tools to the agent loop.

**Debugging** — Breakpoints, call stack, variables, and stepping via DAP (Python/debugpy today).

**Extensions** — Install VS Code extensions from Open VSX, with TextMate grammars and icon themes.

**Localization** — The full UI ships in Korean, English, German, and Japanese.

## Design principles

- **Provider-agnostic** — Claude, OpenAI, Gemini, or local models behind a swappable adapter
- **Observable by default** — every AI action surfaces in the UI
- **Human-in-the-loop** — every change can be accepted, rejected, or reverted
- **Progressive fidelity** — validate the experience first, then deepen it at the editor core

## Build from source

The desktop app lives in [`ide/`](ide) and needs Node.js 20 or newer.

```bash
cd ide
npm install
npm run dev        # Vite dev server (renderer only)
npm run electron   # run the Electron app
npm run dist:win   # Windows installer (Inno Setup)
npm run dist:mac   # macOS build
npm run dist:linux # Linux build
```

## Roadmap

- **Phase 1** — validate the core experience *(done)*
- **Phase 2** — deepen renderer-level visual effects at the editor core
- **Phase 3** — multi-provider support, codebase indexing, ecosystem

## Contributing

Issues and pull requests are welcome. Run `npm run build` in `ide/` before opening a PR — it type-checks and builds the renderer, which is what CI does on every release tag.

See [CHANGELOG.md](CHANGELOG.md) for release history and [docs/DESIGN.md](docs/DESIGN.md) for design notes.

## License

**FSL-1.1-Apache-2.0** (Functional Source License) — see [LICENSE](LICENSE).

The source is public: you may use, modify, and contribute to it freely. Use in a commercial product or service that competes with Schutz is restricted for two years; two years after publication, each version converts automatically to Apache 2.0.
