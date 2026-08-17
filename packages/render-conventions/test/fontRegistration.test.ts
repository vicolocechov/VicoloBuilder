import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { readRegisteredFonts } from "../src/fontRegistration.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("readRegisteredFonts", () => {
  it("un documento appena creato non ha font registrati", () => {
    expect(readRegisteredFonts(baseDoc())).toEqual([]);
  });

  it("legge i font da document.props.fonts dopo UPDATE_DOCUMENT_PROPS", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "data:font/woff2;base64,AAAA" }] },
    });
    expect(readRegisteredFonts(doc)).toEqual([{ family: "Poppins", weight: "600", src: "data:font/woff2;base64,AAAA" }]);
  });

  it("filtra via voci che non hanno la forma attesa (props è un bag non validato a livello di tipo)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "x" }, { family: "Rotto" }, "non-un-oggetto", 42] },
    });
    expect(readRegisteredFonts(doc)).toEqual([{ family: "Poppins", weight: "600", src: "x" }]);
  });

  it("restituisce un array vuoto se document.props.fonts non è un array", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: "non-un-array" } });
    expect(readRegisteredFonts(doc)).toEqual([]);
  });
});
