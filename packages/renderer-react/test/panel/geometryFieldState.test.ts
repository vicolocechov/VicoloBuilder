import { describe, expect, it } from "vitest";
import type { DocumentNode } from "@vicolobuilder/engine";
import { geometryFieldState } from "../../src/panel/geometryFieldState.js";

function node(props: Record<string, unknown>): DocumentNode {
  return { id: "card", type: "box", parentId: null, childrenIds: [], props };
}

describe("geometryFieldState", () => {
  it("alla fascia base (desktop) è sempre 'overridden-here'", () => {
    expect(geometryFieldState(node({ x: 10 }), "desktop", "x")).toBe("overridden-here");
  });

  it("su una fascia più stretta senza override proprio è 'inherited'", () => {
    expect(geometryFieldState(node({ x: 10 }), "mobile", "x")).toBe("inherited");
  });

  it("su una fascia più stretta CON override proprio per quella chiave è 'overridden-here'", () => {
    const n = node({ x: 10, responsive: { mobile: { x: 5 } } });
    expect(geometryFieldState(n, "mobile", "x")).toBe("overridden-here");
  });

  it("un override su mobile per 'x' non rende 'overridden-here' anche 'y' sulla stessa fascia", () => {
    const n = node({ x: 10, y: 20, responsive: { mobile: { x: 5 } } });
    expect(geometryFieldState(n, "mobile", "y")).toBe("inherited");
  });
});
