import { describe, expect, it } from "vitest";
import type { DocumentNode } from "@vicolobuilder/engine";
import { frozenFieldState } from "../../src/panel/frozenFieldState.js";

function node(props: Record<string, unknown>): DocumentNode {
  return { id: "card", type: "box", parentId: null, childrenIds: [], props };
}

describe("frozenFieldState", () => {
  it("alla fascia base (desktop) è sempre 'overridden-here'", () => {
    expect(frozenFieldState(node({ x: 10 }), "desktop", "x")).toBe("overridden-here");
  });

  it("su una fascia più stretta senza override proprio è 'inherited'", () => {
    expect(frozenFieldState(node({ x: 10 }), "mobile-verticale", "x")).toBe("inherited");
  });

  it("su una fascia più stretta CON override proprio per quella chiave è 'overridden-here'", () => {
    const n = node({ x: 10, responsive: { "mobile-verticale": { x: 5 } } });
    expect(frozenFieldState(n, "mobile-verticale", "x")).toBe("overridden-here");
  });

  it("un override su mobile-verticale per 'x' non rende 'overridden-here' anche 'y' sulla stessa fascia", () => {
    const n = node({ x: 10, y: 20, responsive: { "mobile-verticale": { x: 5 } } });
    expect(frozenFieldState(n, "mobile-verticale", "y")).toBe("inherited");
  });

  // Fase S1: stessa funzione, ora generica anche su una chiave di STYLE_KEYS
  // (non solo GeometryKey) - nessuna logica diversa, stesso comportamento.
  it("funziona identicamente per 'columns' (STYLE_KEYS), non solo per la geometria", () => {
    const n = node({ columns: 4, responsive: { "mobile-verticale": { columns: 2 } } });
    expect(frozenFieldState(n, "mobile-verticale", "columns")).toBe("overridden-here");
    expect(frozenFieldState(n, "tablet-verticale", "columns")).toBe("inherited");
  });
});
