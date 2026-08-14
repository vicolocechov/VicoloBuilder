import { describe, expect, it } from "vitest";
import { applyCommand, createDocument, resolveNode, getNode } from "@vicolobuilder/engine";
import { buildUpdatePropsCommand } from "../../src/write/buildUpdatePropsCommand.js";

// Fase 5, Blocco D: adattatore di scrittura Desktop-first (Decisione 1) +
// separazione geometria/contenuto (Opzione A per la geometria).
// Fase 6 (D-019): 7 fasce nominate, congelamento generalizzato a
// `widerBreakpoints` (vicini diretti, non più "la fascia successiva").

function baseDoc() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card",
    nodeType: "box",
    parentId: "root",
    props: { x: 10, y: 10, width: 100, height: 50, color: "black" },
  });
  return doc;
}

describe("buildUpdatePropsCommand — chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dai due elenchi chiusi", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { flexDirection: "row" } as never)).toThrow();
  });

  it("lancia se changedProps è vuoto", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", {})).toThrow();
  });
});

describe("buildUpdatePropsCommand — CONTENUTO: sempre sulla base", () => {
  it("scrive 'text' sui props base anche quando la vista attiva è Mobile verticale", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { text: "ciao" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { text: "ciao" } });
  });

  it("scrive 'color' sui props base anche quando la vista attiva è Tablet verticale", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "tablet-verticale", { color: "red" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { color: "red" } });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Desktop scrive direttamente sulla base", () => {
  it("nessun responsive coinvolto quando activeBreakpoint è 'desktop'", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "desktop", { x: 99, width: 200 });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { x: 99, width: 200 } });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Mobile verticale, nessun override preesistente altrove", () => {
  it("scrive sulla fascia mobile-verticale e congela tablet-verticale (unico vicino più largo) al valore risolto pre-modifica", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });

    // "card" non ha override responsive preesistenti: risolto a
    // tablet-verticale prima della modifica = base.x = 10.
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "mobile-verticale": { x: 5 }, "tablet-verticale": { x: 10 } } },
    });
  });

  it("il documento risultante mostra 5 su mobile-verticale, 10 su tablet-verticale, e 10 su desktop/laptop-compatto (isolamento tra diramazioni, non solo 'nessuna propagazione')", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile-verticale" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet-verticale" }).resolvedProps.x).toBe(10);
    // desktop/laptop-compatto non sono nemmeno nella cascata di mobile-verticale
    // (diramazioni di orientamento diverse) - isolati per costruzione, non solo schermati dal congelamento.
    expect(resolveNode(node, { breakpoint: "laptop-compatto" }).resolvedProps.x).toBe(10);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(10);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Mobile orizzontale (l'altra diramazione)", () => {
  it("scrive su mobile-orizzontale e congela tablet-orizzontale (stessa meccanica, diramazione landscape)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-orizzontale", { y: 3 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "mobile-orizzontale": { y: 3 }, "tablet-orizzontale": { y: 10 } } },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: Tablet verticale ha già un override proprio", () => {
  it("il congelamento usa il valore GIÀ RISOLTO su tablet-verticale (con l'override), non il valore di base", () => {
    let doc = baseDoc();
    // tablet-verticale ha già un override esplicito: x=77 (diverso dalla base, 10).
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "tablet-verticale": { x: 77 }, "mobile-verticale": { x: 5 } } },
    });
  });

  it("non tocca laptop-compatto/desktop: già fuori dalla cascata di mobile-verticale, indipendentemente dal congelamento", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile-verticale" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet-verticale" }).resolvedProps.x).toBe(77);
    expect(resolveNode(node, { breakpoint: "laptop-compatto" }).resolvedProps.x).toBe(10);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(10);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: modifica su una fascia senza vicini più larghi", () => {
  it(
    "editare tablet-verticale non congela nulla: nessuna fascia più larga la include nella propria cascata " +
      "(cambio di comportamento rispetto a Fase 5, dove ogni fascia aveva sempre una 'successiva' - qui tablet-verticale " +
      "è l'estremità della propria diramazione, non un anello di una catena unica)",
    () => {
      const doc = baseDoc();
      const command = buildUpdatePropsCommand(doc, "card", "tablet-verticale", { y: 20 });

      expect(command).toEqual({
        type: "UPDATE_PROPS",
        nodeId: "card",
        props: { responsive: { "tablet-verticale": { y: 20 } } },
      });
    },
  );

  it("stesso comportamento per laptop-compatto e desktop-compatto (bende indipendenti, mai un vicino più largo)", () => {
    const doc = baseDoc();
    expect(buildUpdatePropsCommand(doc, "card", "laptop-compatto", { y: 20 })).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "laptop-compatto": { y: 20 } } },
    });
    expect(buildUpdatePropsCommand(doc, "card", "desktop-compatto", { y: 20 })).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "desktop-compatto": { y: 20 } } },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: chiavi miste, congelamento per-chiave indipendente", () => {
  it("se tablet-verticale ha già un override solo per 'x', il congelamento su mobile-verticale tocca tablet-verticale solo per 'y'", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5, y: 6 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "tablet-verticale": { x: 77, y: 10 }, // x preesistente conservato, y congelato al valore risolto (=base, 10)
          "mobile-verticale": { x: 5, y: 6 },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA + CONTENUTO insieme", () => {
  it("divide correttamente le chiavi tra i due gruppi in una singola chiamata", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5, text: "ciao" });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { text: "ciao", responsive: { "mobile-verticale": { x: 5 }, "tablet-verticale": { x: 10 } } },
    });
  });
});
