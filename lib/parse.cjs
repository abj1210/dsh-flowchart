// dsh-flowchart — Mermaid-shaped flow text → graph.
//
// The accepted subset is deliberately small and forgiving: one or more steps per
// line, arrows between them, optional shapes and optional edge labels. Anything
// the parser cannot read it reports in `unparsed` instead of throwing, so a
// single mistyped line costs the author a warning rather than the whole diagram.

'use strict'

/** Delimiters, longest first so `([` is never mistaken for a plain `(`. */
const SHAPE_FORMS = [
  { open: '([', close: '])', shape: 'start', circle: true },
  { open: '[/', close: '/]', shape: 'io' },
  { open: '[(', close: ')]', shape: 'data' },
  { open: '[', close: ']', shape: 'process' },
  { open: '{', close: '}', shape: 'decision' },
  { open: '(', close: ')', shape: 'process' },
]

const ID = '[A-Za-z_\\u4e00-\\u9fff][\\w\\-.\\u4e00-\\u9fff]*'

/** One arrow, with whatever the author wrote on it: `-->`, `-->|是|`, `-- 是 -->`. */
const CONNECTOR = /(-{1,2}\.->|-{1,2}->|={1,3}>)(?:\s*\|([^|\n]*)\|)?/u
/** The label spelling where the arrow comes last: `--|是|-->`. */
const PIPE_THEN_ARROW = /\|([^|\n]*)\|\s*(-{0,2}-->)/u

/**
 * Split a line into its arrow-separated steps.
 * @param line - one source line after {@link normalizeLabels}.
 * @returns the steps and connectors in source order, connector `n` joining step
 * `n` to step `n + 1`.
 */
function splitArrow(line) {
  const parts = line.split(/(\s*(?:-{1,2}\.->|-{1,2}->|={1,3}>)(?:\s*\|[^|\n]*\|)?\s*)/u)
    .filter(part => part !== '')
  return {
    steps: parts.filter((_part, index) => index % 2 === 0),
    connectors: parts.filter((_part, index) => index % 2 === 1),
  }
}

/**
 * Read a connector's spelling.
 * @param connector - the raw connector text.
 * @returns its style and label.
 */
function parseConnector(connector) {
  const text = String(connector ?? '').trim()
  const match = CONNECTOR.exec(text)
  const arrow = match?.[1] ?? text
  const label = match?.[2] ?? (PIPE_THEN_ARROW.exec(text)?.[1] ?? '').trim()
  return {
    dashed: arrow.startsWith('-.'),
    thick: arrow.startsWith('='),
    ...(label === '' ? {} : { label }),
  }
}

/** `-- label -->`: a label written between the dashes of its own arrow. */
const LABELED_DASH = /-{1,2}\s*([^>|\n]+?)\s*-{0,2}-->/gu

/**
 * Move an arrow's label onto the arrow itself.
 *
 * `-- 是 -->`, `--|是|-->` and `-->|是|` are all the same edge in Mermaid; they
 * differ only in which side of the pipes the arrow sits. Normalizing every
 * spelling to `-->|是|` means the step parser never has to guess which side of
 * an arrow a label belonged to.
 * @param line - one source line.
 * @returns the same line with every edge label written as `-->|label|`.
 */
function normalizeLabels(line) {
  return line
    .replace(LABELED_DASH, (_match, label) => `-->|${String(label).trim()}|`)
    .replace(PIPE_THEN_ARROW, (_match, label) => `-->|${String(label).trim()}|`)
}

/**
 * Read the shape and label out of one step.
 *
 * A step is `ID` alone (a reference), or `ID` followed by a bracketed label.
 * @param step - the raw step text.
 * @returns the node reference, or `{ error }` when the step is unreadable.
 */
function parseStep(step) {
  const text = step.trim().replace(/;+$/u, '')
  if (text === '') return null
  const idMatch = new RegExp(`^(${ID})`, 'u').exec(text)
  if (idMatch === null) return { error: text }
  const id = idMatch[1]
  const rest = text.slice(id.length).trim()
  if (rest === '') return { id, shape: 'process' }
  for (const form of SHAPE_FORMS) {
    if (!rest.startsWith(form.open)) continue
    const close = rest.indexOf(form.close, form.open.length)
    if (close === -1) return { error: text }
    const label = rest.slice(form.open.length, close).trim()
    const after = rest.slice(close + form.close.length).trim()
    if (after !== '') return { error: text }
    return { id, label, shape: form.shape }
  }
  return { error: text }
}

/**
 * Parse a flow body.
 * @param text - the model's `text` argument.
 * @returns `{ nodes, edges, title, direction, unparsed }`, where `nodes` keeps
 * the first definition seen for each id and `edges` preserves source order.
 */
function parseFlow(text) {
  const nodes = []
  const byId = new Map()
  const edges = []
  const unparsed = []
  let title
  let direction

  const remember = (step) => {
    const existing = byId.get(step.id)
    if (existing === undefined) {
      const node = { id: step.id, label: step.label ?? step.id, shape: step.shape ?? 'process' }
      byId.set(step.id, node)
      nodes.push(node)
      return node
    }
    // A later, richer definition (one that carries a label) wins over a bare
    // reference, so `A --> B[读文件]` labels B even though A came first.
    if (step.label !== undefined) existing.label = step.label
    if (step.shape !== undefined && step.label !== undefined) existing.shape = step.shape
    return existing
  }

  for (const raw of String(text).split(/\r?\n/u)) {
    const source = raw.replace(/%%[^\n]*$/u, '').trim()
    if (source === '') continue
    const header = /^(?:flowchart|graph)\s+([A-Za-z]{2})$/u.exec(source)
    if (header !== null) {
      direction = /^LR$/iu.test(header[1]) ? 'LR' : 'TB'
      continue
    }
    if (/^title\s*[:：]\s*/iu.test(source)) {
      title = source.replace(/^title\s*[:：]\s*/iu, '').trim() || undefined
      continue
    }
    if (/^(?:flowchart|graph|subgraph|end|classDef|class|linkStyle|click|style)\b/u.test(source)) continue

    const line = normalizeLabels(source)

    // A line that only declares nodes (no arrow left once the definitions and
    // any pipe label are removed) is not an edge line: `C([C: 开始])` carries a
    // colon and `[/输入/]` a slash, and neither is a graph.
    const bare = line
      .replace(new RegExp(`${ID}\\s*(?:\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\})`, 'gu'), ' ')
      .replace(/\|[^|\n]*\|/gu, ' ')
    if (!/(?:-{1,2}\.->|-{1,2}->|={1,3}>)/u.test(bare)) {
      const solo = parseStep(line)
      if (solo === null) continue
      if (solo.error !== undefined) unparsed.push(source)
      else remember(solo)
      continue
    }

    const { steps, connectors } = splitArrow(line)
    let previous
    for (const [index, raw] of steps.entries()) {
      const step = parseStep(raw)
      if (step === null) continue
      if (step.error !== undefined) { unparsed.push(source); previous = undefined; break }
      const edge = parseConnector(connectors[index - 1] ?? '')
      const node = remember(step)
      if (previous !== undefined) {
        edges.push({
          from: previous.id,
          to: node.id,
          ...(edge.label === undefined || edge.label === '' ? {} : { label: edge.label }),
          ...(edge.dashed ? { dashed: true } : {}),
          ...(edge.thick ? { thick: true } : {}),
        })
      }
      previous = node
    }
  }

  if (title === undefined) {
    const first = nodes.find(node => node.label !== node.id)
    title = first === undefined ? (nodes[0]?.label ?? '流程图') : first.label
  }
  return { nodes, edges, title, direction, unparsed }
}

module.exports = { parseFlow, splitArrow, parseStep }
