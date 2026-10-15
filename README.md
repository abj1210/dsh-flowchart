# dsh-flowchart

A DSH plugin that gives the agent a `flowchart` tool. The drawing it produces
appears twice: as a card in the conversation, and in the right sidebar's
`流程图` tab.

```
agent calls flowchart(text: 'A[取代码] --> B{编译通过?}')
  ├─ conversation: a card with the diagram and an「在侧栏打开」button
  └─ right sidebar: the same diagram, drawn large
```

## How it fits together

```
index.js                host half — declares the `flowchart` tool
  lib/parse.cjs         Mermaid subset  -> nodes/edges
  lib/graph.cjs         nodes/edges     -> ranks, box geometry, inline SVG
  lib/meta.cjs          graph           -> the payload that rides the tool result
  ↓  presentationMeta  (persisted on the session's `tool/result` event)
  ↓  ToolResultNode.meta  (read straight off the conversation record)
lib/client.js           browser half — the card and the sidebar tab
src/client.js           its source; `node build.mjs` wraps it for the page
```

The two halves share `lib/graph.cjs`, so the card and the tab are the same
drawing rather than two renderers that can disagree.

There is no host→browser channel in the middle. DSH persists a tool result's
presentation metadata verbatim and hands it to client renderers, so the diagram
reaches the browser as part of the conversation it belongs to: it survives a
page reload, needs no RPC, and writes nothing to disk.

## Install

The plugin is a DSH *bundle*: it contributes a patch layer that inserts one
Loader row, and the same row is scanned into the client module graph.

```sh
# from the profile directory ($DSH_HOME/profiles/<name>)
dsh plugin add /path/to/dsh-flowchart
```

The `desktop` profile is managed by the Electron app and refuses `dsh plugin`,
so there the two edits are made in `profiles/desktop/package.json`:

```jsonc
{
  "dependencies": { "dsh-flowchart": "file:../../../../dsh/dsh-flowchart" },
  "dsh": { "profile": { "bundles": [ /* …, "dsh-flowchart" */ ] } }
}
```

The host half needs a restart; the browser half is picked up by the client HMR
watcher, which stat-polls every graph row's bundle.

## Develop

```sh
node build.mjs      # src/client.js -> lib/client.js (esbuild, wrapped for the page)
node test/all.mjs   # all three suites
```

`build.mjs` resolves esbuild from this package's own `node_modules` — a copy is
vendored there so the build needs no network — and refuses to emit a bundle that
asks the module table for anything outside `react`, `react/jsx-runtime` and the
client service packages. That check exists because the failure it prevents is a
`require` miss in the browser, far from the build.

### Tests

| suite | covers |
| --- | --- |
| `test/smoke.mjs` | the Mermaid subset parser, the layout, the SVG, the payload narrowing |
| `test/host.mjs` | the tool declaration — its schemas compiled by DSH's own DSL compiler — plus argument handling and the shipped manifest |
| `test/client.mjs` | `lib/client.js` loaded the way the page loads it: a fake `__ModuleLoader__`, a `require` that answers only the platform words, and React stubbed just enough to render |

`test/host.mjs` compiles the schemas through the built `@deepseek-ai/dsh-tools`
of a DSH checkout when it finds one (set `DSH_TOOLS_LIB` to point at it
elsewhere); without one it skips those checks instead of failing.

## Two contracts worth knowing

**Requiredness.** Parameter requiredness is a per-property `required: true`
annotation, and so is a field's requiredness inside `output.schema`. A root
`required: [...]` array is a *parameter-root* JSON Schema idiom and is rejected
in a value schema with `schema.required is not supported by the value schema
DSL` — which surfaces as the model provider refusing the whole tool with
`Invalid schema for function 'flowchart'`.

**The sidebar is optional.** The tab type is registered through
`ctx.sidebarRightTabs` and the card through `ctx.slots`, and the card exists even
where no right sidebar does — the opener is wired through `ctx.inject`, which
simply never calls back on such a surface.

## Licence

MIT.
