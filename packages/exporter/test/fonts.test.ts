import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { renderFontFaces } from "../src/fonts.js";
import { escapeCssText } from "../src/escape.js";

function baseDoc(): Document {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("renderFontFaces — nessun font registrato", () => {
  it("un documento appena creato produce una stringa vuota", () => {
    expect(renderFontFaces(baseDoc())).toBe("");
  });
});

describe("renderFontFaces — un font registrato", () => {
  it("produce esattamente un blocco @font-face con family/weight/src", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "https://example.com/poppins.woff2" }] },
    });
    const css = renderFontFaces(doc);
    expect(css).toBe('@font-face{font-family:"Poppins";font-weight:600;src:url("https://example.com/poppins.woff2");}');
  });

  it("più font registrati producono un blocco @font-face ciascuno, nello stesso ordine dell'array", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: {
        fonts: [
          { family: "Poppins", weight: "500", src: "a.woff2" },
          { family: "Poppins", weight: "600", src: "b.woff2" },
          { family: "Oswald", weight: "400", src: "c.woff2" },
        ],
      },
    });
    const css = renderFontFaces(doc);
    const indexA = css.indexOf('font-family:"Poppins";font-weight:500;src:url("a.woff2")');
    const indexB = css.indexOf('font-family:"Poppins";font-weight:600;src:url("b.woff2")');
    const indexC = css.indexOf('font-family:"Oswald";font-weight:400;src:url("c.woff2")');
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThan(indexA);
    expect(indexC).toBeGreaterThan(indexB);
  });

  it("un font MAI usato da alcun nodo (es. 'Oswald' nel sito reale, D-029) viene comunque dichiarato - stesso comportamento della registrazione nell'editor", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "MaiUsato", weight: "400", src: "x.woff2" }] },
    });
    expect(renderFontFaces(doc)).toContain('font-family:"MaiUsato"');
  });

  it("voci malformate in document.props.fonts (bag non validato) vengono scartate, stesso trattamento di readRegisteredFonts", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Valido", weight: "400", src: "x.woff2" }, { family: "Rotto" }, "non-un-oggetto", 42] },
    });
    const css = renderFontFaces(doc);
    expect(css).toContain('font-family:"Valido"');
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });
});

describe("renderFontFaces — escaping avversario (family/weight/src sono campi di testo liberi, D-029)", () => {
  it("una 'family' che tenta di chiudere la dichiarazione e iniettare una nuova regola viene neutralizzata", () => {
    const malicious = 'Arial";}body{display:none;}[x="';
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: malicious, weight: "400", src: "x.woff2" }] },
    });
    const css = renderFontFaces(doc);
    expect(css).not.toContain(`font-family:"${malicious}"`);
    expect(css).toContain(`font-family:"${escapeCssText(malicious)}"`);
    // Nessuna regola "body{display:none}" iniettata fuori dal blocco @font-face.
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });

  it("uno 'src' con caratteri avversari resta dentro url(\"...\"), non spezza la regola", () => {
    const malicious = 'x.woff2");}body{display:none}[y="';
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "400", src: malicious }] },
    });
    const css = renderFontFaces(doc);
    expect(css).not.toContain(`url("${malicious}")`);
    expect(css).toContain(`url("${escapeCssText(malicious)}")`);
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });

  it("un 'weight' con caratteri avversari (mai tra apici) viene comunque escapato", () => {
    const malicious = "400;}body{display:none}";
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: malicious, src: "x.woff2" }] },
    });
    const css = renderFontFaces(doc);
    expect(css).not.toContain(`font-weight:${malicious};`);
    expect(css).toContain(`font-weight:${escapeCssText(malicious)};`);
  });
});

describe("renderFontFaces — determinismo", () => {
  it("due chiamate consecutive producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { fonts: [{ family: "Poppins", weight: "600", src: "a.woff2" }] },
    });
    expect(renderFontFaces(doc)).toBe(renderFontFaces(doc));
  });
});
