#!/usr/bin/env node
// Demo di validazione Fase 2 (Resolver + Layout).
//
// Vincolo rispettato: l'unico import dal codice dell'Engine in questo file
// è dal pacchetto compilato "../dist/index.js" (il barrel pubblico). Nessun
// import diretto da resolver/*.js o layout/*.js interni. Questo script
// esegue il codice REALE dell'Engine (non una reimplementazione) e genera
// una pagina HTML statica con i risultati osservati.
import {
  createDocument,
  applyCommand,
  resolveDocument,
  computeLayout,
  validateDocument,
  validateResolvedModel,
  validateBox,
} from "../dist/index.js";

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "..", "..", "demos", "fase-2-validation-demo.html");

const BREAKPOINTS = ["mobile", "tablet", "desktop"];
const VIEWPORT_WIDTH = { mobile: 375, tablet: 768, desktop: 1280 };

/* ------------------------------------------------------------------ *
 * 1) Document di esempio (solo API pubblica: createDocument + applyCommand)
 *
 *    root (page-root)
 *    +-- hero (box, variant: "primary")
 *    |     +-- heading (text, "Benvenuto")
 *    +-- sidebar (box, padding:8, override responsive su tablet/desktop)
 *    +-- footer (text, "© Demo Fase 2" — nodo di controllo, nessun override)
 * ------------------------------------------------------------------ */
let doc = createDocument({ rootPageId: "page-home", rootPageName: "Home", rootNodeId: "root" });

doc = applyCommand(doc, {
  type: "CREATE_NODE",
  nodeId: "hero",
  nodeType: "box",
  parentId: "root",
  props: { variant: "primary" },
});

doc = applyCommand(doc, {
  type: "CREATE_NODE",
  nodeId: "heading",
  nodeType: "text",
  parentId: "hero",
  props: { content: "Benvenuto" },
});

doc = applyCommand(doc, {
  type: "CREATE_NODE",
  nodeId: "sidebar",
  nodeType: "box",
  parentId: "root",
  props: {
    padding: 8,
    responsive: {
      tablet: { padding: 16 },
      desktop: { padding: 32 },
    },
  },
});

doc = applyCommand(doc, {
  type: "CREATE_NODE",
  nodeId: "footer",
  nodeType: "text",
  parentId: "root",
  props: { content: "© Demo Fase 2" },
});

/* ------------------------------------------------------------------ *
 * 2) validateDocument sul Document di input
 * ------------------------------------------------------------------ */
const documentViolations = validateDocument(doc);

/* ------------------------------------------------------------------ *
 * 3) resolveDocument + computeLayout + validator, per ciascun breakpoint
 * ------------------------------------------------------------------ */
const scenarios = BREAKPOINTS.map((breakpoint) => {
  const model = resolveDocument(doc, { breakpoint });
  const resolvedModelViolations = validateResolvedModel(model);

  const box = computeLayout(model, { viewportWidth: VIEWPORT_WIDTH[breakpoint] });
  const boxViolations = validateBox(box);

  return { breakpoint, model, box, resolvedModelViolations, boxViolations };
});

/* ------------------------------------------------------------------ *
 * 4) Corrispondenza nodeId: Document -> ResolvedModel -> Box Tree
 * ------------------------------------------------------------------ */
function collectBoxNodeIds(box, acc = []) {
  acc.push(box.nodeId);
  for (const child of box.children) collectBoxNodeIds(child, acc);
  return acc;
}

function checkCorrespondence(document, model, box) {
  const documentIds = new Set(document.nodes.keys());
  const resolvedIds = new Set(model.nodes.keys());
  const rawBoxIds = collectBoxNodeIds(box);
  const boxIds = new Set(rawBoxIds);

  const noDuplicatesInBoxTree = rawBoxIds.length === boxIds.size;
  const documentResolvedMatch =
    documentIds.size === resolvedIds.size && [...documentIds].every((id) => resolvedIds.has(id));
  const documentBoxMatch = documentIds.size === boxIds.size && [...documentIds].every((id) => boxIds.has(id));

  return {
    documentCount: documentIds.size,
    resolvedCount: resolvedIds.size,
    boxCount: boxIds.size,
    rawBoxTraversalCount: rawBoxIds.length,
    noDuplicatesInBoxTree,
    documentResolvedMatch,
    documentBoxMatch,
    fullyConsistent: noDuplicatesInBoxTree && documentResolvedMatch && documentBoxMatch,
  };
}

const correspondence = scenarios.map((s) => ({
  breakpoint: s.breakpoint,
  ...checkCorrespondence(doc, s.model, s.box),
}));

/* ------------------------------------------------------------------ *
 * 5) Effetto osservabile del breakpoint (sidebar.padding) e del
 *    controllo negativo (footer.content, nessun override -> invariato)
 * ------------------------------------------------------------------ */
const sidebarPaddingByBreakpoint = scenarios.map((s) => ({
  breakpoint: s.breakpoint,
  value: s.model.nodes.get("sidebar").resolvedProps.padding,
}));

const footerContentByBreakpoint = scenarios.map((s) => ({
  breakpoint: s.breakpoint,
  value: s.model.nodes.get("footer").resolvedProps.content,
}));

const heroResolvedProps = scenarios[0].model.nodes.get("hero").resolvedProps;
const VARIANT_EXPANSION_KEYS = ["background", "color", "padding", "radius"];

/* ------------------------------------------------------------------ *
 * 6) Checklist oggettiva (criteri di validazione concordati)
 * ------------------------------------------------------------------ */
const checks = {
  documentValidatorClean: documentViolations.length === 0,
  resolvedModelValidatorsClean: scenarios.every((s) => s.resolvedModelViolations.length === 0),
  boxValidatorsClean: scenarios.every((s) => s.boxViolations.length === 0),
  responsiveOverrideHasEffect: new Set(sidebarPaddingByBreakpoint.map((v) => v.value)).size > 1,
  controlNodeUnaffectedByBreakpoint: new Set(footerContentByBreakpoint.map((v) => v.value)).size === 1,
  variantExpansionPresent: VARIANT_EXPANSION_KEYS.every((k) => heroResolvedProps[k] !== undefined),
  nodeIdCorrespondenceComplete: correspondence.every((c) => c.fullyConsistent),
};
const allChecksPass = Object.values(checks).every(Boolean);

console.log("=== Demo di validazione Fase 2 — risultati ===");
console.log("Nodi nel Document:", doc.nodes.size);
for (const s of scenarios) {
  console.log(
    `Breakpoint "${s.breakpoint}": resolvedModelViolations=${s.resolvedModelViolations.length} boxViolations=${s.boxViolations.length}`,
  );
}
console.log("sidebar.padding per breakpoint:", sidebarPaddingByBreakpoint);
console.log("footer.content per breakpoint (controllo, atteso invariato):", footerContentByBreakpoint);
console.log("hero.resolvedProps (variant primary):", heroResolvedProps);
console.log("Corrispondenza nodeId:", correspondence);
console.log("Checklist:", checks);
console.log("TUTTI I CRITERI SODDISFATTI:", allChecksPass);

/* ------------------------------------------------------------------ *
 * 7) Generazione pagina HTML statica (solo presentazione dei dati già
 *    calcolati sopra; nessuna logica Engine nel browser)
 * ------------------------------------------------------------------ */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function serializeDocumentTree(document) {
  const page = document.pages.get(document.rootPageId);
  function walk(id) {
    const node = document.nodes.get(id);
    return {
      id: node.id,
      type: node.type,
      props: node.props,
      children: node.childrenIds.map(walk),
    };
  }
  return walk(page.rootNodeId);
}

function serializeResolvedTree(model) {
  const page = model.pages.get(model.rootPageId);
  function walk(id) {
    const node = model.nodes.get(id);
    return {
      id: node.id,
      type: node.type,
      resolvedProps: node.resolvedProps,
      children: node.childrenIds.map(walk),
    };
  }
  return walk(page.rootNodeId);
}

function serializeBox(box) {
  return {
    nodeId: box.nodeId,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    children: box.children.map(serializeBox),
  };
}

const embeddedData = {
  generatedAt: new Date().toISOString(),
  documentTree: serializeDocumentTree(doc),
  documentNodeCount: doc.nodes.size,
  documentViolations,
  checks,
  allChecksPass,
  sidebarPaddingByBreakpoint,
  footerContentByBreakpoint,
  heroResolvedProps,
  scenarios: scenarios.map((s) => ({
    breakpoint: s.breakpoint,
    viewportWidth: VIEWPORT_WIDTH[s.breakpoint],
    resolvedTree: serializeResolvedTree(s.model),
    resolvedModelViolations: s.resolvedModelViolations,
    box: serializeBox(s.box),
    boxViolations: s.boxViolations,
  })),
  correspondence,
};

const CHECK_LABELS = {
  documentValidatorClean: "validateDocument sul Document di input: zero violazioni",
  resolvedModelValidatorsClean: "validateResolvedModel: zero violazioni, in ogni breakpoint",
  boxValidatorsClean: "validateBox: zero violazioni, in ogni breakpoint",
  responsiveOverrideHasEffect: "L'override responsive su \"sidebar\" produce valori diversi tra i breakpoint",
  controlNodeUnaffectedByBreakpoint: "Il nodo di controllo \"footer\" (nessun override) resta invariato tra i breakpoint",
  variantExpansionPresent: "variant:\"primary\" su \"hero\" espande le proprietà derivate attese",
  nodeIdCorrespondenceComplete: "Corrispondenza nodeId completa: Document → ResolvedModel → Box Tree, in ogni breakpoint",
};

const html = `<title>VicoloBuilder — Fase 2: Demo di validazione (Resolver + Layout)</title>
<style>
  :root {
    --bg: #f4f6f5; --surface: #ffffff; --surface-2: #eef1f0; --border: #dbe2df;
    --ink: #16211f; --ink-dim: #5b6b68; --ink-faint: #8a9895;
    --accent: #0f8a7d; --accent-soft: #e3f3f0;
    --good: #1f9d63; --good-soft: #e3f6ec; --bad: #c9372c; --bad-soft: #fbe7e5;
    --font-ui: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e1513; --surface: #151d1b; --surface-2: #1b2523; --border: #2b3735;
      --ink: #e7efec; --ink-dim: #94a6a1; --ink-faint: #6c7d78;
      --accent: #55d6c4; --accent-soft: #17322e;
      --good: #4fdb95; --good-soft: #163429; --bad: #f0766e; --bad-soft: #3a1f1d;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0e1513; --surface: #151d1b; --surface-2: #1b2523; --border: #2b3735;
    --ink: #e7efec; --ink-dim: #94a6a1; --ink-faint: #6c7d78;
    --accent: #55d6c4; --accent-soft: #17322e;
    --good: #4fdb95; --good-soft: #163429; --bad: #f0766e; --bad-soft: #3a1f1d;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 400 14px/1.5 var(--font-ui); padding: 24px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .subtitle { color: var(--ink-dim); font-size: 13px; margin: 0 0 20px; }
  .caption { color: var(--ink-dim); font-size: 12.5px; max-width: 70ch; }
  h2 { font: 700 11px/1 var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--ink-dim); margin: 26px 0 10px; }
  .banner { border-radius: 10px; padding: 14px 16px; font-weight: 700; margin-bottom: 18px; border: 1px solid; }
  .banner.ok { background: var(--good-soft); border-color: var(--good); color: var(--ink); }
  .banner.fail { background: var(--bad-soft); border-color: var(--bad); color: var(--ink); }
  .checklist { display: flex; flex-direction: column; gap: 6px; }
  .check-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; background: var(--surface-2); font-size: 12.5px; }
  .pill { font: 700 10px/1 var(--font-mono); padding: 4px 8px; border-radius: 20px; flex: none; }
  .pill.ok { background: var(--good-soft); color: var(--good); }
  .pill.fail { background: var(--bad-soft); color: var(--bad); }
  .bp-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
  .bp-tab { font: 600 12.5px/1 var(--font-ui); padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); cursor: pointer; }
  .bp-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .columns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  @media (max-width: 900px) { .columns { grid-template-columns: 1fr; } }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; overflow-x: auto; }
  .panel h3 { font: 700 12px/1 var(--font-ui); margin: 0 0 8px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: .04em; }
  pre { margin: 0; font: 500 11.5px/1.5 var(--font-mono); white-space: pre-wrap; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--ink-dim); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  td.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .footer-note { margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--ink-faint); }
</style>

<h1>VicoloBuilder — Fase 2: Demo di validazione</h1>
<p class="subtitle">Document → Resolver → ResolvedModel → Layout → Box Tree — eseguito con il codice reale del pacchetto (${esc("packages/engine/dist/index.js")}), generato il ${esc(embeddedData.generatedAt)}</p>
<p class="caption">Questa pagina presenta dati già calcolati da uno script Node che importa esclusivamente il barrel pubblico dell'Engine. Nessuna logica di Resolver o Layout viene eseguita qui nel browser — il selettore sotto passa solo tra risultati pre-calcolati.</p>

<div class="banner ${allChecksPass ? "ok" : "fail"}">${allChecksPass ? "✓ Tutti i criteri di validazione della Fase 2 sono soddisfatti" : "✗ Uno o più criteri di validazione NON sono soddisfatti"}</div>

<h2>Checklist criteri di validazione</h2>
<div class="checklist">
${Object.entries(checks)
  .map(
    ([key, value]) =>
      `  <div class="check-item"><span class="pill ${value ? "ok" : "fail"}">${value ? "OK" : "FAIL"}</span><span>${esc(CHECK_LABELS[key] || key)}</span></div>`,
  )
  .join("\n")}
</div>

<h2>Effetto del breakpoint sull'override responsive (nodo "sidebar", proprietà "padding")</h2>
<table>
  <tr><th>Breakpoint</th>${BREAKPOINTS.map((b) => `<th>${esc(b)}</th>`).join("")}</tr>
  <tr><td>sidebar.padding</td>${sidebarPaddingByBreakpoint.map((v) => `<td class="mono">${esc(v.value)}</td>`).join("")}</tr>
  <tr><td>footer.content (controllo, nessun override)</td>${footerContentByBreakpoint.map((v) => `<td class="mono">${esc(v.value)}</td>`).join("")}</tr>
</table>

<h2>Documento risolto e Box Tree per breakpoint</h2>
<div class="bp-tabs" id="bp-tabs"></div>
<div class="columns">
  <div class="panel"><h3>Document (input, non cambia tra breakpoint)</h3><pre>${esc(JSON.stringify(embeddedData.documentTree, null, 2))}</pre></div>
  <div class="panel"><h3>ResolvedModel</h3><pre id="resolved-view"></pre></div>
  <div class="panel"><h3>Box Tree</h3><pre id="box-view"></pre></div>
</div>

<h2>Corrispondenza nodeId — Document ↔ ResolvedModel ↔ Box Tree</h2>
<table>
  <tr><th>Breakpoint</th><th>Nodi Document</th><th>Nodi ResolvedModel</th><th>Nodi Box (univoci)</th><th>Coerente</th></tr>
  ${correspondence
    .map(
      (c) =>
        `<tr><td>${esc(c.breakpoint)}</td><td class="mono">${c.documentCount}</td><td class="mono">${c.resolvedCount}</td><td class="mono">${c.boxCount}</td><td>${c.fullyConsistent ? "✓" : "✗"}</td></tr>`,
    )
    .join("\n")}
</table>

<div class="footer-note">Demo di validazione — non un editor. Nessun drag-and-drop, nessuna modifica interattiva. Generata da <code>packages/engine/demo/generate-fase-2-demo.mjs</code>.</div>

<script>
  const DATA = ${JSON.stringify(embeddedData)};
  const tabsEl = document.getElementById("bp-tabs");
  const resolvedView = document.getElementById("resolved-view");
  const boxView = document.getElementById("box-view");

  function render(breakpoint) {
    const scenario = DATA.scenarios.find((s) => s.breakpoint === breakpoint);
    resolvedView.textContent = JSON.stringify(scenario.resolvedTree, null, 2);
    boxView.textContent = JSON.stringify(scenario.box, null, 2);
    for (const btn of tabsEl.children) {
      btn.classList.toggle("on", btn.dataset.bp === breakpoint);
    }
  }

  for (const scenario of DATA.scenarios) {
    const btn = document.createElement("button");
    btn.className = "bp-tab";
    btn.type = "button";
    btn.dataset.bp = scenario.breakpoint;
    btn.textContent = scenario.breakpoint + " (" + scenario.viewportWidth + "px)";
    btn.addEventListener("click", () => render(scenario.breakpoint));
    tabsEl.appendChild(btn);
  }

  render(DATA.scenarios[0].breakpoint);
</script>
`;

writeFileSync(OUTPUT_PATH, html, "utf8");
console.log("\nHTML generato in:", OUTPUT_PATH);
