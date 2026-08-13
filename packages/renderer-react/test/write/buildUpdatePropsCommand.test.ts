import { describe, expect, it } from "vitest";
import { applyCommand, createDocument, resolveNode, getNode } from "@vicolobuilder/engine";
import { buildUpdatePropsCommand } from "../../src/write/buildUpdatePropsCommand.js";

// Fase 5, Blocco D: adattatore di scrittura Desktop-first (Decisione 1) +
// separazione geometria/contenuto (Opzione A per la geometria).

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
  it("scrive 'text' sui props base anche quando la vista attiva è Mobile", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile", { text: "ciao" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { text: "ciao" } });
  });

  it("scrive 'color' sui props base anche quando la vista attiva è Tablet", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "tablet", { color: "red" });
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

describe("buildUpdatePropsCommand — GEOMETRIA: vista Mobile, nessun override preesistente altrove", () => {
  it("scrive sulla fascia mobile e congela tablet (prima fascia più larga) al valore risolto pre-modifica", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5 });

    // "card" non ha override responsive preesistenti: risolto a Tablet prima
    // della modifica = base.x = 10 (nessun override in mezzo).
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { mobile: { x: 5 }, tablet: { x: 10 } } },
    });
  });

  it("il documento risultante mostra 5 su Mobile, 10 su Tablet e 10 su Desktop (nessuna propagazione verso l'alto)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet" }).resolvedProps.x).toBe(10);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(10);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: Tablet già ha un override proprio", () => {
  it("il congelamento usa il valore GIÀ RISOLTO su Tablet (con l'override), non il valore di base", () => {
    let doc = baseDoc();
    // Tablet ha già un override esplicito: x=77 (diverso dalla base, 10).
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { tablet: { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { tablet: { x: 77 }, mobile: { x: 5 } } },
    });
  });

  it("non tocca Desktop: l'override già presente su Tablet scherma anche Desktop dalla propagazione", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { tablet: { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet" }).resolvedProps.x).toBe(77);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(77);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: modifica su Tablet, congela solo Desktop", () => {
  it("non tocca mobile (fascia più stretta, non coinvolta)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "tablet", { y: 20 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { tablet: { y: 20 }, desktop: { y: 10 } } },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: chiavi miste, congelamento per-chiave indipendente", () => {
  it("se Tablet ha già un override solo per 'x', il congelamento su Mobile tocca Tablet solo per 'y'", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { tablet: { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5, y: 6 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          tablet: { x: 77, y: 10 }, // x preesistente conservato, y congelato al valore risolto (=base, 10)
          mobile: { x: 5, y: 6 },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA + CONTENUTO insieme", () => {
  it("divide correttamente le chiavi tra i due gruppi in una singola chiamata", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile", { x: 5, text: "ciao" });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { text: "ciao", responsive: { mobile: { x: 5 }, tablet: { x: 10 } } },
    });
  });
});
