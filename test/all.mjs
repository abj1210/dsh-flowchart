// Every suite, in one run: `node test/all.mjs`.
//
// The three have different subjects — the drawing and the parser, the host half's
// contract with the harness, and the browser half as the page loads it — but a
// change to any of them is a change to the same bundle, so they run together.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const suites = ['smoke.mjs', 'host.mjs', 'client.mjs']

let failed = 0
for (const suite of suites) {
  const result = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' })
  if (result.status !== 0) failed += 1
}

if (failed > 0) {
  console.error(`${failed} of ${suites.length} suites failed`)
  process.exit(1)
}
console.log(`all ${suites.length} suites passed`)
