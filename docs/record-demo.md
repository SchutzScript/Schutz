# Recording `docs/assets/demo.gif`

The README demo is captured from the running app, not mocked up. Re-record it whenever
the UI changes enough that the GIF starts lying about what Schutz looks like.

## What the clip has to show

One loop, no narration, under ~25 seconds:

1. A project open with a file in the editor and a prompt already typed.
2. The request goes out; the agent panel wakes up.
3. Proposals arrive as diffs — red removals, green additions — while the chat explains why.
4. The edit lands in the file.

That sequence is the whole pitch: you see the process, not just the result. Keep the UI in
**English** so it matches the README, and use the default Feldgrau (dark) theme.

## How

The app exposes a remote debugging port, so frames come straight from the renderer —
no screen recorder, no cursor artifacts, deterministic timing.

1. Start the app with remote debugging on port `9333`.
2. Set the UI language to English (Settings → Language, or `localStorage.schutz.lang = "en"`).
3. Open a small demo project and type the prompt **without sending it**.
4. Start capturing, then send the prompt.

Capture with **`Page.startScreencast`**, not `Page.captureScreenshot`. captureScreenshot is
request/response — about half a second per frame, which caps you at ~2 fps and produces a
slideshow. A screencast pushes a frame on every repaint (~28 fps here) and sends nothing
while the screen is still, so idle stretches cost nothing.

The window must be **focus-emulated first** — a hidden window paints no frames at all, so
a screencast returns zero frames and a screenshot loop returns identical stills:

```
Emulation.setFocusEmulationEnabled {"enabled": true}
Page.bringToFront {}
```

Record the arrival time of each frame and use the real gaps as the GIF's per-frame delays.
Screencast frames are not evenly spaced, and forcing a constant delay makes fast moments
crawl and slow ones jump.

Give the capture a generous window — an agent turn can spend 30 s planning before the first
diff appears, and a clip that ends mid-plan has no payoff. Capture long, then cut.

## Framing

A raw full-viewport capture reads as a flat screenshot. The window has to sit **on** something:
round its corners (~12px), drop a soft blurred shadow under it, and place it on a background
with margin around all four sides.

The background must be **lighter than the app**. Schutz is near-black, so a dark backdrop
merges with it and the window stops looking like an object. A mid-tone Sage gradient
(the brand colour, which is background-only by convention) gives the contrast that makes it
float. Push the shadow harder as the background gets lighter.

Current numbers: window 880px wide, 40px margin, 960×623 canvas.

## Encoding

Any GIF encoder works; the constraints that matter:

- **Per-frame palette.** A single global palette smears the syntax colors when the layout
  changes mid-clip.
- **Box-filter downscale, not nearest-neighbour.** Nearest-neighbour shreds small text.
- **Difference the frames.** This is the one change that matters. Write one global palette,
  reserve an index for transparency, and for every frame after the first set every pixel
  that matches the previous frame to that index with `dispose: 1`. Unchanged regions become
  long identical runs and LZW eats them. On this clip that was **2054 KB → 121 KB for the
  same 40 frames** — an IDE screen is ~99% static between frames, and writing it in full
  every time was the entire cost. That headroom is what pays for 28 fps.
- **Keep it around 2 MB.** GitHub serves it on every README view.
- Posterising the background to help LZW does **not** work: the encoder re-quantises anyway,
  so you get banding for nothing (measured: 2502 KB → 2595 KB).

## Why not a video

GitHub renders `<video>` in issues and PRs but not in a repository README, so an animated
GIF is the only inline option. That is also why length matters — there is no play button
and no way to pause.
