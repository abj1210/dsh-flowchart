// dsh-flowchart — the payload that rides a tool result to the browser.
//
// DSH persists a tool result's presentation metadata verbatim on the session's
// `tool/result` event and hands it to client renderers as `ToolResultNode.meta`,
// so this object is the whole host→browser channel: no RPC, no side file, and
// the diagram survives a page reload because the conversation does.

'use strict'

const { renderSvg } = require('./graph.cjs')

/** Bumped when the payload's shape changes, so an old session renders read-only. */
const META_VERSION = 1

/**
 * Project a laid-out graph into the client payload.
 * @param graph - a graph from `lib/graph.cjs`.
 * @param summary - the one-line description returned with the tool result.
 * @returns the payload placed in `presentationMeta`.
 */
function buildMeta(graph, summary) {
  return {
    v: META_VERSION,
    title: graph.title,
    summary: typeof summary === 'string' && summary !== '' ? summary : graph.title,
    svg: renderSvg(graph),
    width: graph.width,
    height: graph.height,
    direction: graph.direction,
    nodes: Object.values(graph.nodes).map(node => ({
      id: node.id,
      label: node.label,
      shape: node.shape,
      rank: node.rank ?? 0,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
    edges: graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label === undefined || edge.label === '' ? {} : { label: edge.label }),
      ...(edge.dashed === true ? { dashed: true } : {}),
      ...(edge.back === true ? { back: true } : {}),
    })),
    warnings: [...graph.warnings],
  }
}

/**
 * Narrow a value that arrived from a session record.
 *
 * The metadata was written by this plugin, but a session may have been produced
 * by an older version — or by something else that guessed the shape — so the
 * client checks rather than trusts.
 * @param value - `ToolResultNode.meta`, of unknown shape.
 * @returns the payload, or null when it is not one.
 */
function readMeta(value) {
  if (value === null || typeof value !== 'object') return null
  if (value.v !== META_VERSION) return null
  if (typeof value.svg !== 'string' || typeof value.title !== 'string') return null
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null
  return value
}

module.exports = { buildMeta, readMeta, META_VERSION }
