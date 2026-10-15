// Smoke test for the host half: parse → layout → render, with no harness.
//
//   node test/smoke.mjs [--svg out.svg]
//
// Run it from the package root. It exercises the same entry points the plugin
// registers, so a typo in the parser or the geometry fails here instead of in a
// live session.

import { writeFileSync } from 'node:fs'
import { buildGraphFromArgs } from '../index.js'
import { parseFlow } from '../lib/parse.cjs'
import { renderSvg, describe as describeGraph } from '../lib/graph.cjs'
import { buildMeta, readMeta } from '../lib/meta.cjs'

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`)
}

console.log('parseFlow')
{
  const parsed = parseFlow([
    'flowchart TB',
    'title: 部署流程',
    'A([开始]) --> B[读取配置]',
    'B --> C{配置合法?}',
    'C -- 是 --> D[启动服务]',
    'C -- 否 --> E[报错退出]',
    'D --> F([结束])',
  ].join('\n'))
  check('six nodes', parsed.nodes.length === 6, `got ${parsed.nodes.length}`)
  check('five edges', parsed.edges.length === 5, `got ${parsed.edges.length}`)
  check('title line wins', parsed.title === '部署流程', String(parsed.title))
  check('start shape', parsed.nodes.find(n => n.id === 'A')?.shape === 'start')
  check('decision shape', parsed.nodes.find(n => n.id === 'C')?.shape === 'decision')
  check('trailing edge label', parsed.edges[2]?.label === '是', JSON.stringify(parsed.edges[2]))
  check('nothing unparsed', parsed.unparsed.length === 0, parsed.unparsed.join(' | '))
}

console.log('inline labels, pipes, dashed, chains')
{
  const parsed = parseFlow('X[甲] -->|走这条| Y[乙]\nY -.-> Z[丙]\nP --> Q --> R[终点]')
  check('pipe label', parsed.edges[0]?.label === '走这条', JSON.stringify(parsed.edges[0]))
  check('dashed flag', parsed.edges[1]?.dashed === true, JSON.stringify(parsed.edges[1]))
  check('chain makes two edges', parsed.edges.length === 4, `got ${parsed.edges.length}`)
  check('intermediate node created', parsed.nodes.some(n => n.id === 'Q'))
  check('later definition labels', parsed.nodes.find(n => n.id === 'R')?.label === '终点')
}

console.log('tolerates junk')
{
  const parsed = parseFlow('A[一] --> B[二]\n??? not a step ???\nC --> D')
  check('junk reported, not thrown', parsed.unparsed.length === 1, JSON.stringify(parsed.unparsed))
  check('still parsed the rest', parsed.edges.length === 2, `got ${parsed.edges.length}`)
}

console.log('buildGraphFromArgs + layout')
{
  const graph = buildGraphFromArgs({
    text: 'A([开始]) --> B{判断}\nB -- 是 --> C[处理]\nB -- 否 --> D[放弃]\nC --> E([结束])\nD --> E',
  })
  check('title falls back to first label', graph.title === '开始', graph.title)
  check('geometry present', Number.isFinite(graph.width) && graph.width > 0 && graph.height > 0)
  check('ranks assigned', Object.values(graph.nodes).every(n => Number.isInteger(n.rank)))
  check('decision rank below start', graph.nodes.B.rank > graph.nodes.A.rank)
  check('a plain DAG has no back edge', graph.edges.every(e => e.back !== true))
  const svg = renderSvg(graph)
  check('svg is self-contained', svg.startsWith('<svg') && svg.endsWith('</svg>'))
  check('every label drawn', svg.includes('判断') && svg.includes('处理') && svg.includes('放弃'))
  check('no raw angle brackets leak', !/<script/u.test(svg))
  const meta = buildMeta(graph, describeGraph(graph))
  check('meta round-trips', readMeta(meta) !== null)
  check('meta rejects a stranger', readMeta({ v: 99, title: 'x' }) === null)
  check('summary names the diagram', meta.summary.includes('开始'), meta.summary)
  if (process.argv.includes('--svg')) {
    const out = process.argv[process.argv.indexOf('--svg') + 1] ?? 'flowchart-smoke.svg'
    writeFileSync(out, svg)
    console.log(`  wrote ${out}`)
  }
}

console.log('cycle does not hang')
{
  const graph = buildGraphFromArgs({ text: 'A[一] --> B[二]\nB --> C[三]\nC --> A' })
  check('three nodes, three edges', Object.keys(graph.nodes).length === 3 && graph.edges.length === 3)
  check('cycle broken for layout', Number.isFinite(graph.height))
  check('the closing edge is routed as a back edge', graph.edges.at(-1)?.back === true, JSON.stringify(graph.edges.at(-1)))
  check('a back edge still renders', renderSvg(graph).includes('class="edge'))
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
