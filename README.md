# Spackle

**Point at what's broken. Let Claude fix it.**

Spackle is a Chrome extension that lets you drop sticky notes anywhere on a webpage to flag UI issues — a misaligned button, a wrong color, a hover state that doesn't quite work — and then bundles every note on the page into a single, well-formed prompt you can paste into Claude for a one-shot fix.


https://github.com/user-attachments/assets/b984a429-13c9-4dc4-a9a9-8a77ad642619




## The problem

When you're reviewing a UI, you can *see* what's wrong in seconds. Describing it in words is the slow part:

> "The submit button on the right side of the third card — not the one in the header, the one inside the modal — has the wrong padding and the hover state flickers."

By the time you've written that, you could have fixed it yourself. And if you're handing the work off to an AI, ambiguous prose produces ambiguous diffs.

Spackle replaces that paragraph with a pin and a sentence. You point. You type. You move on. When you're done reviewing, the whole batch becomes a structured prompt — grouped by URL, with each note's location and content — ready for Claude to act on.

## How it works

Three ways to drop a note, depending on what your hands are doing:

- **Cmd-click (or Ctrl-click) anywhere on the page.** Fastest path. The modifier key tells Spackle "this click is for me," not the page.
- **Right-click → "Spackle: drop a note here."** Discoverable, no shortcut to remember.
- **Toolbar popup → "+ Drop a note."** Click anywhere on the page to place the pin.

Each note is a tiny pinned textarea. Notes persist in `chrome.storage.local` keyed by URL, so reloading the page brings them back. When you're ready, open the popup and copy the bundled prompt — it groups every note across every page you've annotated into a single markdown block aimed at Claude.

## Stack

- **Vite 6 + CRXJS** for the build pipeline and HMR-friendly extension dev loop.
- **TypeScript** end to end.
- **Vanilla TS** in the content script (lighter footprint, fewer style-leak surprises when injecting into arbitrary pages).
- **React 19** in the toolbar popup.
- **Manifest V3** with a service worker background, shadow-DOM-isolated content overlay, and storage-backed persistence.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts Vite with CRXJS, which writes an unpacked extension to `dist/` and rebuilds on save.

To load it into Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` directory.

The extension currently activates on `http://localhost/*` and `http://127.0.0.1/*` — point it at whatever app you're hacking on.

### Reload semantics

CRXJS handles most reloads for you, but content scripts are an exception:

| You changed... | What happens |
|---|---|
| Manifest, background, popup | Extension auto-reloads. Reopen the popup. |
| Content script | Extension auto-reloads, but the **open tab needs a manual refresh** to inject the new script. |

### Other commands

- `npm run build` — typecheck and produce a production bundle in `dist/`.
- `npm run typecheck` — TypeScript only, no emit.

There is no test runner configured.

## Project layout

```
src/
  content/      Injected into every matched page. Owns the shadow-DOM overlay,
                pin rendering, and the three note-placement flows.
  background/   MV3 service worker. Registers the context menu and routes
                messages between popup and content script.
  popup/        React 19 app for the toolbar. Lists notes and builds the
                final Claude prompt.
  lib/          Shared code: storage keys, message types, prompt builder.
```

See [`CLAUDE.md`](./CLAUDE.md) for the deeper architectural notes — message flow between contexts, why shadow DOM is mandatory, and the gotchas that have already bitten us.

## Status

Early. The placement, persistence, and prompt-bundling loop works; the polish (cross-origin support, richer prompt formatting, optional auto-send to the Claude API) is on the way.
