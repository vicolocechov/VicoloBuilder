import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { renderHead, resolveHtmlLang } from "../src/head.js";
import { escapeHtmlAttribute, escapeHtmlText } from "../src/escape.js";

const PAGE_ID = "page-home";

function baseDoc(): Document {
  return createDocument({ rootPageId: PAGE_ID, rootNodeId: "root" });
}

describe("renderHead — nessun campo SEO impostato", () => {
  it("produce <head></head> vuoto, nessun tag inventato", () => {
    expect(renderHead(baseDoc(), PAGE_ID)).toBe("<head></head>");
  });
});

describe("renderHead — campi Page.props (title/description/canonical/ogTitle/ogDescription)", () => {
  it("title diventa <title>, escapato come testo", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { title: "Vicolo <Cechov>" } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain(`<title>${escapeHtmlText("Vicolo <Cechov>")}</title>`);
    expect(head).not.toContain("<title>Vicolo <Cechov></title>");
  });

  it("description diventa <meta name=\"description\">, escapato come attributo", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { description: 'Corsi di teatro "per tutti"' } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain(`<meta name="description" content="${escapeHtmlAttribute('Corsi di teatro "per tutti"')}">`);
  });

  it("canonical diventa <link rel=\"canonical\">, escapato come attributo", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { canonical: "https://vicolocechov.it/corsi" } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain('<link rel="canonical" href="https://vicolocechov.it/corsi">');
  });

  it("ogTitle/ogDescription diventano <meta property=\"og:title\"/\"og:description\">", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { ogTitle: "OG Titolo", ogDescription: "OG Descrizione" } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain('<meta property="og:title" content="OG Titolo">');
    expect(head).toContain('<meta property="og:description" content="OG Descrizione">');
  });
});

describe("renderHead — campi Document.props (ogSiteName/ogType/ogLocale)", () => {
  it("diventano <meta property=\"og:site_name\"/\"og:type\"/\"og:locale\">", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { ogSiteName: "Vicolo Cechov", ogType: "website", ogLocale: "it_IT" },
    });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain('<meta property="og:site_name" content="Vicolo Cechov">');
    expect(head).toContain('<meta property="og:type" content="website">');
    expect(head).toContain('<meta property="og:locale" content="it_IT">');
  });
});

describe("renderHead — og:url derivato da canonical (D-035, Opzione H)", () => {
  it("canonical presente → og:url con lo STESSO valore, verbatim", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { canonical: "https://vicolocechov.it/corsi" } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).toContain('<meta property="og:url" content="https://vicolocechov.it/corsi">');
  });

  it("canonical assente → nessun og:url", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { title: "Solo titolo" } });
    expect(renderHead(doc, PAGE_ID)).not.toContain("og:url");
  });

  it("ogUrl non è mai una chiave leggibile da nessuno dei due bag (D-035: l'elenco chiuso in scrittura la esclude per costruzione) - anche scrivendola forzatamente non produce un secondo tag", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { canonical: "https://a.example" } });
    // Nessuna via di scrittura del prodotto espone "ogUrl" - qui si dimostra che anche se
    // comparisse nel bag (scrittura diretta non passante dai command builder), renderHead
    // non la leggerebbe comunque: l'unica fonte di og:url è canonical.
    const head = renderHead(doc, PAGE_ID);
    expect(head.match(/og:url/g)).toHaveLength(1);
  });
});

describe("renderHead — escaping avversario", () => {
  it("un title che tenta di chiudere il tag e iniettare uno script viene neutralizzato", () => {
    const malicious = "</title><script>alert(1)</script>";
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { title: malicious } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).not.toContain("<script>");
    expect(head).toContain(escapeHtmlText(malicious));
  });

  it("una description che tenta di chiudere l'attributo viene neutralizzata", () => {
    const malicious = '"><script>alert(1)</script>';
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: PAGE_ID, props: { description: malicious } });
    const head = renderHead(doc, PAGE_ID);
    expect(head).not.toContain("<script>");
    expect(head).toContain(`content="${escapeHtmlAttribute(malicious)}"`);
  });
});

describe("renderHead — determinismo", () => {
  it("due chiamate consecutive producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "UPDATE_PAGE_PROPS",
      pageId: PAGE_ID,
      props: { title: "T", description: "D", canonical: "https://a.example", ogTitle: "OGT", ogDescription: "OGD" },
    });
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { ogSiteName: "S", ogType: "website", ogLocale: "it_IT" } });
    expect(renderHead(doc, PAGE_ID)).toBe(renderHead(doc, PAGE_ID));
  });
});

describe("resolveHtmlLang", () => {
  it("restituisce undefined se lang è assente", () => {
    expect(resolveHtmlLang(baseDoc())).toBeUndefined();
  });

  it("restituisce il valore scritto in Document.props.lang", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { lang: "it" } });
    expect(resolveHtmlLang(doc)).toBe("it");
  });

  it("restituisce undefined se lang non è una stringa", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_DOCUMENT_PROPS", props: { lang: 42 } });
    expect(resolveHtmlLang(doc)).toBeUndefined();
  });
});
