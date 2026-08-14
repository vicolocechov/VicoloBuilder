import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import {
  cascadingBreakpoints,
  getBreakpoint,
  BREAKPOINTS,
  BASE_BREAKPOINT,
  listBreakpointNames,
  widerBreakpoints,
} from "../../src/resolver/breakpoints.js";
import { resolveDocument, resolveNode } from "../../src/resolver/resolveNode.js";

function baseDocument() {
  return createDocument({ rootNodeId: "root" });
}

describe("breakpoints — 7 fasce nominate (Fase 6, D-019)", () => {
  it("mai lette da window/DOM: BREAKPOINTS è un array statico noto in anticipo, con le 7 fasce reali", () => {
    expect(BREAKPOINTS.map((b) => b.name)).toEqual([
      "mobile-verticale",
      "mobile-orizzontale",
      "tablet-verticale",
      "tablet-orizzontale",
      "laptop-compatto",
      "desktop-compatto",
      "desktop",
    ]);
  });

  it("getBreakpoint lancia su un nome sconosciuto invece di restituire un default silenzioso", () => {
    expect(() => getBreakpoint("does-not-exist")).toThrow();
  });

  it("getBreakpoint restituisce il predicato esatto di ciascuna fascia (dati presi dall'audit del sito reale)", () => {
    expect(getBreakpoint("mobile-verticale")).toEqual({ name: "mobile-verticale", maxWidth: 767, orientation: "portrait" });
    expect(getBreakpoint("mobile-orizzontale")).toEqual({ name: "mobile-orizzontale", orientation: "landscape", maxHeight: 550 });
    expect(getBreakpoint("tablet-verticale")).toEqual({ name: "tablet-verticale", minWidth: 768, maxWidth: 1024, orientation: "portrait" });
    expect(getBreakpoint("tablet-orizzontale")).toEqual({
      name: "tablet-orizzontale",
      minWidth: 768,
      maxWidth: 1199,
      orientation: "landscape",
      minHeight: 551,
    });
    expect(getBreakpoint("laptop-compatto")).toEqual({ name: "laptop-compatto", minWidth: 1025, maxWidth: 1199 });
    expect(getBreakpoint("desktop-compatto")).toEqual({ name: "desktop-compatto", minWidth: 1200, maxWidth: 1399 });
    expect(getBreakpoint("desktop")).toEqual({ name: "desktop", minWidth: 1200 });
  });

  it("BASE_BREAKPOINT è 'desktop' (convenzione Desktop-first, invariata)", () => {
    expect(BASE_BREAKPOINT).toBe("desktop");
  });

  it("listBreakpointNames restituisce tutti e 7 i nomi", () => {
    expect(listBreakpointNames()).toEqual(BREAKPOINTS.map((b) => b.name));
  });
});

describe("cascadingBreakpoints — ordine curato a mano (Fase 6, Punto 2)", () => {
  it("una fascia senza fasce più strette nella propria diramazione cascata solo su se stessa", () => {
    expect(cascadingBreakpoints("mobile-verticale").map((b) => b.name)).toEqual(["mobile-verticale"]);
    expect(cascadingBreakpoints("mobile-orizzontale").map((b) => b.name)).toEqual(["mobile-orizzontale"]);
  });

  it("tablet-verticale eredita da mobile-verticale (stessa diramazione: portrait, larghezza crescente)", () => {
    expect(cascadingBreakpoints("tablet-verticale").map((b) => b.name)).toEqual(["mobile-verticale", "tablet-verticale"]);
  });

  it("tablet-orizzontale eredita da mobile-orizzontale (stessa diramazione: landscape)", () => {
    expect(cascadingBreakpoints("tablet-orizzontale").map((b) => b.name)).toEqual(["mobile-orizzontale", "tablet-orizzontale"]);
  });

  it("le fasce senza vincolo di orientamento sono bende indipendenti: nessuna eredita da un'altra fascia senza vincolo", () => {
    expect(cascadingBreakpoints("laptop-compatto").map((b) => b.name)).toEqual(["laptop-compatto"]);
    expect(cascadingBreakpoints("desktop-compatto").map((b) => b.name)).toEqual(["desktop-compatto"]);
    expect(cascadingBreakpoints("desktop").map((b) => b.name)).toEqual(["desktop"]);
  });

  it("getBreakpoint lancia su un nome sconosciuto", () => {
    expect(() => cascadingBreakpoints("does-not-exist")).toThrow();
  });
});

describe("widerBreakpoints — inverso di CASCADE_ORDER (usato dal congelamento nel Renderer)", () => {
  it("mobile-verticale si propaga solo in tablet-verticale", () => {
    expect(widerBreakpoints("mobile-verticale")).toEqual(["tablet-verticale"]);
  });

  it("mobile-orizzontale si propaga solo in tablet-orizzontale", () => {
    expect(widerBreakpoints("mobile-orizzontale")).toEqual(["tablet-orizzontale"]);
  });

  it("le fasce senza fasce più larghe nella propria diramazione non si propagano in nessuna", () => {
    expect(widerBreakpoints("tablet-verticale")).toEqual([]);
    expect(widerBreakpoints("tablet-orizzontale")).toEqual([]);
    expect(widerBreakpoints("laptop-compatto")).toEqual([]);
    expect(widerBreakpoints("desktop-compatto")).toEqual([]);
    expect(widerBreakpoints("desktop")).toEqual([]);
  });
});

describe("resolveDocument — override responsive per breakpoint (matrice #9, adattata alle 7 fasce)", () => {
  function documentWithResponsiveNode() {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "box1",
      nodeType: "box",
      parentId: "root",
      props: {
        padding: 8,
        responsive: {
          "tablet-verticale": { padding: 16 },
        },
      },
    });
    return doc;
  }

  it("a 'mobile-verticale' si applica solo la base, nessun override", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "mobile-verticale" });
    expect(model.nodes.get("box1")!.resolvedProps.padding).toBe(8);
  });

  it("a 'tablet-verticale' si applica l'override proprio", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "tablet-verticale" });
    expect(model.nodes.get("box1")!.resolvedProps.padding).toBe(16);
  });

  it("la chiave 'responsive' non compare mai in resolvedProps", () => {
    const model = resolveDocument(documentWithResponsiveNode(), { breakpoint: "desktop" });
    expect(model.nodes.get("box1")!.resolvedProps).not.toHaveProperty("responsive");
  });

  it("un nodo senza responsive risolve identico a qualunque fascia", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "plain", nodeType: "box", parentId: "root", props: { color: "blue" } });

    const mobile = resolveDocument(doc, { breakpoint: "mobile-verticale" }).nodes.get("plain")!.resolvedProps;
    const desktop = resolveDocument(doc, { breakpoint: "desktop" }).nodes.get("plain")!.resolvedProps;
    expect(mobile).toEqual(desktop);
  });

  it(
    "un override su una fascia CON vincolo di orientamento NON si propaga a una fascia SENZA vincolo, anche se più larga " +
      "(il caso che una formula ingenua su solo larghezza/orientamento avrebbe sbagliato - verificato esplicitamente)",
    () => {
      let doc = baseDocument();
      doc = applyCommand(doc, {
        type: "CREATE_NODE",
        nodeId: "box1",
        nodeType: "box",
        parentId: "root",
        props: { padding: 8, responsive: { "mobile-verticale": { padding: 99 } } },
      });

      // "mobile-verticale" è più stretta di "laptop-compatto"/"desktop-compatto"/"desktop"
      // in termini di larghezza, ma appartiene a una diramazione di orientamento
      // diversa (nessuna delle tre ha vincolo di orientamento) - non deve propagarsi.
      expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "laptop-compatto" }).resolvedProps.padding).toBe(8);
      expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "desktop-compatto" }).resolvedProps.padding).toBe(8);
      expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "desktop" }).resolvedProps.padding).toBe(8);
      // ma si propaga correttamente all'interno della propria diramazione:
      expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "tablet-verticale" }).resolvedProps.padding).toBe(99);
    },
  );

  it("un override su 'laptop-compatto' non si propaga a 'desktop-compatto' (bende indipendenti, non una catena)", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "box1",
      nodeType: "box",
      parentId: "root",
      props: { padding: 8, responsive: { "laptop-compatto": { padding: 50 } } },
    });

    expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "laptop-compatto" }).resolvedProps.padding).toBe(50);
    expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "desktop-compatto" }).resolvedProps.padding).toBe(8);
    expect(resolveNode(doc.nodes.get("box1")!, { breakpoint: "desktop" }).resolvedProps.padding).toBe(8);
  });
});
