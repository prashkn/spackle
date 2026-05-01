Here's what's going on under the hood. Two pieces — how pnpm launch
  boots Vite, and how the hover overlay works.

  1. How pnpm launch boots via Vite

  The root script chains into the CLI package:

  - package.json (root): launch: NODE_OPTIONS='--max-old-space-size=8192'
  pnpm --filter @tanium/cli-ufe ufe launch
  - That runs the ufe launch bin from internal/cli-ufe/bin/ufe-launch.js,
  which spins up Vite using internal/cli-ufe/src/lib/vite/vite.config.mts.

  That launch config merges two layers:

  1. Base — internal/ufe-vite/src/vite.config.mjs (exported as
  baseViteConfig from @tanium/ufe-vite). Shared by every Vite-using
  package: React-SWC, Emotion SWC plugin, Node polyfills (buffer/util),
  the Certainty/CoreUI graphics SVG plugin, Vitest defaults, and —
  importantly — the TanStack DevTools plugin.
  2. Launch-specific — internal/cli-ufe/.../vite.config.mts. Adds:
    - HTTPS for localhost via @tanium/devcert
    - root: UFE_ROOT and base: '/ui' (serves the shell at
  https://localhost/ui)
    - server.warmup for ufe-shell entry files (faster cold start)
    - proxyTaniumServer({ taniumServer }) — proxies API calls to the
  Tanium server from UFE_LAUNCH_CONFIG
    - vite-plugin-inspect — exposes /__inspect/ for browsing
  module-transform output (this is a Vite inspector, not the component
  overlay)

  Individual packages (e.g. workbench-engage/vite.config.mts) just
  mergeConfig(baseViteConfig, { base, plugins:
  [generateWorkbenchJson(...)] }) so they inherit the overlay
  automatically.

  2. The "hover over a component" overlay

  That's TanStack DevTools, wired in via @tanstack/devtools-vite. It's
  configured once in the base config at
  internal/ufe-vite/src/vite.config.mjs:102-131:

  devtools({
    injectSource: {
      enabled: true,
      ignore: { files: [/createAnyComponent.tsx$/] },
    },
    editor: {
      name: 'Default Editor',
      open: async (filePath, lineNumber, columnNumber) => {
        const filePathString = filePath.split('/internal/cli-ufe')[1];
        if (filePathString) {
          const launch = (await import('launch-editor')).default;
          launch(`${filePathString}:${lineNumber}:${columnNumber}`,
  undefined, ...);
        }
      },
    },
  }),

  What happens at runtime:

  1. Source injection (build-time). injectSource rewrites JSX during
  transform so each rendered element carries its origin file:line:col as
  metadata. That's how the overlay knows "this DOM node came from
  MyComponent.tsx:42."
  2. Overlay (browser). The plugin injects a Solid-based devtools UI
  (@tanstack/devtools-ui, @tanstack/devtools-client) into the page. When
  you hover, it reads the injected metadata and highlights the component
  bounds + shows the source location.
  3. Click-to-source (round trip). When you click a component, the browser
   sends the filePath/line/col to the Vite dev server over the devtools
  event bus. The editor.open callback above runs in Node, dynamically
  imports launch-editor, and opens that exact line in your default IDE (VS
   Code, etc., based on your EDITOR env or auto-detection).

  Two small wrinkles worth knowing:
  - Files matching createAnyComponent.tsx$ are excluded from injection
  (likely because they're a generated/dynamic factory and the source
  mapping would be misleading).
  - The open handler strips everything before /internal/cli-ufe from the
  path before passing to launch-editor — that normalizes the absolute path
   Vite reports back to a repo-rooted path your editor can resolve.

  So in short: TanStack DevTools provides the overlay + event protocol,
  injectSource stamps JSX with origin info at transform time, and
  launch-editor is what actually opens the file when you click.

✻ Cooked for 2m 56s

❯ can you write a write up, enough for another agent in another project
  to understand how to implement the overlay, source injection, etc.

⏺ Component Hover Overlay + Click-to-Source — Implementation Guide

  What it is

  A Vite-only dev experience that:
  1. Highlights React components on hover in the browser, showing their
  source file/line.
  2. Opens the source file in your IDE at the exact line/column when you
  click.

  Powered by @tanstack/devtools-vite plus launch-editor. No app-side code
  or React provider is required — it's a single Vite plugin.

  Prerequisites

  - Vite-based dev server (works with any framework; this guide assumes
  React).
  - The dev server runs in Node (so launch-editor can spawn the editor
  process locally).

  Install

  pnpm add -D @tanstack/devtools-vite launch-editor

  Versions known to work together: @tanstack/devtools-vite@^0.4.0,
  launch-editor@^2.x. Pull whatever is current.

  Vite config

  Add the plugin to your Vite config — typically the shared/base config so
   every package picks it up.

  // vite.config.ts
  import { defineConfig } from 'vite';
  import { devtools } from '@tanstack/devtools-vite';
  import react from '@vitejs/plugin-react'; // or -swc

  export default defineConfig({
    plugins: [
      devtools({
        // 1. Stamp JSX with source-location metadata at transform time.
        //    The overlay reads this metadata at runtime to know "this DOM
   node
        //    came from src/Foo.tsx:42:5".
        injectSource: {
          enabled: true,
          ignore: {
            // Skip files where injected line numbers would be misleading
            // (codegen, dynamic component factories, generated barrels,
  etc.)
            files: [/generatedComponent\.tsx$/],
          },
        },

        // 2. Click-to-source handler. Runs in Node on the dev server.
        //    Receives the file/line/col the overlay clicked on, and is
        //    expected to actually open the editor.
        editor: {
          name: 'Default Editor',
          open: async (filePath, lineNumber, columnNumber) => {
            // Normalize the absolute path Vite reports back into
  something
            // your editor can resolve. See "Path normalization" below.
            const repoRelative = filePath.split('/your-repo-marker/')[1]
  ?? filePath;

            const launch = (await import('launch-editor')).default;
            launch(
              `${repoRelative.replaceAll('$', '\\$')}` +
                `${lineNumber ? `:${lineNumber}` : ''}` +
                `${columnNumber ? `:${columnNumber}` : ''}`,
              undefined,
              (filename, err) => {
                console.warn(`Failed to open ${filename} in editor:
  ${err}`);
              },
            );
          },
        },
      }),
      react(),
    ],
  });

  That's the entire integration. Run vite and the overlay UI is
  auto-injected into the page.

  How it works at runtime

  1. Build-time (injectSource): every JSX element produced by your code
  gets origin metadata (file, line, column) attached during Vite's
  transform pass. This is what makes "I hovered a <Button> — what file did
   it come from?" possible without a React-DevTools-style runtime tree
  walk.
  2. Browser overlay: the plugin injects a Solid-based devtools UI
  (@tanstack/devtools-ui / -client are pulled in transitively) that
  renders on top of your app. On hover, it reads the injected metadata and
   draws bounds + a label showing the source location.
  3. Click → IDE round trip: clicking a component in the overlay sends {
  filePath, lineNumber, columnNumber } over the devtools event bus to the
  Vite dev server. Your editor.open callback runs in Node and uses
  launch-editor to spawn code -g path:line:col (or the editor configured
  by $EDITOR / launch-editor config). The browser is just the trigger —
  the editor opens on the same machine running vite.

  Path normalization (the part you have to customize)

  filePath in editor.open is absolute on the dev server's filesystem.
  launch-editor works fine with absolute paths, but in monorepos you often
   want to strip a prefix so the editor opens the file via a
  workspace-relative path (which can be more reliable for monorepo
  workspaces, dotfiles, etc.).

  In UFE the rule is: split on a known repo marker (/internal/cli-ufe) and
   keep the right side. For your project, pick a stable directory in your
  repo's path and apply the same trick — or just pass filePath straight
  through if absolute paths work fine.

  Also escape $ (some shells / editor protocols misinterpret it) —
  filePath.replaceAll('$', '\\$') is the cheap safe move.

  What ignore.files is for

  Files where injected line numbers would point at code the user didn't
  write — codegen output, dynamic React.createElement factories, barrel
  re-exports — should be excluded. Otherwise hovering shows a confusing
  "this came from generated.ts:1" for everything. The pattern is regex
  matched against the file path.

  Gotchas

  - Vite-only. This plugin is not a Webpack/Rspack plugin. If half your
  packages still build with Webpack, those packages won't have the
  overlay; the overlay only attaches to the Vite-served pages.
  - Source injection has a perf cost in dev (extra AST work per JSX
  element). Keep it enabled: true only in dev — in a build config used for
   production, omit the plugin entirely or set enabled: false.
  - The plugin owns the UI. You can't easily restyle or relocate the
  overlay; treat it as a black-box dev tool. If you need a custom
  inspector, look at @react-dev-inspector instead — different mechanism,
  same idea.
  - Editor selection. launch-editor picks the editor from
  process.env.LAUNCH_EDITOR, then process.env.EDITOR, then a heuristic.
  Document this for your team if VS Code isn't being picked up
  automatically.
  - Don't conflate with vite-plugin-inspect. UFE also installs
  vite-plugin-inspect, which exposes /__inspect/ for inspecting Vite
  plugin transforms (not React components). They're complementary but
  solve different problems — don't promise users one when you've installed
   the other.

  Optional companion: transform inspector

  For debugging "what does my code look like after all the Vite plugins
  ran?":

  pnpm add -D vite-plugin-inspect

  import Inspect from 'vite-plugin-inspect';
  // ...
  plugins: [Inspect(), devtools({...}), react()]

  Visit http://localhost:<port>/__inspect/ while the dev server is
  running. Independent of the component overlay.

  Minimal repro checklist for a new project

  1. pnpm add -D @tanstack/devtools-vite launch-editor
  2. Add the devtools(...) plugin to vite.config.ts with
  injectSource.enabled: true and an editor.open that calls launch-editor.
  3. Run vite — overlay shows up automatically.
  4. Hover any component → see the file/line label. Click → IDE opens at
  that line.
  5. If the editor doesn't open: check $EDITOR/$LAUNCH_EDITOR, then check
  the dev-server console for the Failed to open warning printed by the
  callback.

  That's everything needed to replicate UFE's hover/click-to-source
  behavior in another React+Vite project.