# Changelog

## [Unreleased]

## [0.0.4] — Agent mode, and a first run that shows its work

The release that gave Schutz a second face — a conversation app for working with agents — and rebuilt the first run so it demonstrates the real product instead of a mockup.

### Agent mode

Schutz now has two modes. **Editor mode** is unchanged — file tree, tabs, and editor at the center, chat beside it. **Agent mode** is a conversation app: the dialogue is the screen, and code surfaces only when it's needed.

- **Switching modes is a morph, not a cut.** Six structural regions (top bar, status, conversation, rail, aside, editor) are named and animate between the two layouts via the View Transitions API. The names are scoped to the morph so they don't interfere with other transitions.
- **A conversation-app layout** — a left sidebar (new chat · artifacts · custom · recent items), the conversation in the middle, and an artifacts panel that opens on the right only when code, markdown, or a preview is shown. A split panel, not a full-screen sheet that buries the code.
- **The composer holds its own tools.** The chrome above the conversation is gone; file and selection attachment and agent selection now live inside the input box.
- **One transcript.** Messages, tool rows, proposals, and pending approvals interleave in a single timeline. Transcripts persist per conversation, and the first run lets you choose which mode to start in.
- **Many conversations.** Each is stored individually behind a recent-items index, migrated once from the old single-session store.

### First run

The first run is now a short film over the **real app**, not a mockup — the demo drives real Monaco, real proposals, and the real accept path, with zero API calls, and never touches your files.

- **It shows what the product actually does**: a request is typed, the agent searches and reads (every tool leaves a line), a proposal queues in review, accepting types the change into the editor, and a command is asked-before-run with its test output streaming line by line to completion.
- **Setup asks one thing per page** — language and look, then AI connection, autonomy, keymap, and type — each page transitioning in.
- **A skip button** sits in the corner throughout, and the closing screen arrives in sequence (mark, then title, then buttons) instead of popping in all at once.
- **The window and taskbar icon follow the theme color**, and a tray icon is added.
- **The guided tour has per-mode tracks** — agent mode gets its own walkthrough — with skeleton figures on the cards and a next button that stays in one place.

### Import past conversations

- **Bring your Claude Code and Codex history into Schutz.** The importer reads their JSONL transcripts, split by source, offered both in the first run and under the AI menu (below MCP servers). Large files are read tail-first, so a 200 MB session opens without loading the whole thing.

### Language switching

- **Switching language now transitions in both directions.** Only the arrival was faded before, so the old strings were still fully opaque at the frame everything changed — exactly when a Korean-to-German width change is most visible. The screen now blurs out, swaps at the bottom, and comes back. It applies everywhere language can be picked, including the first-run setup screen, which had no transition at all.

### Fixes

- **The progress beam sat frozen at 8% for the whole run.** Its width came only from the completion ratio of the plan list, which real agent runs never populate — only the scripted demo does. Every actual run fell through to a hardcoded fallback and never moved. It now advances per round.
- **Toasts were left mounted as invisible ghosts.** Their dismissal timers lived in the shared pool that starting or stopping an agent wipes wholesale, so any toast on screen at that moment never left the state. They now own their timers, matching what tab closing already did for the same reason.
- **The first-run replay was dead after the first use.** The hash was already at the target value, so re-setting it fired no navigation. It's now driven by state instead.
- **The skip button needed two presses.** It lived inside a block keyed by the caption, which remounts on every caption change; a press spanning a change dropped mousedown and mouseup on different nodes, so no click fired. It now lives outside, as one stable node.
- **A scrollbar flickered and nudged the layout during page transitions** — a transform created transient scrollable overflow, now held with a stable gutter.

### Notes for installers

- **Windows SmartScreen warning.** The installer is not code-signed yet, so Windows shows "unknown publisher." Click **More info → Run anyway** to proceed. This is expected for an unsigned build; signing is planned.

## [0.0.3]

The release that made the manager agent tell the truth, and taught Schutz to run commands.

### Delegation engine

The manager agent used to claim it had delegated work that never happened. The cause was not the model — it was the app. `delegate_task` returned a constant success string *before the sub-agent had produced a single token*, so the model read success and summarised it faithfully. A regex then flagged that honest summary as a lie.

- **Delegations now return the sub-agent's actual output.** A round starts its delegations first, runs the remaining tools sequentially, then collects the results into the same tool-result batch in the original call order. Delegations complete inside the round, so the round limit is untouched and one `tool_use` still maps to one `tool_result`.
- **A delegation ledger** records every request, rejection, start, and settlement. "Did the manager delegate?" is now a lookup, not a judgement about prose. The old flag was set *before* the call ran, so unknown-agent, not-connected, and already-busy all counted as "delegated" — the three cases where a user is most likely to be left waiting.
- **Nine rejection reasons**, localized in Korean, English, German, and Japanese. Each one tells the model what to do instead; a reason without an instruction just gets retried verbatim.
- **Delegation timeout** (180s): the manager settles honestly and moves on, while the sub-agent keeps working and its proposals still arrive in the review panel.
- **Sub-agents now receive context** — the files the delegating agent has touched travel with the task, since the delegation prompt is the only channel between them.
- The manager is no longer told it can delegate when no second provider is connected. It used to receive delegation instructions and an empty roster without the tool itself.

### Shell commands and dev server preview

- **`run_command`**: the agent can run shell commands, with an approval modal in manual mode and live output in the AI log tab.
- **Background processes**: dev servers keep running independently of the agent that started them, are detected from their output, and open in a **preview pane inside the editor**. Closing the tab stops the server; quitting the app cleans them up.

### Fixes

- **Agent replies vanished after tool use.** A preview `<iframe>` firing `did-start-loading` cancelled the in-flight agent request, and the resulting `AbortError` was swallowed — indistinguishable from the model saying nothing. Navigation is now gated on the main frame.
- **Stop → immediately re-run** could make the dying run release the *new* run's file locks and overwrite its state. Runs are now keyed by run id, and a superseded run skips cleanup entirely.
- Stopping now resolves a pending command approval as a rejection; approvals were not interruptible by abort.
- **GPT's subscription path could not edit files** — it was missing tool support.
- **Tab filenames were unreadable with many files open.** Tabs shrank instead of overflowing; the icon, close button, and padding took 61px, leaving 13px for the name. Tabs now keep their size and the strip scrolls, bringing the active tab into view.
- **Paper theme** left the editor dark — added a light TextMate theme.
- Assorted data-loss and false-success paths: destructive file operations now go through the trash with atomic writes, external modifications are detected, auto-accept no longer reports success it did not achieve, and silent failures surface as toasts.

### Chat and motion

- Draft messages survive a restart, `↑` recalls previous messages, a jump-to-latest button appears when you scroll away, and chat opens at the newest message.
- Per-agent chat tabs with per-agent colours, so Claude and GPT no longer blur together.
- Korean/Japanese input no longer sends mid-composition on Enter.
- Language switching, terminal open/close, and project switching animate; the chat no longer shifts horizontally as scrollbars appear.
- AI edits are applied with a typing animation on the real edit path, without remounting the editor.

### Branding

- New logo and app icon; the sage brand accent is now separate from semantic green (`--ok`), so success states no longer fight the brand colour.

### Internal

- First test infrastructure in this repository: vitest, with 54 tests covering the engine. The engine is a zero-import pure module type-checked under a stricter config than the rest of the app.

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
