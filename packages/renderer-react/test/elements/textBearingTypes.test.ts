import { describe, expect, it } from "vitest";
import { isTextBearingType } from "../../src/elements/textBearingTypes.js";

describe("isTextBearingType", () => {
  it("riconosce i tipi che portano testo (default con 'text'/'fontSize', elements/createElementCommand.ts)", () => {
    expect(isTextBearingType("text")).toBe(true);
    expect(isTextBearingType("h1")).toBe(true);
    expect(isTextBearingType("h2")).toBe(true);
    expect(isTextBearingType("h3")).toBe(true);
    expect(isTextBearingType("paragraph")).toBe(true);
    expect(isTextBearingType("link")).toBe(true);
  });

  it("esclude i tipi che non portano testo, compresi quelli preesistenti prima di Fase 9/10", () => {
    expect(isTextBearingType("box")).toBe(false);
    expect(isTextBearingType("scene")).toBe(false);
    expect(isTextBearingType("page-root")).toBe(false);
    expect(isTextBearingType("qualcosa-di-sconosciuto")).toBe(false);
    expect(isTextBearingType("")).toBe(false);
  });
});
