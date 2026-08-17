import { describe, expect, it } from "vitest";
import { htmlTagFor } from "../src/htmlTag.js";

describe("htmlTagFor", () => {
  it("mappa i type semantici di Fase 9 al tag HTML corrispondente", () => {
    expect(htmlTagFor("h1")).toBe("h1");
    expect(htmlTagFor("h2")).toBe("h2");
    expect(htmlTagFor("h3")).toBe("h3");
    expect(htmlTagFor("paragraph")).toBe("p");
    expect(htmlTagFor("link")).toBe("a");
  });

  it("mappa 'image' (Fase 15) a 'img'", () => {
    expect(htmlTagFor("image")).toBe("img");
  });

  it("ricade su 'div' per ogni altro type, compresi quelli già esistenti prima di Fase 9 (comportamento invariato)", () => {
    expect(htmlTagFor("box")).toBe("div");
    expect(htmlTagFor("text")).toBe("div");
    expect(htmlTagFor("scene")).toBe("div");
    expect(htmlTagFor("page-root")).toBe("div");
    expect(htmlTagFor("qualcosa-di-sconosciuto")).toBe("div");
    expect(htmlTagFor("")).toBe("div");
  });
});
