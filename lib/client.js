window.__ModuleLoader__.load({ id: "dsh-flowchart", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  CallCard: () => CallCard,
  TabBody: () => TabBody,
  apply: () => apply,
  default: () => client_default,
  inject: () => inject,
  name: () => name,
  readMeta: () => readMeta,
  toFlowText: () => toFlowText
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);
var CLIENT_ID = "dsh-flowchart";
var TAB_KIND = "flowchart";
var action = { openTab: null, openTabIn: null };
var CSS = [
  ".fc-card{border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.09));border-radius:10px;padding:10px 12px;margin:4px 0;background:var(--dsw-alias-bg-raised,rgba(255,255,255,.02))}",
  ".fc-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".fc-card-glyph{flex:none;display:inline-flex;opacity:.85}",
  ".fc-card-title{font-weight:600;font-size:13px}",
  ".fc-card-meta{font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}",
  ".fc-card-open{margin-left:auto}",
  ".fc-card-thumb{margin-top:8px;overflow:hidden;border-radius:8px;background:var(--fc-bg,#10141d)}",
  ".fc-card-thumb svg{display:block;width:100%;height:auto;max-height:180px}",
  ".fc-link{font:inherit;font-size:12px;color:var(--dsw-alias-text-link,#6ea8fe);background:none;border:0;padding:2px 4px;border-radius:6px;cursor:pointer}",
  ".fc-link:hover{background:var(--dsw-alias-bg-hover,rgba(255,255,255,.06))}",
  ".fc-warn{margin-top:6px;font-size:12px;color:var(--dsw-alias-text-warning,#d9a441)}",
  ".fc-tab{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--fc-bg,#10141d)}",
  ".fc-tab-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.08))}",
  ".fc-tab-title{font-weight:600;font-size:13px}",
  ".fc-tab-meta{font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}",
  ".fc-tab-spacer{flex:1}",
  ".fc-tab-scroll{flex:1;min-height:0;overflow:auto;padding:16px}",
  ".fc-tab-scroll svg{display:block;margin:0 auto;max-width:100%;height:auto}",
  ".fc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;padding:24px;text-align:center;color:var(--dsw-alias-text-tertiary,#98a2b3);font-size:13px}",
  ".fc-empty strong{color:var(--dsw-alias-text-secondary,#c7ced9);font-weight:600}",
  ".fc-source{margin-top:16px}",
  ".fc-source summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-text-tertiary,#98a2b3)}",
  ".fc-source pre{margin:8px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-sunken,rgba(0,0,0,.25));font:11.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;color:var(--dsw-alias-text-secondary,#c7ced9)}"
].join("\n");
function readMeta(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.v !== 1) return null;
  if (typeof value.svg !== "string" || typeof value.title !== "string") return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  return value;
}
function toFlowText(payload) {
  const lines = [`flowchart ${payload.direction ?? "TB"}`, `title: ${payload.title}`];
  for (const node of payload.nodes) {
    const label = String(node.label).replace(/\n/gu, " ");
    if (node.shape === "start" || node.shape === "end") lines.push(`${node.id}([${label}])`);
    else if (node.shape === "decision") lines.push(`${node.id}{${label}}`);
    else if (node.shape === "io") lines.push(`${node.id}[/${label}/]`);
    else if (node.shape === "data") lines.push(`${node.id}[(${label})]`);
    else lines.push(`${node.id}[${label}]`);
  }
  for (const edge of payload.edges) {
    const arrow = edge.dashed === true ? "-.->" : edge.thick === true ? "==>" : "-->";
    const label = edge.label === void 0 || edge.label === "" ? "" : `|${edge.label}|`;
    lines.push(`${edge.from} ${arrow}${label} ${edge.to}`);
  }
  return lines.join("\n");
}
function glyph() {
  return React.createElement(
    "svg",
    { viewBox: "0 0 20 20", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.4 },
    React.createElement("rect", { x: 6.5, y: 1.5, width: 7, height: 4, rx: 1 }),
    React.createElement("rect", { x: 1.5, y: 13.5, width: 7, height: 4.5, rx: 1 }),
    React.createElement("rect", { x: 11.5, y: 13.5, width: 7, height: 4.5, rx: 1 }),
    React.createElement("path", { d: "M10 5.5v3.2M10 8.7H5v4.8M10 8.7h5v4.8" })
  );
}
function emptyNote() {
  return React.createElement(
    "div",
    { className: "fc-empty" },
    React.createElement("strong", null, "\u6D41\u7A0B\u56FE\u5C1A\u672A\u8F7D\u5165"),
    React.createElement(
      "span",
      null,
      "\u9875\u9762\u5237\u65B0\u540E\u4FA7\u680F\u53D6\u4E0D\u56DE\u8FD9\u5F20\u56FE\u3002\u56DE\u5230\u5BF9\u8BDD\u91CC\uFF0C\u70B9\u90A3\u6761 flowchart \u8C03\u7528\u4E0A\u7684\u300C\u5728\u4FA7\u680F\u6253\u5F00\u300D\u5373\u53EF\u91CD\u65B0\u8F7D\u5165\u3002"
    )
  );
}
function TabBody(props) {
  const info = props?.hooks?.tabInfo?.() ?? props?.tab ?? props;
  const navigation = info?.navigation ?? props?.navigation;
  const payload = readMeta(navigation?.params?.payload);
  const [showSource, setShowSource] = React.useState(false);
  if (payload === null) return emptyNote();
  const source = toFlowText(payload);
  return React.createElement(
    "div",
    { className: "fc-tab" },
    React.createElement(
      "div",
      { className: "fc-tab-bar" },
      React.createElement("span", { className: "fc-tab-title" }, payload.title),
      React.createElement("span", { className: "fc-tab-meta" }, payload.summary),
      React.createElement("span", { className: "fc-tab-spacer" }),
      React.createElement(
        "button",
        {
          type: "button",
          className: "fc-link",
          onClick: () => {
            setShowSource((value) => !value);
          }
        },
        showSource ? "\u9690\u85CF\u6E90\u7801" : "\u67E5\u770B Mermaid \u6E90\u7801"
      )
    ),
    React.createElement(
      "div",
      { className: "fc-tab-scroll" },
      React.createElement("div", { dangerouslySetInnerHTML: { __html: payload.svg } }),
      showSource ? React.createElement(
        "details",
        { className: "fc-source", open: true },
        React.createElement("summary", null, "Mermaid \u6E90\u7801"),
        React.createElement("pre", null, source)
      ) : null,
      ...(payload.warnings ?? []).map((warning) => React.createElement("div", { className: "fc-warn" }, warning))
    )
  );
}
function CallCard(props) {
  const payload = readMeta(props?.block?.meta);
  const callId = props?.callId ?? props?.block?.callId ?? payload?.title;
  const opened = React.useRef(null);
  React.useEffect(() => {
    if (payload === null || action.openTab === null) return;
    if (opened.current === callId) return;
    opened.current = callId;
    action.openTab(payload);
  }, [payload, callId]);
  if (payload === null) {
    return React.createElement(
      "div",
      { className: "fc-card" },
      React.createElement(
        "div",
        { className: "fc-card-head" },
        React.createElement("span", { className: "fc-card-title" }, "\u6D41\u7A0B\u56FE"),
        React.createElement("span", { className: "fc-card-meta" }, "\u6B63\u5728\u751F\u6210\u2026")
      )
    );
  }
  return React.createElement(
    "div",
    { className: "fc-card" },
    React.createElement(
      "div",
      { className: "fc-card-head" },
      React.createElement("span", { className: "fc-card-glyph", "aria-hidden": "true" }, glyph()),
      React.createElement("span", { className: "fc-card-title" }, payload.title),
      React.createElement("span", { className: "fc-card-meta" }, payload.summary),
      action.openTab === null ? null : React.createElement(
        "button",
        { type: "button", className: "fc-card-open fc-link", onClick: () => {
          action.openTab(payload);
        } },
        "\u5728\u4FA7\u680F\u6253\u5F00"
      )
    ),
    React.createElement("div", { className: "fc-card-thumb", dangerouslySetInnerHTML: { __html: payload.svg } }),
    ...(payload.warnings ?? []).map((warning) => React.createElement("div", { className: "fc-warn" }, warning))
  );
}
function installStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-dsh-flowchart]") !== null) return;
  const style = document.createElement("style");
  style.setAttribute("data-dsh-flowchart", "");
  style.textContent = CSS;
  document.head.append(style);
}
var name = CLIENT_ID;
var inject = ["slots"];
function apply(ctx) {
  installStyles();
  ctx.inject(["sidebarRight", "sidebarRightTabs"], (scope) => {
    const openInto = (payload, sessionId) => {
      if (sessionId === void 0 || typeof scope.sidebarRight.openTabIn !== "function") {
        scope.sidebarRight.openTab(TAB_KIND, { params: { payload } });
        return;
      }
      scope.sidebarRight.openTabIn(sessionId, TAB_KIND, { params: { payload } });
    };
    action.openTab = (payload) => {
      openInto(payload, void 0);
    };
    action.openTabIn = openInto;
    scope.sidebarRightTabs.register({
      id: TAB_KIND,
      kind: TAB_KIND,
      title: () => "\u6D41\u7A0B\u56FE",
      guide: [{
        id: `${TAB_KIND}-guide`,
        order: 42,
        title: () => "\u6D41\u7A0B\u56FE",
        description: () => "\u67E5\u770B agent \u6700\u8FD1\u7ED8\u5236\u7684\u6D41\u7A0B\u56FE",
        icon: () => glyph()
      }]
    });
  });
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab", key: TAB_KIND, locale: CLIENT_ID },
    TabBody
  ));
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register(
    { name: "tool.call.toolview", key: "flowchart", locale: CLIENT_ID },
    CallCard
  ));
}
var client_default = { name, inject, apply, TabBody, CallCard, readMeta, toFlowText };

return module.exports; } });
