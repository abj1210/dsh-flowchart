// The browser half's build step.
//
// DSH does not compile a client half for you: it serves whatever `exports["./client"]`
// points at into a frozen module table and calls the factory it registers. A
// third-party package therefore has to ship that file already built, wrapped in
// the handoff DSH's own client bundles use (`packages/client/tsdown.client.ts`):
//
//     window.__ModuleLoader__.load({ id: '<package name>', factory: (require) => {
//       var module = { exports: {} }; var exports = module.exports;
//       <bundle>
//       return module.exports; } });
//
// esbuild does the bundling and this script adds the wrapper, so the source can
// stay ordinary CommonJS with `require('react')` — the two modules the module
// table answers for are `react` and the client service packages, everything
// else is inlined. Run it with `node build.mjs`; it needs esbuild resolvable
// from this directory or from a workspace above it.

import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'))
const outfile = join(here, 'lib', 'client.js')

/** Platform words the browser module table seeds; a bundle must not inline them. */
const EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** The bundle's own `require` may only ask the module table for these. */
const ALLOWED_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
])

/**
 * Resolve esbuild. This package carries its own copy under `node_modules`, so
 * the plain resolution below is the normal path; the pnpm-store search only
 * matters when the copy has been pruned and a workspace above happens to have
 * one.
 * @returns the esbuild module.
 */
function loadEsbuild() {
  const require = createRequire(join(here, 'package.json'))
  try {
    return require('esbuild')
  } catch {}
  let dir = here
  for (let hops = 0; hops < 8; hops += 1) {
    dir = dirname(dir)
    const store = join(dir, 'node_modules', '.pnpm')
    if (!existsSync(store)) continue
    const entry = readdirSync(store).find(name => /^esbuild@\d/u.test(name))
    if (entry === undefined) continue
    const candidate = join(store, entry, 'node_modules', 'esbuild')
    if (existsSync(join(candidate, 'lib', 'main.js'))) return require(candidate)
  }
  throw new Error(
    'build.mjs: esbuild is not resolvable. Install it here (`pnpm add -D esbuild`) '
    + 'or point ESBUILD_BINARY_PATH at an executable.',
  )
}

const esbuild = loadEsbuild()
const result = await esbuild.build({
  entryPoints: [join(here, 'src', 'client.js')],
  bundle: true,
  outfile,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  external: EXTERNAL,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
})

// A bundling slip shows up as a module-table miss at runtime, in the browser,
// far from here — so refuse to emit a bundle that asks for anything outside the
// platform words it is allowed to depend on.
const requests = new Set()
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) if (imported.external === true) requests.add(imported.path)
}
const unsupported = [...requests].filter(request => !ALLOWED_EXTERNALS.has(request))
if (unsupported.length > 0) {
  throw new Error(
    `build.mjs: the bundle requires ${unsupported.join(', ')}, which the browser module table does not answer. `
    + 'Inline the dependency or add it to dsh.client.external in package.json.',
  )
}

const body = await readFile(outfile, 'utf8')
const wrapped = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  body,
  'return module.exports; } });',
  '',
].join('\n')
await writeFile(outfile, wrapped)

const bytes = Buffer.byteLength(wrapped)
console.log(`built lib/client.js (${bytes} bytes, id ${manifest.name}, externals: ${[...requests].join(', ') || 'none'})`)
