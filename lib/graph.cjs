// dsh-flowchart shared renderer.
//
// One module, two consumers: the host half (`index.js`) builds the payload that
// rides a tool result's presentation metadata, and the client half
// (`lib/client-entry.cjs`) draws it inside the right sidebar. Keeping the
// geometry here — instead of re-deriving it in the browser — is what makes the
// sidebar show exactly the diagram the tool validated, with no second layout
// pass and no font-dependent divergence.
//
// CommonJS on purpose: the host half imports it with `createRequire` so the
// package stays a plain ESM plugin for DSH, while the client half is a
// hand-rolled CommonJS bundle in which `require` means the browser module table.

'use strict'

const GLYPH_SIZE = 12.5
const CJK_SIZE = 12.5
const PAD_X = 14
const PAD_Y = 11
const MIN_W = 96
const MAX_W = 320
const ROW_GAP = 70
const COL_GAP = 44
const MARGIN = 26
const LINE_H = 18
const WRAP_W = MAX_W - PAD_X * 2
/** How far a back edge swings past the drawing, and the room kept for it. */
const BACK_LANE = 26
const BACK_LANE_RESERVE = BACK_LANE + 44

/** Nodes/edges wider than this are truncated, so one runaway spec cannot bloat a session. */
const MAX_NODES = 60
const MAX_EDGES = 160
const MAX_LABEL = 200

/**
 * A character's contribution to a text width. CJK, Hangul and full-width
 * punctuation occupy a full em; everything else is billed as a narrow glyph.
 * @param code - the UTF-16 code unit.
 * @returns the width in pixels at the default font size.
 */
function glyphWidth(code) {
  const fullWidth = (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
  return fullWidth ? CJK_SIZE : GLYPH_SIZE * 0.56
}

/**
 * Measure one line of text.
 * @param text - the line.
 * @returns its width in pixels.
 */
function textWidth(text) {
  let total = 0
  for (const char of text) total += glyphWidth(char.codePointAt(0) ?? 32)
  return total
}

/**
 * Break a label into lines that fit the box, honouring explicit newlines and
 * breaking CJK runs between characters when no space offers a break.
 * @param text - the raw label.
 * @returns the lines, at least one (possibly empty).
 */
function wrapLabel(text) {
  const lines = []
  for (const paragraph of String(text).split(/\r?\n/u)) {
    if (paragraph === '') { lines.push(''); continue }
    const tokens = paragraph.match(/[A-Za-z0-9_\-./:%$#@+*?()[\]{}<>=|&~^"'`\\]+|\s+|./gsu) ?? []
    let line = ''
    let lastBreak = -1
    for (const token of tokens) {
      if (/^\s+$/u.test(token)) {
        if (line === '') continue
        lastBreak = line.length
        line += ' '
        continue
      }
      const candidate = line + token
      if (line !== '' && textWidth(candidate) > WRAP_W) {
        if (lastBreak > 0 && textWidth(line.slice(0, lastBreak)) > WRAP_W * 0.4) {
          lines.push(line.slice(0, lastBreak).trimEnd())
          line = line.slice(lastBreak).trimStart() + token
        } else {
          lines.push(line.trimEnd())
          line = token
        }
        lastBreak = -1
        continue
      }
      line = candidate
    }
    lines.push(line.trimEnd())
  }
  return lines.length === 0 ? [''] : lines
}

/**
 * Clamp a value to a string of bounded length.
 * @param value - anything.
 * @param max - the character cap.
 * @returns the clamped string.
 */
function clampText(value, max = MAX_LABEL) {
  const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Normalize an author-supplied node id into the string the diagram keys on.
 * @param value - the raw id.
 * @param index - its position, used when the id is missing.
 * @returns the id.
 */
function normalizeId(value, index) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return `node${index + 1}`
}

/** Shapes that draw differently; anything unknown is treated as a process box. */
const SHAPES = new Set(['start', 'end', 'process', 'decision', 'io', 'data'])

/**
 * Validate and normalize an author-supplied graph into the payload the sidebar
 * renders. Never throws on shape problems the author can see and fix: the
 * returned `warnings` carry them to the model.
 * @param input - the tool's validated arguments.
 * @returns the normalized graph with its box geometry.
 */
function buildGraph(input) {
  const warnings = []
  const rawNodes = Array.isArray(input?.nodes) ? input.nodes : []
  const rawEdges = Array.isArray(input?.edges) ? input.edges : []
  if (rawNodes.length === 0) throw new Error('flowchart: at least one node is required')
  if (rawNodes.length > MAX_NODES) {
    warnings.push(`only the first ${MAX_NODES} of ${rawNodes.length} nodes are drawn`)
  }
  const nodeInputs = rawNodes.slice(0, MAX_NODES)
  const seen = new Map()
  const nodes = []
  for (const [index, raw] of nodeInputs.entries()) {
    const id = normalizeId(raw?.id, index)
    if (seen.has(id)) {
      warnings.push(`duplicate node id "${id}" ignored`)
      continue
    }
    const shape = SHAPES.has(raw?.shape) ? raw.shape : 'process'
    if (raw?.shape !== undefined && !SHAPES.has(raw.shape)) {
      warnings.push(`node "${id}" has unknown shape "${String(raw.shape)}"; drawn as process`)
    }
    const label = clampText(raw?.label)
    const lines = wrapLabel(label === '' ? id : label)
    const widest = Math.max(...lines.map(textWidth), textWidth(id) * 0.6)
    const box = {
      id,
      label: lines.join('\n'),
      shape,
      ...(typeof raw?.group === 'string' && raw.group !== '' ? { group: clampText(raw.group, 60) } : {}),
      width: Math.round(Math.min(MAX_W, Math.max(MIN_W, widest + PAD_X * 2))),
      height: Math.round(Math.max(38, lines.length * LINE_H + PAD_Y * 2)),
    }
    seen.set(id, box)
    nodes.push({ box, lines })
  }
  if (nodes.length === 0) throw new Error('flowchart: every node id was a duplicate')

  const known = new Set(nodes.map(entry => entry.box.id))
  const edges = []
  let dropped = 0
  for (const raw of rawEdges.slice(0, MAX_EDGES)) {
    const from = normalizeId(raw?.from, 0)
    const to = normalizeId(raw?.to, 0)
    if (!known.has(from) || !known.has(to)) { dropped += 1; continue }
    edges.push({
      from,
      to,
      label: clampText(raw?.label, 80),
      dashed: raw?.dashed === true,
      thick: raw?.thick === true,
    })
  }
  if (rawEdges.length > MAX_EDGES) warnings.push(`only the first ${MAX_EDGES} edges are drawn`)
  if (dropped > 0) warnings.push(`${dropped} edge(s) referenced an unknown node id and were dropped`)

  const graph = {
    title: clampText(input?.title, 160) || '流程图',
    direction: input?.direction === 'LR' ? 'LR' : 'TB',
    nodes: Object.fromEntries(nodes.map(entry => [entry.box.id, entry.box])),
    edges,
    warnings,
  }
  layout(graph)
  return graph
}

/**
 * Assign every node a rank and a position, in place.
 *
 * Ranks come from a depth-first pass over the edge list; a cycle terminates
 * when the walk revisits a node already on the current stack, and the closing
 * edge is drawn as a back edge afterwards. Good enough for the diagrams an
 * agent draws, and it cannot hang.
 * @param graph - the normalized graph, mutated with `rank`, `x` and `y`.
 */
function layout(graph) {
  const order = Object.keys(graph.nodes)
  const outgoing = new Map(order.map(id => [id, []]))
  const indegree = new Map(order.map(id => [id, 0]))
  for (const [index, edge] of graph.edges.entries()) {
    if (edge.from === edge.to) { edge.back = true; continue }
    outgoing.get(edge.from).push({ to: edge.to, index })
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }

  // Ranks come from a topological pass, so every cycle has to be broken first.
  // A depth-first walk names the closing edge of each cycle and takes it out of
  // the ranking graph; marking it here — rather than inferring afterwards from
  // the ranks — is what lets the router take that one edge around the outside
  // instead of straight back through its own rank.
  const rank = new Map(order.map(id => [id, 0]))
  const visiting = new Set()
  const visited = new Set()
  const walk = (id) => {
    visiting.add(id)
    for (const { to, index } of outgoing.get(id) ?? []) {
      if (visiting.has(to)) { graph.edges[index].back = true; continue }
      if (!visited.has(to)) walk(to)
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of order) if (!visited.has(id)) walk(id)
  for (const edge of graph.edges) if (edge.back !== true) edge.back = false

  const pending = new Map(indegree)
  const queue = order.filter(id => (pending.get(id) ?? 0) === 0)
  for (const edge of graph.edges) if (edge.back === true && edge.from !== edge.to) {
    pending.set(edge.to, Math.max(0, (pending.get(edge.to) ?? 0) - 1))
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor]
    for (const { to, index } of outgoing.get(id) ?? []) {
      if (graph.edges[index].back === true) continue
      rank.set(to, Math.max(rank.get(to) ?? 0, (rank.get(id) ?? 0) + 1))
      const left = (pending.get(to) ?? 0) - 1
      pending.set(to, left)
      if (left === 0) queue.push(to)
    }
  }

  const rows = new Map()
  for (const id of order) {
    const value = rank.get(id)
    if (!rows.has(value)) rows.set(value, [])
    rows.get(value).push(id)
  }

  const horizontal = graph.direction === 'LR'
  const rankCount = Math.max(...[...rows.keys()]) + 1
  const rankSize = new Array(rankCount).fill(0)
  for (const [value, ids] of rows) {
    const widest = Math.max(...ids.map(id => horizontal ? graph.nodes[id].height : graph.nodes[id].width))
    rankSize[value] = widest
  }
  const rankOffset = new Array(rankCount).fill(0)
  let cursor = 0
  for (let value = 0; value < rankCount; value += 1) {
    rankOffset[value] = cursor
    cursor += rankSize[value] + (horizontal ? COL_GAP : ROW_GAP)
  }

  let cross = 0
  for (const ids of rows.values()) {
    const sizes = ids.map(id => horizontal ? graph.nodes[id].width : graph.nodes[id].height)
    const total = sizes.reduce((sum, size) => sum + size, 0) + (ids.length - 1) * COL_GAP
    let offset = 0
    for (const [index, id] of ids.entries()) {
      const node = graph.nodes[id]
      node.rank = rank.get(id)
      if (horizontal) {
        node.x = MARGIN + rankOffset[node.rank]
        node.y = MARGIN + offset
        offset += sizes[index] + COL_GAP
      } else {
        node.x = MARGIN + offset
        node.y = MARGIN + rankOffset[node.rank]
        offset += sizes[index] + COL_GAP
      }
    }
    cross = Math.max(cross, total)
  }

  const geometry = Object.values(graph.nodes)
  const crossReach = geometry.reduce((reach, node) => Math.max(reach, horizontal ? node.y + node.height : node.x + node.width), 0)
  const depthReach = geometry.reduce((reach, node) => Math.max(reach, horizontal ? node.x + node.width : node.y + node.height), 0)
  // A back edge swings out past the drawing; widen the canvas so its lane and
  // its label stay inside the viewBox instead of being clipped.
  const detour = graph.edges.some(edge => edge.back === true) ? BACK_LANE_RESERVE : 0
  graph.width = Math.ceil((horizontal ? depthReach : crossReach) + MARGIN + detour)
  graph.height = Math.ceil((horizontal ? crossReach : depthReach) + MARGIN)
  graph.rankCount = rankCount
  graph.ranks = rows.size
}

/**
 * The stylesheet every rendered diagram carries.
 *
 * The colours are `--dsw-*`-flavoured custom properties with fallbacks, so the
 * same markup reads correctly inside the app (where the surface's tokens are in
 * scope) and as a standalone SVG opened from disk (where they are not).
 */
const SVG_STYLE = [
  '<style>',
  '.node{fill:var(--fc-node-fill,#1c2230);stroke:var(--fc-node-stroke,#4d5b7a);stroke-width:1.4}',
  '.node.decision{fill:var(--fc-decision-fill,#2a2233);stroke:var(--fc-decision-stroke,#8a6cb0)}',
  '.node.start,.node.end{fill:var(--fc-terminal-fill,#16302a);stroke:var(--fc-terminal-stroke,#4f9f86)}',
  '.node.io,.node.data{fill:var(--fc-io-fill,#20293a);stroke:var(--fc-io-stroke,#5a7fb8)}',
  '.edge{stroke:var(--fc-edge,#7c8bab);stroke-width:1.5}',
  '.edge.thick{stroke-width:2.5}',
  '.edge.dashed{stroke-dasharray:6 4}',
  '.edge.back{stroke-dasharray:4 3}',
  '.edge-label{fill:var(--fc-edge-label,#b9c2d6);font:11px ui-sans-serif,system-ui,"Segoe UI",sans-serif;text-anchor:middle}',
  '.edge-label-bg{fill:var(--fc-bg,#10141d);opacity:.92}',
  '.node-label{fill:var(--fc-node-label,#e6ebf5);font:12.5px ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei",sans-serif;text-anchor:middle}',
  '</style>',
].join('')

/**
 * Escape text for XML content.
 * @param text - raw text.
 * @returns the escaped text.
 */
function escapeXml(text) {
  return String(text)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

/** Where an edge leaves a node, in the graph's own direction. */
function ports(graph, edge) {
  const from = graph.nodes[edge.from]
  const to = graph.nodes[edge.to]
  if (graph.direction === 'LR') {
    return {
      x1: from.x + from.width, y1: from.y + from.height / 2,
      x2: to.x, y2: to.y + to.height / 2,
    }
  }
  return {
    x1: from.x + from.width / 2, y1: from.y + from.height,
    x2: to.x + to.width / 2, y2: to.y,
  }
}

/**
 * Draw the diagram as standalone SVG.
 * @param graph - a graph from {@link buildGraph}.
 * @returns the SVG source, safe to inject as markup.
 */
function renderSvg(graph) {
  const parts = []
  const horizontal = graph.direction === 'LR'

  for (const edge of graph.edges) {
    const from = graph.nodes[edge.from]
    const to = graph.nodes[edge.to]
    const lines = []
    let { x1, y1, x2, y2 } = ports(graph, edge)
    const backward = edge.back === true || (to.rank ?? 0) <= (from.rank ?? 0)
    let path
    if (horizontal) {
      const bend = Math.max(28, Math.abs(x2 - x1) * 0.45)
      path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
    } else {
      const bend = Math.max(28, Math.abs(y2 - y1) * 0.45)
      path = `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
    }
    if (backward) {
      // A back edge would otherwise be drawn straight through its own rank; a
      // detour past the right-hand edge of the drawing keeps it readable.
      const lane = Math.max(from.x + from.width, to.x + to.width) + BACK_LANE
      path = `M ${x1} ${y1} C ${lane} ${y1}, ${lane} ${y2}, ${x2} ${y2}`
    }
    lines.push(
      `<path class="edge${edge.dashed ? ' dashed' : ''}${edge.thick ? ' thick' : ''}${backward ? ' back' : ''}" d="${path}" ` +
      'marker-end="url(#fc-arrow)" fill="none"/>',
    )
    if (edge.label !== '') {
      const midX = (x1 + x2) / 2 + (backward ? 18 : 0)
      const midY = (y1 + y2) / 2
      const width = Math.round(textWidth(edge.label)) + 10
      lines.push(
        `<rect class="edge-label-bg" x="${(midX - width / 2).toFixed(1)}" y="${(midY - 9).toFixed(1)}" ` +
        `width="${width}" height="18" rx="4"/>`,
        `<text class="edge-label" x="${midX.toFixed(1)}" y="${(midY + 4).toFixed(1)}">${escapeXml(edge.label)}</text>`,
      )
    }
    // The group is what carries the tooltip: a bare <title> beside other
    // siblings can attach itself to the whole drawing instead.
    const tip = `${from.label.replace(/\n/gu, ' ')} → ${to.label.replace(/\n/gu, ' ')}`
    lines.push(`<title>${escapeXml(edge.label === '' ? tip : `${tip} (${edge.label})`)}</title>`)
    parts.push(`<g class="edge-group">${lines.join('')}</g>`)
  }

  for (const node of Object.values(graph.nodes)) {
    const { x, y, width, height } = node
    const cx = x + width / 2
    const cy = y + height / 2
    if (node.shape === 'decision') {
      parts.push(`<path class="node decision" d="M ${cx} ${y} L ${x + width} ${cy} L ${cx} ${y + height} L ${x} ${cy} Z"/>`)
    } else if (node.shape === 'start' || node.shape === 'end') {
      parts.push(`<rect class="node ${node.shape}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"/>`)
    } else if (node.shape === 'io' || node.shape === 'data') {
      const skew = Math.min(20, width * 0.16)
      parts.push(
        `<path class="node ${node.shape}" d="M ${x + skew} ${y} L ${x + width} ${y} ` +
        `L ${x + width - skew} ${y + height} L ${x} ${y + height} Z"/>`,
      )
    } else {
      parts.push(`<rect class="node process" x="${x}" y="${y}" width="${width}" height="${height}" rx="8"/>`)
    }
    const lines = String(node.label).split('\n')
    const first = cy - ((lines.length - 1) * LINE_H) / 2
    for (const [index, line] of lines.entries()) {
      if (line === '') continue
      parts.push(
        `<text class="node-label" x="${cx.toFixed(1)}" y="${(first + index * LINE_H + 4).toFixed(1)}">${escapeXml(line)}</text>`,
      )
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${graph.width} ${graph.height}" ` +
    `width="${graph.width}" height="${graph.height}" role="img" aria-label="${escapeXml(graph.title)}">`,
    SVG_STYLE,
    '<defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>',
    ...parts,
    '</svg>',
  ].join('\n')
}

/**
 * The one-line description the conversation card and the tool result share.
 * @param graph - a graph from {@link buildGraph}.
 * @returns a human sentence naming the diagram and its size.
 */
function describe(graph) {
  const nodes = Object.keys(graph.nodes).length
  const parts = [`「${graph.title}」`, `${nodes} 个节点`, `${graph.edges.length} 条连线`]
  return parts.join(' · ')
}

module.exports = { buildGraph, renderSvg, describe, layout, textWidth }
