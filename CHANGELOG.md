# Changelog

## [0.0.2]

The release that brought the editor core, Git, AI, and the terminal up to everyday-usable quality.

### Onboarding & settings
- The **code font, size, UI font, keymap, and autonomy policy** picked during onboarding are now actually applied (previously only the theme was).
- **Keymaps**: Vim (with a mode indicator in the status bar), core IntelliJ bindings, and VS Code defaults.
- New editor and autonomy sections in Settings — changes apply immediately and survive a restart.
- **Autonomy policy**: Balanced mode auto-accepts low-risk changes that match the docs/tests/dependency rules (marked with an "auto" badge); Autonomous mode applies everything and leaves it for post-hoc review.
- **Localization**: the full UI is available in Korean, English, German, and Japanese.
- A spotlight tour walks through the main features on first run and can be replayed from the Help menu.

### Editor
- **Tabs**: open and switch between multiple files in an edit group; groups split 1/2/4 ways.
- **Unsaved guards**: save/discard/cancel confirmation when closing a tab or quitting the app.
- **Project-wide text search** (`Ctrl+Shift+F`) with jump-to-file-and-line, plus replace across files.
- **TypeScript intelligence**: completion, hover, go-to-definition, rename, and a problems panel.
- **Command palette**, symbol outline, quick open, and workspace symbol search (`Ctrl+T`).
- **Language servers** for other languages (Python via pyright, plus a bridge for custom servers), covering formatting, code actions, folding, highlights, and inlay hints.
- **TextMate grammars** and VS Code icon themes for syntax highlighting and file icons.

### Git
- **Source control panel**: stage/unstage/discard changed files, commit, push, and see branch and ahead/behind status.
- **Diff view**: opening a changed file compares `HEAD` against the working tree side by side.
- **Gutter change markers** (added/modified/deleted) in the editor, plus `blame` and `stash`. Clicking the branch in the status bar opens the panel.

### AI
- **Inline edit** (`Ctrl+K`): select code, describe the change, and get a proposal as a diff limited to that range.
- **Context attachment**: attach files (`@`) and the editor selection (`✂`) to a chat message.
- **Conversation persistence**: chats are saved and restored per project.
- **Per-agent stop**: halt one agent without stopping the others.
- **MCP host**: import existing Model Context Protocol servers or generate one from a program, manage them from the title bar, and expose their tools to the agent loop.

### Terminal
- **Real PTY terminal** (xterm.js + node-pty) with ANSI color, scrollback, and **multiple tabs** — interactive TTY apps work.
- An AI log tab showing live agent activity. The decorative placeholder tabs were removed.

### Debugging
- **DAP debugging** (Python via debugpy): breakpoints, call stack, variables, and stepping.

### Extensions
- Install VS Code extensions from **Open VSX**, with both declarative and programmatic extension hosts.

## [0.0.1] — Phase 1 prototype

The first working skeleton. All four UX pillars could be demoed with the `mock` provider, no backend required.

### Added
- **AI provider abstraction** (`AIProvider`) — a vendor-neutral interface plus a registry
- **MockProvider** — streams a simulated agent loop (plan → tool → text → edit) without an API key
- **ClaudeProvider** (experimental) — text streaming only, to validate the interface
- **Edit transaction model** — pending / accept / reject
- **Orchestrator** — consumes the stream, turns edits into transactions, and emits UI events
- **Editor visualization** — typing animation, glow decorations, and diff CodeLens (accept/reject)
- **Three webviews (Astro)** — chat, agent activity, and multi-file overview
- Smoke tests, demo sample files, and the design document
