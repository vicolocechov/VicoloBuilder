import { describe, expect, it } from "vitest";
import { buildUpdatePagePropsCommand } from "../../src/write/buildUpdatePagePropsCommand.js";

// Fase 14 (SEO per pagina): nucleo = title/description/canonical, elenco
// chiuso, nessun congelamento/cascata (Page.props non passa dal Resolver).

describe("buildUpdatePagePropsCommand — chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dall'elenco chiuso", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { "og:image": "x" } as never)).toThrow();
  });

  it("il messaggio d'errore elenca le tre chiavi ammesse", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", { "og:image": "x" } as never)).toThrow(
      /title.*description.*canonical/i,
    );
  });

  it("lancia se changedProps è vuoto", () => {
    expect(() => buildUpdatePagePropsCommand("page-home", {})).toThrow();
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
