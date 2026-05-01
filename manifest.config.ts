import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Spackle',
  version: '0.0.1',
  description:
    'Drop sticky notes on any webpage to flag UI issues, then bundle them into a single Claude prompt for one-shot fixes.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Spackle',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://localhost/*', 'http://127.0.0.1/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
    {
      matches: ['http://localhost/*', 'http://127.0.0.1/*'],
      js: ['src/content/main.ts'],
      run_at: 'document_idle',
      world: 'MAIN',
    },
  ],
  permissions: ['storage', 'activeTab', 'tabs'],
})
