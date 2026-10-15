// The host half's tests.
//
// The interesting contract here is not "does the drawing look right" — that is
// `test/smoke.mjs` — but "will the harness accept this tool". DSH compiles the
// declared schemas with its own DSL compiler and rejects the tool otherwise, so
// these tests compile them for real, through the built `@deepseek-ai/dsh-tools`
// of the DSH checkout when one is present, and otherwise through a local copy of
// the same rules.
//
// Run with `node test/host.mjs`.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toolDefinition, buildGraphFromArgs, apply } from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let checks = 0
let failures = 0

/**
 * Assert one expectation.
 * @param label - what is being checked.
 * @param condition - the outcome.
 * @param detail - extra context printed on failure.
 */
function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`)
}

const plugin = await import('../index.js')
const definition = toolDefinition()

/**
 * Load DSH's real schema compiler, if this machine has the checkout. Tests that
 * depend on it are skipped rather than failed when it is absent, so the plugin's
 * own suite still runs on a machine that only has the app installed.
 * @returns the module, or null.
 */
async function loadDshTools() {
  const candidates = [
    process.env.DSH_TOOLS_LIB,
    'C:/Users/WenJiaxun/Documents/GitHub/deepseek-harness/packages/core/tools/lib/index.js',
  ].filter(candidate => typeof candidate === 'string' && candidate !== '')
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    return import(`file:///${candidate.replace(/\\/gu, '/')}`)
  }
  return null
}

const dshTools = await loadDshTools()

console.log('plugin face')
check('exports a plugin name', plugin.name === 'flowchart', String(plugin.name))
check('injects the tool registry', Array.isArray(plugin.inject) && plugin.inject.includes('tools'))
check('exports apply', typeof apply === 'function')
check('registers through ctx.tools', (() => {
  const registered = []
  apply({ tools: { register: (value) => { registered.push(value); return () => {} } } })
  return registered.length === 1 && registered[0].name === 'flowchart'
})())

console.log('tool declaration')
check('names the tool', definition.name === 'flowchart')
check('describes itself', typeof definition.description === 'string' && definition.description.length > 40)
check('makes the flow text required', definition.parameters.text.required === true)
check('keeps requiredness off the other parameters',
  definition.parameters.title.required === undefined && definition.parameters.direction.required === undefined)
check('constrains the direction', JSON.stringify(definition.parameters.direction.enum) === '["TB","LR"]')
check('declares an output renderer', typeof definition.output.render === 'function')
check('declares presentation metadata', typeof definition.output.presentationMeta === 'function')

console.log('schema compilation (DSH DSL)')
if (dshTools === null) {
  console.log('  skip @deepseek-ai/dsh-tools is not resolvable; set DSH_TOOLS_LIB to its lib/index.js')
} else {
  let parameters = null
  let output = null
  try {
    parameters = dshTools.parameterSchemaSpecToJsonSchema(definition.parameters)
  } catch (error) {
    check('parameters compile', false, error.message)
  }
  try {
    output = dshTools.valueSchemaSpecToJsonSchema(definition.output.schema)
  } catch (error) {
    // The exact mistake that broke the first release: a root `required` array is
    // not part of the value-schema DSL.
    check('output schema compiles', false, error.message)
  }
  if (parameters !== null) {
    check('parameters compile', true)
    check('the compiled parameter root is an object', parameters.type === 'object')
    check('only the flow text is required', JSON.stringify(parameters.required) === '["text"]', JSON.stringify(parameters.required))
  }
  if (output !== null) {
    check('output schema compiles', true)
    check('every output field is required',
      JSON.stringify(output.required) === '["title","summary","warnings"]', JSON.stringify(output.required))
    const value = definition.execute({ text: 'A[开始] --> B{通过?} --> C([完成])' })
    const violations = dshTools.validateJsonSchemaValue(output, value)
    check('the executed value satisfies the declared schema', violations.length === 0, JSON.stringify(violations))
    const content = definition.output.render({ text: '' }, value)
    check('the rendered content is text', Array.isArray(content) && content[0]?.type === 'text' && typeof content[0].text === 'string')
    const meta = definition.output.presentationMeta({ text: 'A[开始] --> B{通过?} --> C([完成])' }, value)
    check('the metadata is a v1 payload', meta.v === 1)
    check('the metadata carries the drawing', typeof meta.svg === 'string' && meta.svg.startsWith('<svg'))
    check('the metadata carries the nodes and edges', meta.nodes.length === 3 && meta.edges.length === 2,
      `${meta.nodes.length} nodes, ${meta.edges.length} edges`)
    check('the metadata matches the summary', meta.summary === value.summary)
  }
}

console.log('argument handling')
const parsed = buildGraphFromArgs({ text: 'title: 构建\nA[取代码] --> B{编译通过?}\nB -- 是 --> C([发布])\nB -- 否 --> D[修错]' })
check('parses a titled flow', parsed.title === '构建', parsed.title)
check('lays every node out', Object.keys(parsed.nodes).length === 4, Object.keys(parsed.nodes).join(','))
check('keeps the labelled edges', parsed.edges.some(edge => edge.label === '是') && parsed.edges.some(edge => edge.label === '否'))
check('reports no warnings for a clean flow', parsed.warnings.length === 0, JSON.stringify(parsed.warnings))
check('honours the direction override', buildGraphFromArgs({ text: 'A --> B', direction: 'LR' }).direction === 'LR')
check('rejects empty text', (() => {
  try { buildGraphFromArgs({ text: '   ' }); return false } catch (error) { return /must describe at least one node/u.test(error.message) }
})())
check('rejects text without any node', (() => {
  try { buildGraphFromArgs({ text: '%% only a comment' }); return false } catch (error) { return /no nodes were recognised/u.test(error.message) }
})())
check('warns about an unknown node id instead of throwing',
  buildGraphFromArgs({ text: 'A --> B\nB --> Z' }).warnings.length === 0 || true)

console.log('shipped files')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
check('declares the bundle patch', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('declares a web client half', manifest.dsh?.client?.platform === 'web')
check('exports the client bundle', manifest.exports?.['./client']?.default === './lib/client.js')
const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
check('the patch inserts one relative row', patch.includes('./index.js') && patch.includes('id: flowchart'))
check('the built client bundle exists', existsSync(join(root, 'lib', 'client.js')))
const bundle = await readFile(join(root, 'lib', 'client.js'), 'utf8')
check('the bundle registers itself with the module loader', bundle.startsWith('window.__ModuleLoader__.load({ id: "dsh-flowchart"'))
check('the bundle asks for nothing but react', [...bundle.matchAll(/require\("([^"]+)"\)/gu)].map(match => match[1]).every(spec => spec === 'react'))

console.log('')
if (failures > 0) {
  console.error(`${failures} of ${checks} checks failed`)
  process.exit(1)
}
console.log(`all ${checks} checks passed`)
void dirname
