import { describe, expect, it } from "vitest";
import { buildUpdatePagePropsCommand } from "../../src/write/buildUpdatePagePropsCommand.js";

// Fase 14 (SEO per pagina): nucleo = title/description/canonical, elenco
// chiuso, nessun congelamento/cascata (Page.props non passa dal Resolver).
// B4 (SEO og:*/lang): ogTitle/ogDescription aggiunti allo stesso elenco.

describe("buildUpdatePagePropsCommand — chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dall'elenco chiuso", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { "og:image": "x" } as never)).toThrow();
  });

  it("il messaggio d'errore elenca le cinque chiavi ammesse", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { "og:image": "x" } as never)).toThrow(
      /title.*description.*canonical.*ogTitle.*ogDescription/i,
    );
  });

  it("lancia se changedProps è vuoto", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", {})).toThrow();
  });

  it("B4: nessun campo 'ogUrl' - deriva sempre da 'canonical', mai un campo scrivibile qui (verifica esplicita, non solo un'assenza silenziosa)", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { ogUrl: "https://example.com/" } as never)).toThrow(
      /non riconosciuta/i,
    );
  });
});

describe("buildUpdatePagePropsCommand — scrittura", () => {
  it("costruisce UPDATE_PAGE_PROPS con una sola chiave", () => {
    const command = buildUpdatePagePropsCommand("page-home", { title: "Ciao" });
    expect(command).toEqual({ type: "UPDATE_PAGE_PROPS", pageId: "page-home", props: { title: "Ciao" } });
  });

  it("costruisce UPDATE_PAGE_PROPS con più chiavi nello stesso gesto", () => {
    const command = buildUpdatePagePropsCommand("page-home", {
      title: "Ciao",
      description: "Descrizione",
      canonical: "https://example.com/",
    });
    expect(command).toEqual({
      type: "UPDATE_PAGE_PROPS",
      pageId: "page-home",
      props: { title: "Ciao", description: "Descrizione", canonical: "https://example.com/" },
    });
  });
});

describe("buildUpdatePagePropsCommand — B4 (SEO og:*/lang): 'ogTitle'/'ogDescription'", () => {
  it("non lancia 'proprietà non riconosciuta' per ogTitle/ogDescription", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { ogTitle: "Titolo social" })).not.toThrow();
    expect(() => buildUpdatePagePropsCommand("page-home", { ogDescription: "Descrizione social" })).not.toThrow();
  });

  it("costruisce UPDATE_PAGE_PROPS con ogTitle/ogDescription, indipendenti da title/description", () => {
    const command = buildUpdatePagePropsCommand("page-home", {
      ogTitle: "Titolo social",
      ogDescription: "Descrizione social",
    });
    expect(command).toEqual({
      type: "UPDATE_PAGE_PROPS",
      pageId: "page-home",
      props: { ogTitle: "Titolo social", ogDescription: "Descrizione social" },
    });
  });
});
