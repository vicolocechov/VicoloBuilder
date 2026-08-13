import { describe, expect, it } from "vitest";
import { slugify, uniqueId } from "../../src/pages/pageIds.js";

describe("slugify", () => {
  it("converte in minuscolo e sostituisce spazi/simboli con trattini", () => {
    expect(slugify("Chi Siamo")).toBe("chi-siamo");
    expect(slugify("  Contatti!! ")).toBe("contatti");
  });

  it("un nome vuoto (o solo simboli) ricade su 'pagina'", () => {
    expect(slugify("")).toBe("pagina");
    expect(slugify("!!!")).toBe("pagina");
  });
});

describe("uniqueId", () => {
  it("restituisce la base se non è già presa", () => {
    expect(uniqueId("page-home", new Set())).toBe("page-home");
  });

  it("aggiunge un suffisso numerico crescente finché non trova un id libero", () => {
    const taken = new Set(["page-home", "page-home-2", "page-home-3"]);
    expect(uniqueId("page-home", taken)).toBe("page-home-4");
  });
});
