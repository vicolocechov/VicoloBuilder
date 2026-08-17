import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { exportSite } from "../src/site.js";

const PAGE_ID = "page-home";

function baseDoc(): Document {
  return createDocument({ rootPageId: PAGE_ID, rootNodeId: "root" });
}

describe("exportSite — struttura del documento", () => {
  it("produce un unico documento HTML completo: doctype, html, head, body", () => {
    const html = exportSite(baseDoc(), PAGE_ID);
    expect(html.startsWith("<!doctype html><html")).toBe(true);
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body></html>");
  });

  it("include il reset html,body{margin:0;padding:0;} (necessario per la parità geometrica con Preview, Batch 4)", () => {
    const html = exportSite(baseDoc(), PAGE_ID);
    expect(html).toContain("html,body{margin:0;padding:0;}");
  });

  it("include <meta charset> e <meta name=\"viewport\"> (requisiti di base, D-048)", () => {
    const html = exportSite(baseDoc(), PAGE_ID);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("zero <script> nel documento (invariante 'zero JavaScript' di tutto l'Exporter)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "n", props: { hover: { color: "red" } } });
    const html = exportSite(doc, PAGE_ID);
    expect(html).not.toContain("<script");
  });
});

describe("exportSite — html lang", () => {
  it("nessun lang impostato: <html> senza attributo lang", () => {
    const html = exportSite(baseDoc(), PAGE_ID);
    expect(html).toMatch(/^<!doctype html><html><head>/);
  });

  it("lang impostato: <html lang=\"...\">", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { lang: "it" } });
    const html = exportSite(doc, PAGE_ID);
    expect(html).toMatch(/^<!doctype html><html lang="it"><head>/);
  });
});

describe("exportSite — compone tutti i batch precedenti", () => {
  it("contiene il markup del nodo (Batch 3)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "paragraph", parentId: "root", props: { text: "Ciao" } });
    expect(exportSite(doc, PAGE_ID)).toContain('data-node-id="n"');
  });

  it("contiene la geometria per fascia (Batch 4) - tutti e 7 i blocchi @media", () => {
    const html = exportSite(baseDoc(), PAGE_ID);
    expect(html.match(/@media/g)).toHaveLength(7);
  });

  it("contiene le proprietà STYLE_KEYS/sfondo base (Batch 5/7)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "h1", parentId: "root", props: { color: "#dbeafe", fontSize: "clamp(16px,2vw,24px)" } });
    const html = exportSite(doc, PAGE_ID);
    expect(html).toContain("background:#dbeafe;");
    expect(html).toContain("font-size:clamp(16px,2vw,24px);");
  });

  it("contiene i font registrati (Batch 6)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: [{ family: "Poppins", weight: "600", src: "a.woff2" }] } });
    expect(exportSite(doc, PAGE_ID)).toContain('@font-face{font-family:"Poppins"');
  });

  it("contiene le regole hover (Batch 7)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root", props: { hover: { color: "red" } } });
    expect(exportSite(doc, PAGE_ID)).toContain('[data-node-id="n"]:hover{color:red !important;}');
  });

  it("contiene i tag SEO/head (Batch 8), incluso og:url derivato da canonical", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { title: "Titolo", canonical: "https://a.example" } });
    const html = exportSite(doc, PAGE_ID);
    expect(html).toContain("<title>Titolo</title>");
    expect(html).toContain('<meta property="og:url" content="https://a.example">');
  });
});

describe("exportSite — il markup non dipende dalla fascia scelta per generarlo (CONTENT_KEYS non cascano)", () => {
  it("un nodo senza override responsive produce lo stesso testo indipendentemente dalla fascia", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "paragraph", parentId: "root", props: { text: "Sempre uguale" } });
    const html = exportSite(doc, PAGE_ID);
    expect(html).toContain(">Sempre uguale</p>");
    // Una sola occorrenza del testo nel <body> - il markup non è ripetuto per fascia.
    const bodyMarkup = html.slice(html.indexOf("<body>"), html.indexOf("</body>"));
    expect(bodyMarkup.match(/Sempre uguale/g)).toHaveLength(1);
  });
});

describe("exportSite — determinismo end-to-end", () => {
  it("due chiamate consecutive su un documento con ogni categoria di dato producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { title: "T", description: "D", canonical: "https://a.example" } });
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { lang: "it", fonts: [{ family: "Poppins", weight: "600", src: "a.woff2" }] } });
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "link",
      parentId: "root",
      props: { text: "Vai", href: "#", color: "#111", fontSize: "16px", hover: { color: "red", transform: "scale(1.1)" } },
    });
    expect(exportSite(doc, PAGE_ID)).toBe(exportSite(doc, PAGE_ID));
  });
});
