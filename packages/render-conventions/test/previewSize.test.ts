import { describe, expect, it } from "vitest";
import { listBreakpointNames } from "@vicolobuilder/engine";
import { PREVIEW_SIZE } from "../src/previewSize.js";

describe("PREVIEW_SIZE", () => {
  it("copre esattamente le 7 fasce dichiarate dal Resolver (D-019), nessuna in più o in meno", () => {
    expect(Object.keys(PREVIEW_SIZE).sort()).toEqual([...listBreakpointNames()].sort());
  });

  it("valori invariati dalla migrazione (Exporter Batch 4, decisione infrastrutturale #1) - stessi numeri già usati da Canvas/Preview prima dello spostamento", () => {
    expect(PREVIEW_SIZE).toEqual({
      "mobile-verticale": { width: 375, height: 812 },
      "mobile-orizzontale": { width: 700, height: 400 },
      "tablet-verticale": { width: 834, height: 1194 },
      "tablet-orizzontale": { width: 1024, height: 768 },
      "laptop-compatto": { width: 1100, height: 700 },
      "desktop-compatto": { width: 1300, height: 800 },
      desktop: { width: 1600, height: 900 },
    });
  });
});
