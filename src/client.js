// dsh-flowchart — the browser half's source.
//
// Registers two things with the web app:
//
//   * a `flowchart` tool view, so a call in the conversation shows the diagram
//     as a card with a button that opens it in the right sidebar; and
//   * a `flowchart` tab type in the right sidebar, where the diagram is drawn
//     large and re-drawn whenever the agent produces a new one.
//
// DSH serves a client bundle into a frozen module table and hands it a `require`
// that answers for the platform modules only — `react`, `react/jsx-runtime` and
// the client service packages. This source imports React, which the build keeps
// external; it imports nothing else, and `build.mjs` fails the build if that
// ever stops being true. The built file is `lib/client.js`.

import * as React from 'react'

const CLIENT_ID = 'dsh-flowchart'
const TAB_KIND = 'flowchart'

/**
 * The sidebar entry points, filled in when the sidebar's services are present.
 *
 * The card is registered unconditionally — a conversation without a sidebar
 * still deserves a drawing — while the panel is registered only if there is one
 * to register with. Keeping the two apart is what lets this plugin load on a
 * surface that has no right sidebar at all.
 */
const action = { openTab: null, openTabIn: null }

// One place for the drawing's look, injected once. The colours are the same
// custom properties the SVG carries, so a diagram reads correctly on the app's
// surface and as a file opened from disk.
const CSS = [
  '.fc-card{border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.09));border-radius:10px;padding:10px 12px;margin:4px 0;background:var(--dsw-alias-bg-raised,rgba(255,255,255,.02))}',
  '.fc-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.fc-card-glyph{flex:none;display:inline-flex;opacity:.85}',
  '.fc-card-title{font-weight:600;font-size:13px}',
  '.fc-card-meta{font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}',
  '.fc-card-open{margin-left:auto}',
  '.fc-card-thumb{margin-top:8px;overflow:hidden;border-radius:8px;background:var(--fc-bg,#10141d)}',
  '.fc-card-thumb svg{display:block;width:100%;height:auto;max-height:180px}',
  '.fc-link{font:inherit;font-size:12px;color:var(--dsw-alias-text-link,#6ea8fe);background:none;border:0;padding:2px 4px;border-radius:6px;cursor:pointer}',
  '.fc-link:hover{background:var(--dsw-alias-bg-hover,rgba(255,255,255,.06))}',
  '.fc-warn{margin-top:6px;font-size:12px;color:var(--dsw-alias-text-warning,#d9a441)}',
  '.fc-tab{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--fc-bg,#10141d)}',
  '.fc-tab-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.08))}',
  '.fc-tab-title{font-weight:600;font-size:13px}',
  '.fc-tab-meta{font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}',
  '.fc-tab-spacer{flex:1}',
  '.fc-tab-scroll{flex:1;min-height:0;overflow:auto;padding:16px}',
  '.fc-tab-scroll svg{display:block;margin:0 auto;max-width:100%;height:auto}',
  '.fc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;padding:24px;text-align:center;color:var(--dsw-alias-text-tertiary,#98a2b3);font-size:13px}',
  '.fc-empty strong{color:var(--dsw-alias-text-secondary,#c7ced9);font-weight:600}',
  '.fc-source{margin-top:16px}',
  '.fc-source summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}',
  '.fc-source pre{margin:8px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-sunken,rgba(0,0,0,.25));font:11.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;color:var(--dsw-alias-text-secondary,#c7ced9)}',
].join('\n')

/**
 * Read a payload a session record carried.
 *
 * Mirrors `lib/meta.cjs`'s `readMeta`: the two halves narrow the same value, so
 * the checks have to agree on what a payload is. A field that one accepts and
 * the other rejects is a tab that renders in one place and throws in another.
 * @param value - `ToolResultNode.meta`, of unknown shape.
 * @returns the payload, or null when it is not one.
 */
function readMeta(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.v !== 1) return null
  if (typeof value.svg !== 'string' || typeof value.title !== 'string') return null
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null
  return value
}

/**
 * The flow text that reproduces a payload, for the panel's source disclosure.
 * @param payload - a payload from {@link readMeta}.
 * @returns Mermaid source equivalent to the drawing.
 */
function toFlowText(payload) {
  const lines = [`flowchart ${payload.direction ?? 'TB'}`, `title: ${payload.title}`]
  for (const node of payload.nodes) {
    const label = String(node.label).replace(/\n/gu, ' ')
    if (node.shape === 'start' || node.shape === 'end') lines.push(`${node.id}([${label}])`)
    else if (node.shape === 'decision') lines.push(`${node.id}{${label}}`)
    else if (node.shape === 'io') lines.push(`${node.id}[/${label}/]`)
    else if (node.shape === 'data') lines.push(`${node.id}[(${label})]`)
    else lines.push(`${node.id}[${label}]`)
  }
  for (const edge of payload.edges) {
    const arrow = edge.dashed === true ? '-.->' : edge.thick === true ? '==>' : '-->'
    const label = edge.label === undefined || edge.label === '' ? '' : `|${edge.label}|`
    lines.push(`${edge.from} ${arrow}${label} ${edge.to}`)
  }
  return lines.join('\n')
}

/** A tiny flowchart mark for the card and the guide capsule. */
function glyph() {
  return React.createElement(
    'svg',
    { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 },
    React.createElement('rect', { x: 6.5, y: 1.5, width: 7, height: 4, rx: 1 }),
    React.createElement('rect', { x: 1.5, y: 13.5, width: 7, height: 4.5, rx: 1 }),
    React.createElement('rect', { x: 11.5, y: 13.5, width: 7, height: 4.5, rx: 1 }),
    React.createElement('path', { d: 'M10 5.5v3.2M10 8.7H5v4.8M10 8.7h5v4.8' }),
  )
}

/**
 * The note a tab shows when it was restored without the diagram it was opened
 * with — a page reload rebuilds the sidebar from the persisted layout, which
 * keeps the tab but not its parameters.
 * @returns the element.
 */
function emptyNote() {
  return React.createElement(
    'div',
    { className: 'fc-empty' },
    React.createElement('strong', null, '流程图尚未载入'),
    React.createElement(
      'span',
      null,
      '页面刷新后侧栏取不回这张图。回到对话里，点那条 flowchart 调用上的「在侧栏打开」即可重新载入。',
    ),
  )
}

/**
 * The `flowchart` tab's body.
 * @param props - the slot owner props; the tab's live navigation rides on them.
 * @returns the diagram, or a note explaining what to do instead.
 */
function TabBody(props) {
  const info = props?.hooks?.tabInfo?.() ?? props?.tab ?? props
  const navigation = info?.navigation ?? props?.navigation
  const payload = readMeta(navigation?.params?.payload)
  const [showSource, setShowSource] = React.useState(false)

  if (payload === null) return emptyNote()

  const source = toFlowText(payload)
  return React.createElement(
    'div',
    { className: 'fc-tab' },
    React.createElement(
      'div',
      { className: 'fc-tab-bar' },
      React.createElement('span', { className: 'fc-tab-title' }, payload.title),
      React.createElement('span', { className: 'fc-tab-meta' }, payload.summary),
      React.createElement('span', { className: 'fc-tab-spacer' }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'fc-link',
          onClick: () => { setShowSource(value => !value) },
        },
        showSource ? '隐藏源码' : '查看 Mermaid 源码',
      ),
    ),
    React.createElement(
      'div',
      { className: 'fc-tab-scroll' },
      React.createElement('div', { dangerouslySetInnerHTML: { __html: payload.svg } }),
      showSource
        ? React.createElement(
          'details',
          { className: 'fc-source', open: true },
          React.createElement('summary', null, 'Mermaid 源码'),
          React.createElement('pre', null, source),
        )
        : null,
      ...(payload.warnings ?? []).map(warning => React.createElement('div', { className: 'fc-warn' }, warning)),
    ),
  )
}

/**
 * The conversation-side card for one `flowchart` call.
 *
 * It opens the sidebar tab itself the first time it sees a diagram, so a call
 * the model makes lands where the user is already looking. The button stays for
 * after a reload, when that automatic open has already had its turn.
 * @param props - the tool view owner props, including the result's metadata.
 * @returns the card, or a one-line fallback while the call is still running.
 */
function CallCard(props) {
  const payload = readMeta(props?.block?.meta)
  const callId = props?.callId ?? props?.block?.callId ?? payload?.title
  const opened = React.useRef(null)

  React.useEffect(() => {
    if (payload === null || action.openTab === null) return
    // One automatic open per call: a re-render must not fight the user for the
    // pane, and the newest diagram is the one worth showing.
    if (opened.current === callId) return
    opened.current = callId
    action.openTab(payload)
  }, [payload, callId])

  if (payload === null) {
    return React.createElement(
      'div',
      { className: 'fc-card' },
      React.createElement(
        'div',
        { className: 'fc-card-head' },
        React.createElement('span', { className: 'fc-card-title' }, '流程图'),
        React.createElement('span', { className: 'fc-card-meta' }, '正在生成…'),
      ),
    )
  }

  return React.createElement(
    'div',
    { className: 'fc-card' },
    React.createElement(
      'div',
      { className: 'fc-card-head' },
      React.createElement('span', { className: 'fc-card-glyph', 'aria-hidden': 'true' }, glyph()),
      React.createElement('span', { className: 'fc-card-title' }, payload.title),
      React.createElement('span', { className: 'fc-card-meta' }, payload.summary),
      action.openTab === null
        ? null
        : React.createElement(
          'button',
          { type: 'button', className: 'fc-card-open fc-link', onClick: () => { action.openTab(payload) } },
          '在侧栏打开',
        ),
    ),
    React.createElement('div', { className: 'fc-card-thumb', dangerouslySetInnerHTML: { __html: payload.svg } }),
    ...(payload.warnings ?? []).map(warning => React.createElement('div', { className: 'fc-warn' }, warning)),
  )
}

/** Inject the drawing's stylesheet once, however many cards and tabs render. */
function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-dsh-flowchart]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-dsh-flowchart', '')
  style.textContent = CSS
  document.head.append(style)
}

/** The plugin face the DSH Loader activates. */
export const name = CLIENT_ID
export const inject = ['slots']

/**
 * Claim this plugin's two seats: the sidebar tab type and the conversation card.
 * @param ctx - the client plugin context.
 */
export function apply(ctx) {
  installStyles()
  // The sidebar is optional: wire the opener if it is there, then register the
  // card either way. `ctx.inject` waits for the service, so a surface without a
  // right sidebar simply never calls back.
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
    const openInto = (payload, sessionId) => {
      if (sessionId === undefined || typeof scope.sidebarRight.openTabIn !== 'function') {
        scope.sidebarRight.openTab(TAB_KIND, { params: { payload } })
        return
      }
      scope.sidebarRight.openTabIn(sessionId, TAB_KIND, { params: { payload } })
    }
    action.openTab = (payload) => { openInto(payload, undefined) }
    action.openTabIn = openInto

    // Page types come from the sidebar's own registry, so a `flowchart` tab is
    // a first-class kind: it can be dragged, split, floated and reopened.
    scope.sidebarRightTabs.register({
      id: TAB_KIND,
      kind: TAB_KIND,
      title: () => '流程图',
      guide: [{
        id: `${TAB_KIND}-guide`,
        order: 42,
        title: () => '流程图',
        description: () => '查看 agent 最近绘制的流程图',
        icon: () => glyph(),
      }],
    })
  })

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_KIND, locale: CLIENT_ID },
    TabBody,
  ))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'flowchart', locale: CLIENT_ID },
    CallCard,
  ))
}

export { readMeta, toFlowText, TabBody, CallCard }
export default { name, inject, apply, TabBody, CallCard, readMeta, toFlowText }
