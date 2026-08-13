import { describe, expect, it } from "vitest";
import { movePageOrder } from "../../src/pages/movePageOrder.js";

describe("movePageOrder", () => {
  it("scambia con il vicino precedente (direzione -1)", () => {
    expect(movePageOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  });

  it("scambia con il vicino successivo (direzione 1)", () => {
    expect(movePageOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("restituisce null se già al primo posto e si chiede -1", () => {
    expect(movePageOrder(["a", "b", "c"], "a", -1)).toBeNull();
  });

  it("restituisce null se già all'ultimo posto e si chiede 1", () => {
    expect(movePageOrder(["a", "b", "c"], "c", 1)).toBeNull();
  });

  it("restituisce null per un pageId non presente nell'ordine", () => {
    expect(movePageOrder(["a", "b", "c"], "z", 1)).toBeNull();
  });

  it("non muta l'array originale", () => {
    const order = ["a", "b", "c"];
    movePageOrder(order, "b", 1);
    expect(order).toEqual(["a", "b", "c"]);
  });
});
