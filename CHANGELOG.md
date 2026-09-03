# Changelog

## [Unreleased]

## [0.5.0] — Several agents, one shape

Delegation ran one task at a time. A manager could hand work to another agent, but to build on the answer it had to wait for the round to come back, read the result, and delegate again. There was no way to say "run A and B together, and when both finish give their results to C".

This release adds that layer, and stops there. Development is paused after it.

### The task graph

`delegate_graph` takes tasks with dependencies. Independent ones run together; a task that waits on others receives their answers in its own prompt automatically.

The layer's real job is refusing to lose work. Eight tasks going out and three answers coming back, with the rest silent, is the failure this project keeps returning to — a confident partial result is indistinguishable from a complete one.

- **When a dependency breaks, everything waiting on it closes with a reason**, immediately. The direct cause and the ones knocked over behind it are recorded differently, so one failure blocking twenty tasks still reports one cause instead of twenty.
- **A task that ran but returned nothing is not counted as done.** Dependents still proceed, but they receive an explicit blank rather than a missing entry — dropping it reads to the next agent as "that task never existed".
- **A delegation that timed out counts as failed.** Letting dependents build on an answer that never arrived is worse than blocking them.
- **A graph that does not hold together starts nothing at all.** Half-running it and finding the cycle afterwards cannot be undone. The error names the ids caught in the loop, or the dependency that does not exist.

Two limits are relaxed inside a graph and one is not. The per-turn count and the ban on reusing an agent existed to bound a model delegating without a plan; a graph is that plan, checked before it runs and visible on screen, so its own size limit replaces them. Concurrency stays capped — that one is file locks and billing.

### Seeing it

The workflow panel draws the graph as it runs: which tasks go together, what waits on what, and what never ran.

Not-yet-run and never-will-run do not share an icon, and neither does ran-but-returned-nothing. A blocked row says what blocked it, on the row. Starting a graph switches the left panel to the workflow tab — opening a project leaves it on the file tree, and without the switch the screen says nothing while several agents work.

### Status

Development is paused here for an indefinite period, and the repository is archived. The installers below are the last build. `docs/PLAN-0.4.md` records the measurements behind the decision not to build a codebase index, which is the most reusable thing to pick up from if work resumes.

## [0.4.0] — Finding things, and admitting when it cannot

This release was planned as a codebase index. It did not become one, and the reason is the most useful thing in it.

The plan was to build a symbol index so the agent could find a definition without grepping. Step one — ask the language tooling that is already running — turned out to be enough. Symbol lookup answers in 150–280 ms, returned the true definition first in every query measured, and produced 19 results where grep produced 105 for the same name. An index of our own would have had to beat that while staying correct as files change on disk, and nothing in the measurements suggested it would. So it was not built. [docs/PLAN-0.4.md](docs/PLAN-0.4.md) records the numbers and the decision.

What shipped instead is the other half of the same problem: knowing where something is, and being honest when you do not.

### Finding a definition

- **Symbol search works in TypeScript projects.** `Ctrl+T` asked only the language server, and TypeScript is served by Monaco's own worker rather than an LSP session — so in a TypeScript project the list was always empty. Both sources are queried now and merged.
- **The agent can ask too**, through `find_symbol` and `find_references`. Unlike a text search these skip comments, call sites and unrelated names that merely contain the word.
- **Import lines are not definitions.** TypeScript reports a name pulled in by `import` as a symbol of its own, and those were being offered as the answer to "where is this defined".
- **Tests are ranked below source.** `describe("applyProposal", …)` is a symbol as far as the parser is concerned, and it was outranking the function it names.
- **An exact name is never truncated away.** Results were ordered within each file and cut afterwards, so a file full of partial matches could push the exact definition off the end — and then reference lookup answered that the definition could not be found.

### Saying "I don't know"

Five separate places reported an unknown as an absence. That is the failure this project keeps returning to, because a confident empty answer is indistinguishable from a correct one.

- **A large TypeScript project was reported as not being TypeScript.** Model preloading is all-or-nothing past its file cap, so beyond that point zero files were parsed and the answer was "no symbols here".
- **No language server for this file type** now says so, and how to install one, instead of returning an empty list.
- **A model that cannot make tool calls** is named as such after it ignores the tools three times running, rather than appearing to work and quietly doing nothing.
- **Reference lookup that fails** says it failed.
- **The file watcher's overflow** is counted and reported instead of being lost. Creating 2500 files at once produced 180 notifications on Windows; the kernel buffer overflows and the rest are simply gone.

### Extensions

- **An extension can own a file type.** `registerCustomEditorProvider` renders the extension's own editor in the tab, with the document delivered to it and edits going through the model — so undo works and the save baseline stays correct.
- **The debug namespace exists**: sessions, breakpoints and their changes are visible to extensions.
- Two gaps remain and now fail loudly rather than silently: binary custom editors, and `registerDebugAdapterDescriptorFactory`. Both are documented in the README.

## [0.3.0] — What it could not see, and what it could lose

Two things ran through this release. The app was losing work it had promised to keep, and it was answering questions about files it had never actually looked at. Both failed the same way: quietly, with a successful-looking answer.

On top of that, three new things: it talks to more models, extensions can do considerably more, and a proposal now appears in the code rather than only on a card.

### Your unsaved work stops disappearing

Every one of these was reproduced in the running app before it was fixed, and each is a place where edits vanished with no warning and no undo.

- **Files deleted or renamed outside the app** took your unsaved buffer with them. They are kept now, and you are told they are orphaned so you can decide.
- **Quitting** with unsaved files did nothing visible: `beforeunload` cancels `app.quit()` in Electron with no dialog at all. There is now a real prompt with save / discard / cancel — and "save" that does not finish does not quit.
- **Switching projects** dropped unsaved edits without asking.
- **Discarding in git** only half-discarded, and the delete confirmation promised something it did not do.
- **Undo of an agent run** reloaded every open model from disk, including files the run never touched — while the screen said unsaved edits would be left alone.

### Files it could not see

- **Anything nested deeper than 8 levels was invisible** to the tree, to search, and to replace — all three walked with the same cap. `packages/app/src/features/x/components/y/z.ts` is already 8. The limit is 16 now.
- **Dot-directories were hidden wholesale.** `.vscode/settings.json`, `.claude/agents/*.md` and friends appeared in no listing and matched no search; `.github` had been carved out as a special case, which was the tell. What is hidden is now decided in one place.
- **Neither the tree nor search said when it had stopped early**, so "no results" and "never looked" arrived as the same answer. Both now say which it was — including to the agent, which had been told nothing at all.

### Files it could destroy

- **Opening a non-UTF-8 file corrupted it.** Everything was decoded as UTF-8, so a UTF-16 file grew from 16 to 20 bytes on open-and-save alone, and a CP949 Korean file turned to replacement characters the moment you edited one line. Such files are now refused, with an explanation.
- **Replace-across-files did the same thing**, on files you never opened — and reported success. Non-UTF-8 files are skipped and named.
- **A UTF-8 BOM was stripped by opening the file.** Monaco keeps the BOM outside the model, so the baseline never matched and "save all" rewrote untouched files.

### More models

Gemini, and any OpenAI-compatible server you point it at — Ollama, LM Studio, llama.cpp, or a corporate proxy. The address is a setting rather than a constant, a local server is not treated as unconfigured just because it has no API key, and its model list is read from the server, since only the server knows what you have pulled.

### Extensions

- **Decorations draw.** `createTextEditorDecorationType` used to return a working-looking handle that drew nothing — the last place in the shim that answered successfully and did nothing.
- **`onDidChangeActiveTextEditor` handed over the wrong editor.** It fired before the editor existed and the notification was dropped on the way out, so opening a file delivered either nothing or the *previous* file's editor. Extensions that draw on editor changes were drawing onto whatever was open before.
- **`WorkspaceEdit` can create, delete and rename files.** All-or-nothing: if one operation cannot be done, none are. A file with unsaved edits is neither deleted nor overwritten.
- **`env.openExternal` and `env.clipboard` do their jobs** instead of reporting success and doing nothing.

### Proposals in the code

A pending proposal is marked on the line it changes; hovering shows why. Accept and reject are CodeLens on that line, not only buttons on the card. While an edit types itself in, a ghost caret shows the exact character being written.

This completes the four editing-visualization pillars. The original plan for that phase was to fork Code-OSS; the fork never happened and should not, since this app has had its own renderer from the start. [docs/PHASE2-SURVEY.md](docs/PHASE2-SURVEY.md) audits the pillars against the code.

### Also

- The app survives a main-process crash instead of vanishing, and writes a crash log.
- Async failures that used to disappear are surfaced.
- The tour teaches both modes rather than only the one you are in.
- Shell commands run only in the open workspace.
- MCP resources and prompts are offered to the agent, not just listed.


## [0.2.0] — Everything the extension host said it could do

The previous release fixed behaviour the app claimed to have. This one does the same thing one layer out: an extension could load, report success, and then do nothing at all, because most of what it asked for was answered by a function that returned an empty value.

There is a shape to all of it. `registerTreeDataProvider` returned a disposable. `showQuickPick` returned `undefined`. `createStatusBarItem` returned an object with a writable `text`. Each of those is a *successful* answer, so the extension carried on believing it had worked. Nothing errored, nothing was logged, and the feature simply was not there. That is worse than failing, because there is nothing to search for.

### An extension can see the file you are looking at

`window.activeTextEditor` was `undefined` — always. `visibleTextEditors` was an empty array, `workspaceFolders` was `undefined`, and `openTextDocument` rejected. The app had all of it: the models, the open panes. Only the shim was not connected.

Documents and editors are now built on the real Monaco models, read through getters rather than snapshots so an extension never reasons about stale text. `editor.edit()` goes through the model rather than writing to disk — writing directly would be neither undoable nor reconcilable with the save baseline, and this way `Ctrl+Z` just works. `onDidOpenTextDocument`, `onDidSaveTextDocument` and `onDidChangeActiveTextEditor` fire for real; they were empty emitters nobody ever fired.

### Language extensions deliver what they produce

Completion and hover were wired. The four lines under them accepted a registration and threw the results away — and one of those was diagnostics, so a linter would read your file, find every problem, hand them over, and produce no squiggle, no problems panel entry, no count in the tab.

- **Diagnostics reach the editor and the problems panel.** Each extension gets its own marker owner; sharing one would mean the next `set()` wipes the previous extension's findings. The collection remembers what it marked so `clear()` can actually clear it, rather than reporting itself empty while stale problems stay on screen.
- **The severity table is written fresh.** VS Code numbers `Error` as **0**; LSP numbers it 1. Reusing the LSP table — which sits in the next file over — would shift everything one step down and quietly demote every error to a warning.
- **Go-to-definition and formatters work.** Definitions accept the `LocationLink` shape (`targetUri`/`targetRange`) that plenty of extensions return; formatter edits go through the model, so `Ctrl+Z` takes them back.
- **Providers receive a `TextDocument`, not a Monaco model.** A model has no `getText`, no `lineAt`, no `fileName`, so any provider calling one threw on its first line into a `catch` that returns an empty result. From the extension's side that is indistinguishable from "nothing to report" — and it explains why completion and hover, wired up long ago, produced nothing for any provider that read its document.

### An extension can ask you something

All three ways of asking answered without asking. In the VS Code contract `undefined` means *the user cancelled*, so an extension concluded it had been cancelled by a prompt that never appeared, and dropped whatever it was doing.

Quick picks, input boxes and button messages now open real dialogs. A pick returns **the item the extension passed in**, not a copy, because extensions branch on fields they attached themselves. `validateInput` also runs when the dialog opens — an extension's own initial value can already violate its own rule, and with nothing marked you would have to press OK to find out why OK does nothing.

`showInformationMessage(msg)` with no buttons stays a toast. A notification should not block. The worst of the three was this one, because the toast *did* appear, so something looked like it had happened while `if (await showInformationMessage(m, "Reload") === "Reload")` was permanently false.

Every prompt names the extension asking. A dialog that reads as the app's own leaves you suspecting the app after the extension is gone.

### Settings, watchers, status, views

- **Extensions can read their own settings.** `get(key, def)` reads plausibly until you notice extensions do not pass a fallback — they declared their defaults in the manifest. `contributes.configuration` may be an object *or* an array; handling only one silently loses defaults for half of them. `update()` persists, and `update(key, undefined)` restores the declared default rather than recording `undefined` as your choice.
- **File watchers wake up.** `fs.watch` receives the changed filename in the main process, used it for the ignore rules, and discarded it; the renderer got an argument-less "something changed". Those names now travel through and are classified against the before/after tree. When the tree is truncated by the entry cap only watcher-reported paths count — "absent from the listing" would otherwise mean "deleted", and an extension acting on that removes a good file from its index.
- **Status bar items appear.** The item is wrapped in a `Proxy` because extensions keep reassigning `text` after `show()` — that is how a progress indicator works, and reading it once would freeze it on its first string. `$(icon)` markup is stripped; when stripping leaves nothing, a dot remains, since a zero-width label makes the clickable thing vanish.
- **Trees and webviews have a place in the sidebar.** Titles come from the manifest, because the registering side only knows the view id. Trees fetch children only where expanded, so an extension serving a file tree does not read the whole project at once. Webviews live in a sandboxed iframe with `acquireVsCodeApi()` injected — nearly every webview opens with that line, and a pane that renders but answers nothing is worse than one that never appears.

### MCP speaks all three of its pillars

The handshake result was discarded, so the negotiated revision, the server's capabilities and its name were all unknown. Revision `2025-06-18` is now proposed and whatever the server negotiates is honoured, with the `MCP-Protocol-Version` header on HTTP transports. Only `tools/*` was ever called; `resources/*` and `prompts/*` are read too, and the panel counts all three — a server offering only resources used to read as "0 tools".

### Fixed

- **An extension in a folder not named `publisher.name` could not read a single file.** The scan derives the id from `package.json` and returns the real directory alongside it; the read path threw that away and rebuilt `extensions/<id>/`. Installing a `.vsix` names the folder after the id, which is why this stayed hidden — but the app has an "Open extensions folder" button, which is an invitation to put one there by hand.
- **Overlay z-index now comes from the overlay table.** The table said a render's `zIndex` must equal its `z`, and two had drifted: the confirm dialog rendered *below* the bundle installer, and the tour shared a layer with the import dialog. `Escape` closes top-down by the table while the eye sees the opposite order, so you press `Escape` at the dialog in front and the answer goes to the one behind it.
- **The repository had no CI at all.** The only workflow ran on `v*` tags, so 685 tests and a two-stage typecheck existed and nothing ran them on a push or a pull request — and the strict-mode pass over `src/engine` had been failing, unnoticed, in 25 places.
- Confirmation dialogs moved off the OS `window.confirm`, which freezes the renderer, ignores the theme, and cannot show more than one line of what you are about to lose.
- Monaco's own widgets (find, suggest, hover, peek) follow the app theme. The colours defined for them never applied, because an installed grammar extension means the TextMate theme wins.
- Switching between editor and agent mode keeps your reading position, and the log filter is no longer silently dropped.
- The renderer logs which bundle it loaded, and `dist` is no longer loaded twice on a failed dev-server connection.

### Added

- **Run this one file** (`Ctrl+F5`) for C, C++, Python, Go, Rust, JavaScript and TypeScript, with the toolchain checked before anything runs.
- **`Alt+←` / `Alt+→`** return to where you just were, across files and within one.
- **Git status colours in the tree**, so a modified file is visible without opening the git panel.
- **Extensions can subscribe to what happens in the IDE** — files opened and saved, proposals accepted or rejected, agent turns starting and ending.

### Removed

- 531 lines of a browser-preview-only demo path. It was a second implementation of the plan panel and change overview, and being the only implementation of them, those two panels were always empty in the desktop app.

## [0.1.0] — Nothing new, and that is the point

This release adds no features. Every change here restores behaviour the app already claimed to have. Two of them were ways to lose work you had not saved.

The version number moves to 0.1 because the work planned under that milestone is finished, and because an editor that can silently discard your unsaved edits has no business calling itself anything.

### Your unsaved edits are safe now

- **Undoing an AI run no longer overwrites buffers it never touched.** The undo dialog computes which files have unsaved edits and says on screen that it will leave them alone. The execution step then reloaded *every* open model from disk regardless — including files the run had nothing to do with. The screen and the code now agree: only the files actually restored are re-read.
- **Accepting a proposal edits your buffer, not the file underneath it.** If you were editing a file and an agent changed another part of it, the accept path read the file from disk, wrote on top of that, and then marked the buffer clean — so your edits vanished *and* the dirty marker vanished with them, leaving nothing to notice. The edit is now applied to the open buffer when there is one. Where the editor still has to be reset, it goes through the undo stack, so `Ctrl+Z` brings your text back.

The offset arithmetic, stale-range detection, uniqueness fallback, and `$`-sequence handling behind all of this moved into a tested module rather than living inline.

### Modals behave like modals

`Escape` and the global shortcuts each had their own idea of what was on screen, and neither matched the z-index.

- **Shortcuts no longer reach through an open dialog.** `Ctrl+W` over Settings was closing the tab hidden behind it; `Ctrl+P` opened a palette you could not see, which then took your keystrokes. A shortcut now passes only if it belongs to the dialog on top.
- **`Escape` closes what is actually in front.** The chain was hand-written, so newer dialogs — cloud tasks, plugins, engine, run approval, undo, bundle install, commit view, the tab switcher — were never added to it, and a confirmation stacked over Settings closed Settings first.
- **Focus returns where it came from.** Closing a dialog dropped focus to the document body, so the next `Tab` started over from the top of the page. Reopening a dialog during its closing animation also failed to focus its input.
- The four palettes (files, commands, symbols, search) are now dialogs proper: labelled, and `Tab` stays inside them.

### Colours mean something on light themes

Error, warning, and unsaved states were hard-coded hex values chosen against a dark background. On Paper, against a white card, they measured 2.41:1, 2.27:1, and 2.00:1 — against a 4.5:1 minimum. The error message was the least readable thing on the screen.

They are theme tokens now, dark on light and light on dark, and a test measures every semantic colour against every surface in every theme so this cannot come back.

### Fixed

- Remaining usage was invisible on every launch. The startup check used the stored access token without refreshing it; those expire in about an hour, so it almost always failed, and the figure only appeared after you sent a message. It also now refreshes while the app is open, without issuing a request unless the number is stale and the window is visible.
- Merge conflicts could not be resolved at all in a narrow sidebar or in German — the third button was clipped off the edge with no way to scroll to it.
- With several terminals open, the dock's collapse button was pushed off screen, so the dock could not be collapsed.
- A long branch name pushed the right-hand end of the status bar out of the window.
- Settings labels overlapped their controls in German and Japanese.
- MCP: starting a server twice while its handshake was still running reported success with an empty tool list. A notification arriving before the response on an HTTP connector was read *as* the response, with the same result — a server that connects with no tools and no error.
- Tool arguments from Claude that failed to parse were swallowed into `{}`, so a truncated call ran as an empty one instead of being reported.
- Atomic writes used one fixed temporary filename, so two concurrent writes to the same path could destroy one side's content. Replace-in-files was not atomic at all.
- Rapidly clicking a git action twice reported the blocked second click as a failure.
- `/vim` saved the setting without applying it to editors already open.
- Two windows on the same folder: an idle window could close and then delete a checkpoint belonging to a run in progress in the other one.
- The file tree indents without limit, leaving no room for names in deep paths, and showed nothing at all for an empty folder.

## [0.0.9] — The hundred small cuts

Nothing here is a headline feature. It is the set of things you hit ten times a day and work around without thinking about, plus one gutter that was quietly lying to you.

### Editor and tabs

- **Close a tab without aiming at the ✕.** `Ctrl+W`, middle-click, or right-click for close others / close to the right / close all. The close logic — including the unsaved-changes prompt — was already there; the ✕ button was simply the only thing calling it.
- **Reopen a tab you closed by mistake** with `Ctrl+Shift+T`. Cursor and scroll come back with it.
- **`Ctrl+P` on an empty box now lists recent files.** It used to show the first twelve files alphabetically, which made `Ctrl+P` `Enter` — the shortcut for "back to the file I was just in" — go somewhere arbitrary.
- **Font size from the keyboard**, `Ctrl+=` and `Ctrl+-`, instead of opening Settings.
- **Hide the sidebar** with `Ctrl+B`. The panel could not be dragged below 200px, so on a narrow screen there was no way to give the code more room.

### The file tree

- **Opens with deep folders collapsed, and remembers what you collapsed.** Every project used to open fully expanded — a wall of hundreds of rows before you could find anything — and folding a folder was forgotten the moment you switched projects.
- **Right-click a folder to search inside it.** The include filter and its glob backend already existed; reaching them meant opening global search and typing `src/foo/**` by hand.

### The terminal

- **Copy and paste work.** `Ctrl+V` was going to the shell as `\x16`, so pasting a path was impossible. `Ctrl+C` copies only when something is selected — otherwise it stays `SIGINT`, as it must. Right-click copies a selection or pastes when there is none.

### Git

- **The change markers in the gutter update.** They were computed once when the file opened and never again, so after a commit they pointed at changes that no longer existed. They now redraw on save and whenever git state changes.

### Fixed

- Removing an MCP server installed from a bundle left the unpacked server on disk. The removal call existed and nothing was calling it.
- Two JSONC parsers had grown in the codebase. The older one stripped trailing commas with a regex that was not string-aware, so a value like `"x, }"` came back silently truncated — wrong data rather than a parse error. There is one parser now, the one with tests.

## [0.0.8] — A way back

The four pillars on the front page were the promise; only one of them was fully true. Fixing that is most of this release. The rest is the friction you hit every day, and a pass over the claims themselves.

### The change review

- **Accept or reject a proposal one hunk at a time.** The README advertised per-line accept since the beginning, but a proposal was all-or-nothing — the only per-hunk code was demo-only and never touched disk. Now a proposal is split into hunks you can toggle, and only what you kept is written. Everything selected is the default, so accepting a whole proposal behaves exactly as before.
- **The plan panel and the multi-file overview follow real runs.** Both were fed only by the web demo script, which never runs in the desktop app — so on a real turn they stayed empty. The agent now posts its plan through a tool and updates it step by step, and the overview is derived from the actual proposals rather than a parallel list that could drift out of sync.

### Undo a whole run

- **Every run is checkpointed.** With an autonomy policy that applies edits on its own, the only way back was per-file undo in the editor, or git. Now the original bytes of everything a turn touched are kept, and one button puts them back — restoring what was edited and moving what was created to the trash.
- **A file you changed afterwards is never silently overwritten.** Undo shows what it will restore, what it will delete, and what it is leaving alone with the reason: you edited it since, it has unsaved changes open, or it was too large to keep a copy of. It also says plainly that only edits applied through proposals are covered — changes made by terminal commands or MCP tools are not.

### Editor

- **Tabs remember where you were.** Switching away unmounted the editor, so coming back always dropped you at line 1. Cursor, scroll and folds now survive the round trip.
- **Ctrl+D has a counterpart again.** The IntelliJ keymap rebinds Ctrl+D to duplicate the line, which left no way to reach multi-cursor at all. Alt+J adds the next occurrence, Ctrl+Alt+Shift+J selects them all.
- **Path aliases from `tsconfig.json` are honored.** A project using `@/…` filled the problems panel with phantom "cannot find module" errors that buried the real ones.
- **The problems panel shows information-level diagnostics, and can fix them.** Anything below warning was dropped, so a diagnostic underlined in the editor could be missing from the list. Each row also has a Fix button — quick fixes were reachable only from the editor's lightbulb.
- **Rename can move.** Put a `/` in the name and the file moves; `..` walks up, a leading `/` is from the project root. The backend always supported this — the caller only ever swapped the last segment.
- **Copy path, copy absolute path, and duplicate** are in the file tree's context menu.
- **Jump to a search result without losing the list.** F4 and Shift+F4 walk the hits. Seeing thirty matches used to mean opening the panel thirty times.

### Git

- **Amend the last commit.** Turning it on fills in the existing message so it isn't lost, and warns first if the commit is already on the remote.
- **Commits in the history are clickable** and open the full patch.

### Connectors

- **Install an MCP server by dropping an `.mcpb` bundle on the window.** A bundle is someone else's program from the internet, so the dialog shows the exact command that will run, what the bundle asks for, and what tools it brings — before anything is installed. Values marked sensitive are masked in that preview.
- **Subagents are delegation targets.** Agents defined in `.claude/agents` — yours, the project's, or an enabled connector's — can be delegated to by name, with their own instructions and tool limits. They run on whichever model you have connected, never on one you haven't.

### Honest wording

- The front page claimed Gemini and local models; the app ships Claude, OpenAI, Grok and GLM. The list now matches, and the others moved to the roadmap where they belong.
- The edit animation was described as streaming "as it happens." It is a replay, right after the edit lands. The description says so.
- **Review findings follow the interface language.** The reviewer was always asked in Korean, so its findings came back in Korean no matter which of the four languages you were using.
- The last few interface strings that were still hardcoded in Korean — the diff pane, the terminal fallback notice, and the message you see before connecting an AI — now ship in all four languages.

## [0.0.7] — A second pair of eyes

Schutz can now review its own work before you commit it, hand long tasks to the cloud, and reach the skills and connectors you already set up elsewhere. Along the way, three controls that looked like features but did nothing were fixed.

### Review

- **Changes get an independent review.** The reviewer sees the diff and nothing else — no conversation history, no tools, no project instructions. Reusing the agent that just wrote the code makes it lenient about its own work, so this is a separate pass with no shared context. Findings appear as their own cards: they are advice, so they can be dismissed, and they never sit in the same card as an editable proposal.
- **Optionally, review before every commit.** Off by default. When on, committing runs the review first and shows what it found; you proceed or cancel. If the reviewer itself fails, it neither blocks silently nor commits silently — it says so and leaves the decision to you.

### Cloud

- **Delegate a task to Codex Cloud.** Long work no longer has to occupy the local session. Tasks are dispatched, tracked and pulled back through the Codex CLI already on your machine, so there is no new sign-in. Cloud opens the pull request itself. If no cloud environment is linked to the repository — the usual reason this fails — it says where to link one instead of showing raw output.

### Connectors

- **Connectors carry logos and the name matches Claude Desktop.** The catalog ships no icons, so the repository owner's avatar stands in; 226 of 244 entries resolve, and the rest fall back to a monogram. Interrupted downloads no longer appear in the list as `.name.tmp`.

### Editor

- **New file and new folder work.** Clicking them did nothing at all, because Electron returns null from the prompt they relied on. Both now use an inline input in the tree, and hovering a folder reveals the create buttons. Rename was broken the same way and is fixed with it.
- **Splitting the editor goes to four panes.** The split button cycles one → two → four → back, and its icon shows what the next click will produce. Tabs can be dragged between splits. `Ctrl+Alt+1/2/4` work now; the menu advertised those shortcuts but nothing ever handled them.
- **The status bar language follows the file.** It read stale after switching tabs because it only updated when an editor took focus. Clicking it changes the language mode.

### Crashes

- **Report an error in one click.** The crash screen fills in the stack, version and environment and opens the report page. Nothing is sent on its own — a stack can carry your file paths, so you see what goes out before it does.

## [0.0.6] — Schutz reaches into the engine

Schutz can now drive a creative engine, not just a codebase. OVERDARE Studio is the first one it speaks to, and you can watch what it builds instead of reading about it. Chat learned to take a picture.

### Game engine

- **Schutz connects to OVERDARE Studio and works inside it.** It reads the DataModel tree, writes Luau, places instances, imports assets and runs a playtest — through the MCP host Schutz already runs, so connecting is one click from the MCP panel or from the first-run setup.
- **A dedicated engine view.** Status, a live 3D viewport, the scene tree and play/stop/save in one panel, so you can see what was built rather than infer it from tool output. The titlebar button only appears once an engine is attached.
- **Dangerous calls ask first.** Publishing, deleting and arbitrary execution now go through the same approval bar shell commands use. An asset import whose id did not come from the catalog is blocked even under full autonomy, because a wrong id permanently freezes Studio — and writing while a playtest is running is blocked for the same reason.
- **Engine tools reach the model without a code project open.** Tools used to be attached only when a workspace was open, so anyone who wanted to build a game and nothing else found the engine invisible.
- **First-run setup offers the engine.** Pick your project folder and it connects; if the connector is missing it is fetched from the creator's GitHub repository, with the creator credited on the install screen.

### Chat

- **Attach real files and images.** Show a screenshot and say "make it like this". The button, `Ctrl+V` and drag-and-drop all work, including pictures from outside the project and straight from the clipboard. Images go to the model as images; text files are inlined as before.

### Downloads

- **A download page.** [schutzscript.github.io/Schutz](https://schutzscript.github.io/Schutz/) detects your system and offers the one installer you need.
- **Releases carry only installers now.** A release used to ship fifteen files because the auto-update by-products rode along, burying the installers. Auto-update is off and a release is five files: one per platform.

## [0.0.5] — A first run that shows, not tells

A pass over the first-run experience and a few things that were rough in daily use. Every setting page now demonstrates the choice with the app's real behavior, the window keeps running in the tray, and streaming no longer stutters.

### First run

- **Every setup page now shows a real example, not just buttons.** AI connection shows each provider's role (manager · plans and delegates, versus takes tasks and runs commands), reflecting the actual manager assignment. Autonomy shows how the same files are judged under each policy — `README.md` and `utils.test.ts` auto-accept, `main.ts` waits for review — straight from the real auto-accept rules. Keymap is three cards, each with that editor's actual shortcuts (IntelliJ `Ctrl+D` duplicate line, VS Code `Ctrl+D` next occurrence, Vim `dd`/`yy`/`:w`). Type shows a live code preview in the chosen fonts and size.
- **The logo and title stay put as you page through setup.** They used to drift up and down because each page re-centered the whole column; the header is now pinned above the scrolling content.
- **A short "now, a quick demo" beat** sits between setup and the demo, so the IDE no longer appears out of nowhere.
- **Enter no longer skips the rest of setup.** It advanced straight to the demo from any page — a leftover from when setup was one screen. It now moves one page at a time and only launches on the last, and a key typed into the API-key field no longer leaks to the window shortcuts.
- The first-screen credit line is now a fixed "Powered by Electron"; the full stack is credited in the About window.

### Tray

- **Closing the window minimizes to the tray instead of quitting.** The app keeps running — in-flight agent turns and dev servers stay alive, and the tray icon marks that it's still there. Reopen from the tray; quit from its menu. (macOS keeps its own convention.)

### Fixes

- **Mode switching by shortcut (`Ctrl+Shift+M`) now animates.** Holding the key spilled auto-repeat events that restarted the morph every frame, and overlapping switches wiped each other's transition names mid-flight. Repeats are ignored and a switch in progress is left to finish.
- **The version shown in About was stuck at 0.0.3** even after 0.0.4 shipped — it was hand-typed. It's now injected from `package.json` at build time, so it stays correct every release.
- **The guided tour cards no longer jump** as you advance — the welcome and closing cards were missing the skeleton figure the middle cards had, so the text shifted; every card carries one now.
- **App and taskbar icon color** no longer sticks on the wrong theme color when themes are switched quickly.

### Performance

- **Streaming AI replies no longer stutter.** Each token used to re-render the entire UI and re-sort the transcript; text now commits at most ~25 times a second, and the transcript timeline is memoized so unrelated re-renders (typing in the composer) skip the work.
- **Agent mode stops rebuilding the hidden file tree** on every render — a large workspace was reconstructing thousands of rows behind a `display:none`.

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
