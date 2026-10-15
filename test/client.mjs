// The browser half's tests.
//
// `lib/client.js` is a script for the page's module loader, so it is exercised
// the way the page loads it: this file installs a fake loader, evaluates the
// bundle with a `require` that answers precisely the platform words the real
// module table seeds, and then drives the plugin face the bundle registered.
// React is a stub with just enough of the hook contract to render a component
// once and to run its effects.
//
// Run with `node test/client.mjs`.

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraph, renderSvg, describe as describeGraph } from '../lib/graph.cjs'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = await readFile(join(here, '..', 'lib', 'client.js'), 'utf8')

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

/** A tiny React stub: element objects, hooks across one render, effects recorded. */
function makeReact() {
  const state = { hooks: [], index: 0, effects: [] }
  const createElement = (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  })
  return {
    React: {
      createElement,
      useState(initial) {
        const slot = state.index
        state.index += 1
        if (state.hooks[slot] === undefined) state.hooks[slot] = typeof initial === 'function' ? initial() : initial
        return [state.hooks[slot], (next) => {
          state.hooks[slot] = typeof next === 'function' ? next(state.hooks[slot]) : next
        }]
      },
      useRef(initial) {
        const slot = state.index
        state.index += 1
        if (state.hooks[slot] === undefined) state.hooks[slot] = { current: initial }
        return state.hooks[slot]
      },
      useEffect(effect) {
        state.effects.push(effect)
      },
    },
    reset() {
      state.index = 0
      state.effects = []
    },
    runEffects() {
      const pending = state.effects
      state.effects = []
      for (const effect of pending) effect()
    },
  }
}

/**
 * Walk a rendered tree, invoking function components.
 * @param node - an element, an array, or a leaf.
 * @param react - the stub.
 * @returns the tree with function components replaced by what they returned.
 */
function render(node, react) {
  react.reset()
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk)
    if (value === null || typeof value !== 'object') return value
    if (typeof value.type === 'function') return walk(value.type(value.props))
    return { type: value.type, props: { ...value.props, children: walk(value.props.children) } }
  }
  return walk(node)
}

/** Every element in a rendered tree, flattened. */
function flatten(tree) {
  const found = []
  const visit = (node) => {
    if (Array.isArray(node)) { for (const child of node) visit(child); return }
    if (node === null || typeof node !== 'object') return
    found.push(node)
    visit(node.props.children)
  }
  visit(tree)
  return found
}

/** Collect every element of one type. */
function findAll(tree, type) {
  return flatten(tree).filter(node => node.type === type)
}

/** Every string in a rendered tree. */
function textOf(tree) {
  return flatten(tree)
    .flatMap(node => (typeof node.props.children === 'string' ? [node.props.children] : []))
    .join(' ')
}

const react = makeReact()

/** A stand-in for the page's `__ModuleLoader__`. */
const registrations = new Map()
const fakeWindow = { __ModuleLoader__: { load: ({ id, factory }) => registrations.set(id, factory) } }

const requested = []
const requireFromTable = (spec) => {
  requested.push(spec)
  if (spec === 'react') return react.React
  throw new Error(`test: the bundle asked for "${spec}", which the platform module table does not seed`)
}

// The bundle is a script for the page: it reads `window` and registers itself.
new Function('window', 'require', bundle)(fakeWindow, requireFromTable)

console.log('client bundle')
check('registers exactly one module', registrations.size === 1, [...registrations.keys()].join(', '))
const factory = registrations.get('dsh-flowchart')
check('registers under the package name', typeof factory === 'function')

const face = factory(requireFromTable)
check('exports a plugin name', face.name === 'dsh-flowchart', String(face.name))
check('exports the slots injection', Array.isArray(face.inject) && face.inject.includes('slots'))
check('exports apply', typeof face.apply === 'function')

// A recording stand-in for the client plugin context.
const seats = []
const services = { registrations: [] }
const ctx = {
  slots: {
    inject(_name, callback) { callback() },
    register(definition, component) {
      seats.push({ name: definition.name, key: definition.key, component })
      return () => {}
    },
  },
  inject(deps, callback) {
    services.waited = deps
    callback(services)
  },
}
services.sidebarRight = { openTab() {}, openTabIn() {} }
services.sidebarRightTabs = { register: (definition) => { services.registrations.push(definition) } }

let styleInstalled = false
globalThis.document = {
  head: { append: () => { styleInstalled = true } },
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, textContent: '' }),
}
globalThis.window = fakeWindow

face.apply(ctx)

check('waits on the sidebar services', Array.isArray(services.waited) && services.waited.includes('sidebarRightTabs'), JSON.stringify(services.waited))
check('registers its tab type', services.registrations[0]?.kind === 'flowchart', JSON.stringify(services.registrations[0]?.kind))
check('gives the tab a title', services.registrations[0]?.title() === '流程图')
check('injects the sidebar stylesheet', styleInstalled)
check('registers a tab body', seats.some(seat => seat.name === 'sidebar.right.pane.tab' && seat.key === 'flowchart'))
check('registers a tool view', seats.some(seat => seat.name === 'tool.call.toolview' && seat.key === 'flowchart'))

// A diagram as the host half would have produced it.
const graph = buildGraph({
  title: '发布流程',
  nodes: [
    { id: 'a', label: '开始', shape: 'start' },
    { id: 'b', label: '通过测试？', shape: 'decision' },
    { id: 'c', label: '发布', shape: 'end' },
  ],
  edges: [{ from: 'a', to: 'b', label: '提交' }, { from: 'b', to: 'c', label: '是' }],
})
const payload = {
  v: 1,
  title: graph.title,
  summary: describeGraph(graph),
  svg: renderSvg(graph),
  width: graph.width,
  height: graph.height,
  direction: graph.direction,
  nodes: Object.values(graph.nodes).map(node => ({ id: node.id, label: node.label, shape: node.shape })),
  edges: graph.edges.map(edge => ({ from: edge.from, to: edge.to, label: edge.label })),
  warnings: [],
}

const tabSeat = seats.find(seat => seat.name === 'sidebar.right.pane.tab')
const cardSeat = seats.find(seat => seat.name === 'tool.call.toolview')

console.log('tab body')
const tabTree = render(react.React.createElement(tabSeat.component, { navigation: { params: { payload } } }), react)
const tabText = textOf(tabTree)
const drawn = flatten(tabTree).filter(node => node.props.dangerouslySetInnerHTML !== undefined)
check('draws the diagram', typeof drawn[0]?.props.dangerouslySetInnerHTML.__html === 'string'
  && drawn[0].props.dangerouslySetInnerHTML.__html.startsWith('<svg'))
check('shows the title', tabText.includes('发布流程'), tabText)
check('shows the summary', tabText.includes('3 个节点'), tabText)
check('offers the Mermaid source', tabText.includes('查看 Mermaid 源码'), tabText)
check('explains a tab restored without its payload',
  textOf(render(react.React.createElement(tabSeat.component, {}), react)).includes('流程图尚未载入'))

console.log('conversation card')
let opened = null
services.sidebarRight = {
  openTab: (kind, options) => { opened = { kind, payload: options.params.payload } },
  openTabIn: () => {},
}
const cardTree = render(react.React.createElement(cardSeat.component, {
  callId: 'call-1',
  block: { kind: 'tool-result', callId: 'call-1', meta: payload },
}), react)
check('draws the diagram in the card', flatten(cardTree).some(node => node.props.dangerouslySetInnerHTML !== undefined))
check('shows the title in the card', textOf(cardTree).includes('发布流程'))
check('offers to open the tab', findAll(cardTree, 'button').some(node => textOf(node).includes('在侧栏打开')))
react.runEffects()
check('opens the tab on first sight', opened?.kind === 'flowchart' && opened?.payload.title === '发布流程', JSON.stringify(opened))
opened = null
react.runEffects()
check('does not reopen on a re-render', opened === null)
check('shows a pending card while the call runs',
  textOf(render(react.React.createElement(cardSeat.component, { callId: 'call-2', block: { kind: 'running-call' } }), react))
    .includes('正在生成'))

console.log('payload narrowing')
check('rejects a foreign metadata shape', face.readMeta({ v: 2, svg: 'x' }) === null)
check('rejects a non-object', face.readMeta('nope') === null)
check('accepts a v1 payload', face.readMeta(payload)?.title === '发布流程')
check('round-trips to Mermaid source', face.toFlowText(payload).startsWith('flowchart TB')
  && face.toFlowText(payload).includes('b -->|是| c'), face.toFlowText(payload))

console.log('')
if (failures > 0) {
  console.error(`${failures} of ${checks} checks failed`)
  process.exit(1)
}
console.log(`all ${checks} checks passed (bundle requested: ${[...new Set(requested)].join(', ')})`)
