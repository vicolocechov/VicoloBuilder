import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { buildRegisterFontCommand, buildUnregisterFontCommand } from "../../src/write/buildUpdateDocumentPropsCommand.js";

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
