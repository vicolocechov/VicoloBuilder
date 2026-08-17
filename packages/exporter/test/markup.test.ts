import { describe, expect, it } from "vitest";
import { applyCommand, createDocument, exportIR } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { DuplicateAnchorIdError, renderMarkup } from "../src/markup.js";

const CONTEXT = { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 } as const;

function irFor(doc: Document) {
  return exportIR(doc, CONTEXT);
}

function baseDoc(): Document {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("renderMarkup — mapping tag corretto (htmlTagFor)", () => {
  it.each([
    ["h1", "h1"],
    ["h2", "h2"],
    ["h3", "h3"],
    ["paragraph", "p"],
    ["link", "a"],
    ["image", "img"],
    ["box", "div"],
    ["text", "div"],
    ["scene", "div"],
  ])("nodeType '%s' produce il tag '%s'", (nodeType, expectedTag) => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType, parentId: "root" });
    const markup = renderMarkup(irFor(doc));
    if (expectedTag === "img") {
      expect(markup).toContain(`<img data-node-id="n" alt=""`);
    } else {
      expect(markup).toContain(`<${expectedTag} data-node-id="n">`);
    }
  });
});

describe("renderMarkup — contenuto testuale", () => {
  it("renderizza 'text' come contenuto del tag", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "paragraph", parentId: "root", props: { text: "Ciao" } });
    expect(renderMarkup(irFor(doc))).toContain(">Ciao</p>");
  });

  it("un nodo senza 'text' produce un tag con contenuto vuoto, non 'undefined'/'null' come testo", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "paragraph", parentId: "root" });
    expect(renderMarkup(irFor(doc))).toContain("<p data-node-id=\"n\"></p>");
  });

  it("escapa un tentativo di iniettare un tag dentro 'text'", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "paragraph",
      parentId: "root",
      props: { text: "<script>alert(1)</script>" },
    });
    const markup = renderMarkup(irFor(doc));
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("renderMarkup — src/alt (immagine)", () => {
  it("renderizza src/alt come attributi, escapati", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "image",
      parentId: "root",
      props: { src: "https://example.com/foto.jpg", alt: 'Una "foto"' },
    });
    const markup = renderMarkup(irFor(doc));
    expect(markup).toContain('src="https://example.com/foto.jpg"');
    expect(markup).toContain('alt="Una &quot;foto&quot;"');
  });

  it("img è un tag void - nessun tag di chiusura", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "image", parentId: "root", props: { src: "x.jpg" } });
    const markup = renderMarkup(irFor(doc));
    expect(markup).not.toContain("</img>");
    expect(markup).toMatch(/<img[^>]*>$/);
  });
});

describe("renderMarkup — href, whitelist B (analisi Exporter §3.5)", () => {
  it.each(["", "#chi-siamo", "https://example.com", "http://example.com", "mailto:info@example.com", "tel:+391234567", "pagina.html", "/percorso", "corsi/adulti"])(
    "'%s' è ammesso: produce l'attributo href",
    (href) => {
      let doc = baseDoc();
      doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root", props: { text: "Vai", href } });
      const markup = renderMarkup(irFor(doc));
      if (href === "") {
        expect(markup).not.toContain("href=");
      } else {
        expect(markup).toContain(`href="${href}"`);
      }
    },
  );

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "JavaScript:alert(1)"])(
    "'%s' NON è ammesso: nessun attributo href, il testo resta visibile (degradazione, non blocco)",
    (href) => {
      let doc = baseDoc();
      doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "link", parentId: "root", props: { text: "Vai", href } });
      const markup = renderMarkup(irFor(doc));
      expect(markup).not.toContain("href=");
      expect(markup).toContain(">Vai</a>");
    },
  );

  it("href non è mai emesso su un tag diverso da 'a' (es. un href accidentale su un altro nodo)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "paragraph", parentId: "root", props: { href: "https://example.com" } });
    expect(renderMarkup(irFor(doc))).not.toContain("href=");
  });
});

describe("renderMarkup — anchorId -> id, univocità (analisi Exporter §3.6, Opzione C)", () => {
  it("un anchorId non vuoto produce l'attributo id, escapato", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root", props: { anchorId: "chi-siamo" } });
    expect(renderMarkup(irFor(doc))).toContain('id="chi-siamo"');
  });

  it("nessun anchorId (assente o stringa vuota) - nessun attributo id (escluso 'data-node-id', che è sempre presente)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "senza", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "vuoto", nodeType: "text", parentId: "root", props: { anchorId: "" } });
    const markup = renderMarkup(irFor(doc));
    expect(markup).not.toMatch(/[^-]id="/);
  });

  it("due nodi con lo stesso anchorId fanno fallire l'INTERO export con DuplicateAnchorIdError", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root", props: { anchorId: "sezione" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root", props: { anchorId: "sezione" } });
    expect(() => renderMarkup(irFor(doc))).toThrow(DuplicateAnchorIdError);
  });

  it("l'errore di duplicato elenca ENTRAMBI i nodeId in conflitto, non solo il primo trovato", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root", props: { anchorId: "sezione" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root", props: { anchorId: "sezione" } });
    try {
      renderMarkup(irFor(doc));
      expect.fail("doveva lanciare");
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateAnchorIdError);
      expect((e as Error).message).toContain("a");
      expect((e as Error).message).toContain("b");
      expect((e as Error).message).toContain("sezione");
    }
  });

  it("con più conflitti distinti, l'errore li elenca tutti", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a1", nodeType: "text", parentId: "root", props: { anchorId: "uno" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a2", nodeType: "text", parentId: "root", props: { anchorId: "uno" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b1", nodeType: "text", parentId: "root", props: { anchorId: "due" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b2", nodeType: "text", parentId: "root", props: { anchorId: "due" } });
    try {
      renderMarkup(irFor(doc));
      expect.fail("doveva lanciare");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("uno");
      expect(message).toContain("due");
    }
  });

  it("nessun markup viene generato quando ci sono duplicati (fallimento prima di qualunque output parziale)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "h1", parentId: "root", props: { text: "MAI VISIBILE", anchorId: "x" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "h1", parentId: "root", props: { anchorId: "x" } });
    expect(() => renderMarkup(irFor(doc))).toThrow(/MAI VISIBILE|Ancore duplicate/);
  });

  it("tre nodi con anchorId TUTTI diversi non lanciano nulla", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root", props: { anchorId: "uno" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root", props: { anchorId: "due" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "root", props: { anchorId: "tre" } });
    expect(() => renderMarkup(irFor(doc))).not.toThrow();
  });
});

describe("renderMarkup — struttura piatta (D1, coerente con Canvas/Preview)", () => {
  it("ogni nodo (inclusa la radice) produce un tag SIBLING, non annidato - un figlio non appare come contenuto testuale del genitore", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "figlio", nodeType: "paragraph", parentId: "root", props: { text: "Sono figlio" } });
    const markup = renderMarkup(irFor(doc));

    // La radice ("root", tipo "page-root" -> div) e il figlio sono due tag
    // separati, entrambi presenti come elementi di primo livello nella
    // stringa concatenata - non "figlio" dentro il testo di "root".
    expect(markup).toMatch(/^<div data-node-id="root"><\/div>/);
    expect(markup).toContain('<p data-node-id="figlio">Sono figlio</p>');
  });

  it("data-node-id è presente su ogni nodo, incluso quando il tipo non ha un tag dedicato", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "contenitore-1", nodeType: "box", parentId: "root" });
    const markup = renderMarkup(irFor(doc));
    expect(markup).toContain('data-node-id="contenitore-1"');
    expect(markup).toContain('data-node-id="root"');
  });
});

describe("renderMarkup — escaping end-to-end (nessun tag rotto da un valore malevolo)", () => {
  it("un anchorId con un doppio apice non rompe l'attributo id - il valore resta innocuo, chiuso in un unico attributo escapato", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root", props: { anchorId: 'x" onclick="alert(1)' } });
    const markup = renderMarkup(irFor(doc));
    expect(markup).toContain('id="x&quot; onclick=&quot;alert(1)"');
  });

  it("un href ammesso ma con un doppio apice non rompe l'attributo (escaping applicato dopo il controllo di whitelist)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "link",
      parentId: "root",
      props: { text: "Vai", href: '/percorso"><script>alert(1)</script>' },
    });
    const markup = renderMarkup(irFor(doc));
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("renderMarkup — determinismo", () => {
  it("due chiamate consecutive sullo stesso IR producono lo stesso markup", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "h1", parentId: "root", props: { text: "Titolo" } });
    const ir = irFor(doc);
    expect(renderMarkup(ir)).toBe(renderMarkup(ir));
  });
});
