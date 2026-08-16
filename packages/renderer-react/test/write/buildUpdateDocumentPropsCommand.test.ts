import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import {
  buildRegisterFontCommand,
  buildUnregisterFontCommand,
  buildUpdateDocumentSeoCommand,
} from "../../src/write/buildUpdateDocumentPropsCommand.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("buildRegisterFontCommand", () => {
  it("registra il primo font su un documento senza font", () => {
    const doc = baseDoc();
    const command = buildRegisterFontCommand(doc, { family: "Poppins", weight: "600", src: "data:font/woff2;base64,AAAA" });
    expect(command).toEqual({
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "data:font/woff2;base64,AAAA" }] },
    });
  });

  it("aggiunge un font a quelli già registrati, non li sovrascrive (Poppins 500 + Poppins 600, stesso caso del sito reale)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildRegisterFontCommand(doc, { family: "Poppins", weight: "500", src: "a" }));
    const command = buildRegisterFontCommand(doc, { family: "Poppins", weight: "600", src: "b" });
    expect(command).toEqual({
      type: "UPDATE_DOCUMENT_PROPS",
      props: {
        fonts: [
          { family: "Poppins", weight: "500", src: "a" },
          { family: "Poppins", weight: "600", src: "b" },
        ],
      },
    });
  });

  it.each([
    ["family", { family: "", weight: "400", src: "x" }],
    ["weight", { family: "Poppins", weight: "", src: "x" }],
    ["src", { family: "Poppins", weight: "400", src: "" }],
  ] as const)("lancia se '%s' è vuoto", (_field, font) => {
    const doc = baseDoc();
    expect(() => buildRegisterFontCommand(doc, font)).toThrow();
  });
});

describe("buildUnregisterFontCommand", () => {
  it("rimuove solo il font con family+weight corrispondenti, lascia intatti gli altri", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildRegisterFontCommand(doc, { family: "Poppins", weight: "500", src: "a" }));
    doc = applyCommand(doc, buildRegisterFontCommand(doc, { family: "Poppins", weight: "600", src: "b" }));
    const command = buildUnregisterFontCommand(doc, "Poppins", "500");
    expect(command).toEqual({
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "b" }] },
    });
  });

  it("nessun errore se il font da rimuovere non esiste (nessun cambiamento)", () => {
    const doc = baseDoc();
    const command = buildUnregisterFontCommand(doc, "Inesistente", "400");
    expect(command).toEqual({ type: "UPDATE_DOCUMENT_PROPS", props: { fonts: [] } });
  });
});

describe("buildUpdateDocumentSeoCommand — B4 (SEO og:*/lang): chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dall'elenco chiuso", () => {
    expect(() => buildUpdateDocumentSeoCommand({ ogImage: "x" } as never)).toThrow();
  });

  it("il messaggio d'errore elenca le quattro chiavi ammesse", () => {
    expect(() => buildUpdateDocumentSeoCommand({ ogImage: "x" } as never)).toThrow(/lang.*ogSiteName.*ogType.*ogLocale/i);
  });

  it("lancia se changedProps è vuoto", () => {
    expect(() => buildUpdateDocumentSeoCommand({})).toThrow();
  });

  it("B4: nessun campo 'ogUrl' - deriva sempre da 'canonical' (in Page.props), mai un campo scrivibile qui (verifica esplicita, non solo un'assenza silenziosa)", () => {
    expect(() => buildUpdateDocumentSeoCommand({ ogUrl: "https://example.com/" } as never)).toThrow(/non riconosciuta/i);
  });
});

describe("buildUpdateDocumentSeoCommand — scrittura", () => {
  it("costruisce UPDATE_DOCUMENT_PROPS con una sola chiave", () => {
    const command = buildUpdateDocumentSeoCommand({ lang: "it" });
    expect(command).toEqual({ type: "UPDATE_DOCUMENT_PROPS", props: { lang: "it" } });
  });

  it("costruisce UPDATE_DOCUMENT_PROPS con più chiavi nello stesso gesto", () => {
    const command = buildUpdateDocumentSeoCommand({
      lang: "it",
      ogSiteName: "Vicolo Cechov",
      ogType: "website",
      ogLocale: "it_IT",
    });
    expect(command).toEqual({
      type: "UPDATE_DOCUMENT_PROPS",
      props: { lang: "it", ogSiteName: "Vicolo Cechov", ogType: "website", ogLocale: "it_IT" },
    });
  });

  it("non prende 'document' in input (a differenza di buildRegisterFontCommand): scrittura diretta, nessuna lettura dello stato esistente necessaria", () => {
    // Chiamabile senza un Document, a differenza delle funzioni per i font -
    // prova diretta che questo è un mirror di buildUpdatePagePropsCommand
    // (shallow merge), non della semantica ad array di 'fonts'.
    expect(buildUpdateDocumentSeoCommand.length).toBe(1);
  });
});
