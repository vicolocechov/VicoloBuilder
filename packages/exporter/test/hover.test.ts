import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { renderHoverRules } from "../src/hover.js";
import { escapeCssText } from "../src/escape.js";

function baseDoc(): Document {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("renderHoverRules — nessun hover registrato", () => {
  it("un documento senza alcun props.hover produce una stringa vuota", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    expect(renderHoverRules(doc)).toBe("");
  });
});

describe("renderHoverRules — un nodo con hover", () => {
  it("produce un blocco [data-node-id]:hover con !important su ogni proprietà", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "n", props: { hover: { color: "red", transform: "translateY(-6px)" } } });
    const css = renderHoverRules(doc);
    expect(css).toBe('[data-node-id="n"]:hover{color:red !important;transform:translateY(-6px) !important;}');
  });

  it("mappa correttamente le 4 chiavi HOVER_KEYS alle proprietà CSS (color->color, background->background, transform->transform, borderColor->border-color)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, {
      type: "UPDATE_PROPS",
      nodeId: "n",
      props: { hover: { color: "white", background: "black", transform: "scale(1.1)", borderColor: "gold" } },
    });
    const css = renderHoverRules(doc);
    expect(css).toContain("color:white !important");
    expect(css).toContain("background:black !important");
    expect(css).toContain("transform:scale(1.1) !important");
    expect(css).toContain("border-color:gold !important");
  });

  it("il colore hover (testo) e il colore base (sfondo) restano distinti anche quando entrambi impostati sullo stesso nodo", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "link",
      parentId: "root",
      props: { color: "#dbeafe", hover: { color: "red" } },
    });
    const css = renderHoverRules(doc);
    // Nel bag hover, "color" mappa a "color" CSS (testo) - non a "background".
    expect(css).toBe('[data-node-id="n"]:hover{color:red !important;}');
    expect(css).not.toContain("background");
  });
});

describe("renderHoverRules — più nodi con hover, ordine deterministico per nodeId", () => {
  it("emette un blocco per nodo, ordinato per nodeId (non l'ordine di inserimento nella Map)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "z-node", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a-node", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "z-node", props: { hover: { color: "red" } } });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "a-node", props: { hover: { color: "blue" } } });

    const css = renderHoverRules(doc);
    const indexA = css.indexOf('[data-node-id="a-node"]');
    const indexZ = css.indexOf('[data-node-id="z-node"]');
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexZ).toBeGreaterThan(indexA);
  });
});

describe("renderHoverRules — un nodo con props.hover vuoto o assente non produce alcun blocco", () => {
  it("props.hover assente: nessun blocco", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    expect(renderHoverRules(doc)).toBe("");
  });

  it("props.hover === {}: nessun blocco", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "n", props: { hover: {} } });
    expect(renderHoverRules(doc)).toBe("");
  });
});

describe("renderHoverRules — escaping avversario (color/background/transform/borderColor sono campi di testo liberi, D-030)", () => {
  it("un valore che tenta di chiudere la regola e iniettarne una nuova viene neutralizzato", () => {
    const malicious = 'red;}[data-node-id="x"]{display:none;}[y="';
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "n", props: { hover: { background: malicious } } });
    const css = renderHoverRules(doc);
    expect(css).not.toContain(`background:${malicious} !important`);
    expect(css).toContain(`background:${escapeCssText(malicious)} !important`);
    expect(css.match(/:hover\{/g)).toHaveLength(1);
  });

  it("il selettore data-node-id resta escapato anche qui (difesa in profondità, stesso principio di Batch 4)", () => {
    const rawNodeId = 'n"};body{display:none}[x="';
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: rawNodeId, nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: rawNodeId, props: { hover: { color: "red" } } });
    const css = renderHoverRules(doc);
    expect(css).not.toContain(`[data-node-id="${rawNodeId}"]`);
    expect(css).toContain(`[data-node-id="${escapeCssText(rawNodeId)}"]`);
  });
});

describe("renderHoverRules — determinismo", () => {
  it("due chiamate consecutive producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "n", props: { hover: { color: "red", background: "blue", transform: "scale(1.1)", borderColor: "gold" } } });
    expect(renderHoverRules(doc)).toBe(renderHoverRules(doc));
  });
});
