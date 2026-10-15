// dsh-flowchart — host half.
//
// Registers one model-facing tool, `flowchart`, which turns a Mermaid-shaped
// description of a diagram into a validated graph. The graph reaches the
// browser through the tool result's presentation metadata (see
// `presentationMeta` below), which the client half reads straight off the
// conversation record: no RPC channel, no file on disk, nothing to keep in
// sync between two processes.
//
// The renderer is shared (`lib/graph.cjs`), so the card in the conversation and
// the tab in the right sidebar are the same drawing.

import { buildGraph, renderSvg, describe as describeGraph } from './lib/graph.cjs'
import { parseFlow } from './lib/parse.cjs'
import { buildMeta } from './lib/meta.cjs'

export const name = 'flowchart'
export const inject = ['tools']

/** Shape names the renderer understands; the parser maps Mermaid syntax onto them. */
export const shapes = ['process', 'decision', 'start', 'end', 'io', 'data']

/**
 * Parse and validate the tool's arguments into a graph with its geometry.
 * Exported so the smoke test can exercise it without a live harness.
 * @param args - the tool arguments.
 * @returns the laid-out graph.
 */
export function buildGraphFromArgs(args) {
  const text = typeof args?.text === 'string' ? args.text : ''
  if (text.trim() === '') throw new Error('flowchart: `text` must describe at least one node')
  const parsed = parseFlow(text)
  if (parsed.nodes.length === 0) {
    throw new Error('flowchart: no nodes were recognised in `text`; write one step per line, e.g. "A[开始] --> B{判断}"')
  }
  return buildGraph({
    title: args.title ?? parsed.title,
    direction: args.direction ?? parsed.direction,
    nodes: parsed.nodes,
    edges: parsed.edges,
  })
}

/**
 * The tool declaration, as one object.
 *
 * Kept separate from {@link apply} so a test can compile its schemas exactly the
 * way the tool registry does, without a live harness.
 * @returns the `flowchart` tool definition.
 */
export function toolDefinition() {
  return {
    name: 'flowchart',
    description: [
      'Draw a flowchart and show it in a panel beside the conversation.',
      'Describe it in Mermaid flowchart syntax, one or more steps per line:',
      '`A[读取文件] --> B{格式正确?}`, `B -- 是 --> C[解析]`, `B -- 否 --> D[报错]`,',
      '`C --> E([完成])`. Node ids are short tokens; the text inside the brackets is',
      'the label. Shapes: `[..]` process, `{..}` decision, `([..])` start/end,',
      '`[/../]` input/output, `[(..)]` data. `-->` is a solid arrow, `-.->` a dashed one,',
      'and `-- label -->` or `-->|label|` writes on it. Use it whenever a process, a',
      'decision tree, a call chain or an architecture is easier to see than to read;',
      'the panel opens by itself and follows the newest diagram you draw.',
    ].join(' '),
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'Mermaid flowchart body: node definitions and arrows, one step per line.',
      },
      title: {
        type: 'string',
        description: 'Panel and card title. Defaults to a `title: ...` line in `text`, else the first node label.',
      },
      direction: {
        type: 'string',
        enum: ['TB', 'LR'],
        description: 'Layout direction: TB top-to-bottom (default) or LR left-to-right.',
      },
    },
    output: {
      // Requiredness in this DSL is a per-property annotation, not a root
      // `required: [...]` array: a root array is rejected by the value-schema
      // compiler with `schema.required is not supported by the value schema DSL`.
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          warnings: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `已在侧边栏绘制流程图：${value.summary}`,
          ...value.warnings.map(warning => `注意：${warning}`),
          '图已经显示给用户了，不必再把同样的图用文字复述一遍。',
        ].join('\n'),
      }],
      presentationMeta: (args, value) => buildMeta(buildGraphFromArgs(args), value.summary),
    },
    execute(args) {
      const graph = buildGraphFromArgs(args)
      return {
        title: graph.title,
        summary: describeGraph(graph),
        warnings: [...graph.warnings],
      }
    },
  }
}

/**
 * Mount the tool.
 * @param ctx - the plugin context; only the tool registry is consumed.
 */
export function apply(ctx) {
  ctx.tools.register(toolDefinition())
}
