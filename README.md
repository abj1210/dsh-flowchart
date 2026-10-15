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
pnpm install        # once — brings in esbuild, the only dev dependency
node build.mjs      # src/client.js -> lib/client.js (esbuild, wrapped for the page)
node test/all.mjs   # all three suites
```

`build.mjs` resolves esbuild from this package's own `node_modules`, or from
`ESBUILD_BINARY_PATH` when you would rather point it at an executable, and
refuses to emit a bundle that asks the module table for anything outside `react`,
`react/jsx-runtime` and the client service packages. That check exists because
the failure it prevents is a `require` miss in the browser, far from the build.

esbuild is **not** vendored into the repo — it is a normal dev dependency, so a
fresh clone has to run `pnpm install` before `node build.mjs` works. The shipped
`lib/client.js` is committed, so the plugin itself runs fine without ever
building.

### Tests

| suite | covers |
| --- | --- |
| `test/smoke.mjs` | the Mermaid subset parser, the layout, the SVG, the payload narrowing |
| `test/host.mjs` | the tool declaration — its schemas compiled by DSH's own DSL compiler — plus argument handling and the shipped manifest |
| `test/client.mjs` | `lib/client.js` loaded the way the page loads it: a fake `__ModuleLoader__`, a `require` that answers only the platform words, and React stubbed just enough to render |

`test/host.mjs` compiles the schemas through the built `@deepseek-ai/dsh-tools`
of a DSH checkout when it finds one — searched relative to `$HOME` rather than a
hard-coded path, and overridable with `DSH_TOOLS_LIB` or `DSH_CHECKOUT`; without
one it skips those checks instead of failing. It prints `skip` when that happens,
so a green run that skipped the schema checks is visible rather than implied.

## The Mermaid subset

`text` is read line by line; anything the parser cannot read is reported back in
the tool result's `warnings` rather than drawn, so a typo shows up as a warning
instead of a hole in the picture. At least one step has to be readable — a `text`
holding only headers (`flowchart LR`, `title: …`) is refused with
`no nodes were recognised`, because there is nothing to draw.

| syntax | result |
| --- | --- |
| `A --> B` | plain edge |
| `A -.-> B` | dashed edge |
| `A ==> B` | thick edge |
| `A ----> B` | plain edge (extra dashes ignored) |
| `A -->\|是\| B`, `A -- 是 --> B` | labelled edge — **ASCII pipes only**. With a full-width pipe (`-->｜是｜`) the edge is not drawn and the line is warned about; only a stray node survives. |
| `A[标签]` | process box |
| `A{判断}` | decision diamond |
| `A([开始])`, `A([结束])` | rounded terminal |
| `A[/输入/]` | parallelogram (io) |
| `A[(数据)]` | skewed box (data) |
| `A(标签)` | process box |
| `flowchart LR` / `flowchart TB` / `graph TD` | sets the direction (the `direction` parameter overrides it) |
| `title: 我的图` | sets the title (ASCII or `：`); without it the title falls back to the first node's label |
| `%% comment` | ignored |
| `subgraph … end`, `classDef`, `class`, `linkStyle`, `style`, `click` | the keyword line is ignored; `subgraph`/`end` wrappers are dropped and the steps inside still parse |
| node ids | letters, digits (not leading), `_ - .` and CJK; the id character set is what constrains a label, so a label is written bare |
| `A["my label"]` | the quotes are **kept** — they are drawn as part of the label, not stripped, so a quoted label reads `"my label"` in the picture |
| `A[第一行<br/>第二行]` | **not** a line break — `<br/>` is escaped and drawn literally as those six characters. Nothing writes a newline into a label; a label wider than `WRAP_W` is wrapped onto extra lines automatically, and that is the only way a node gets more than one line. |

The following are **not** supported. A line the parser cannot read in full is
collected rather than guessed at, so it comes back as a warning (and the tool
fails outright when *nothing* was recognised). That is the loud path: `A --- B`
(open link), `A --x B` and `A --o B` (cross and circle arrowheads), `A === B`
(thick open link — note `==>` *is* supported), `A -> B` (single dash),
`A[开始]:::big` (class attachment), numeric-leading ids (`1[a]`), emoji ids,
full-width pipes, and Unicode arrows such as `→`.

Two constructs degrade **silently** instead, and are worth knowing about. The
reader is line-oriented, so a `subgraph` header is discarded without a warning,
and putting a whole flow on one line (`graph TD; A --> B; B --> C`) loses
everything — the leading keyword makes the reader skip the line. Write one step
per line. A trailing `;` is fine and is stripped; a `;` in the middle leaves the
line unreadable, which is at least reported.

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
