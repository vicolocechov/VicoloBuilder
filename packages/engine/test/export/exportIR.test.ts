import { describe, expect, it } from "vitest";
import { createDocument } from "../../src/document/document.js";
import { applyCommand } from "../../src/runtime/commands.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";
import { serializeDocument } from "../../src/document/hash.js";
import { exportIR } from "../../src/export/exportIR.js";
import type { Document } from "../../src/document/types.js";

function buildSampleDocument(): Document {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "hero", nodeType: "box", parentId: "root", props: { variant: "primary" } });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "heading", nodeType: "text", parentId: "hero", props: { content: "hi" } });
  return doc;
}

const CONTEXT = { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 } as const;

describe("exportIR — nessuna logica duplicata rispetto a resolveDocument+computeLayout", () => {
  it("ir.box coincide con computeLayout(resolveDocument(...)) chiamati direttamente", () => {
    const doc = buildSampleDocument();
    const ir = exportIR(doc, CONTEXT);

    const model = resolveDocument(doc, { breakpoint: CONTEXT.breakpoint });
    const expectedBox = computeLayout(model, { pageId: CONTEXT.pageId, viewportWidth: CONTEXT.viewportWidth });

    expect(ir.box).toEqual(expectedBox);
  });

  it("ir.meta riflette esattamente pageId e breakpoint passati nel context", () => {
    const ir = exportIR(buildSampleDocument(), CONTEXT);
    expect(ir.meta).toEqual({ pageId: "page-home", breakpoint: "desktop", pageProps: {}, documentProps: {} });
  });
});

describe("exportIR — purezza/determinismo (byte-per-byte)", () => {
  it("due chiamate consecutive sullo stesso Document producono lo stesso IR", () => {
    const doc = buildSampleDocument();
    expect(exportIR(doc, CONTEXT)).toEqual(exportIR(doc, CONTEXT));
  });

  it("JSON.stringify(ir) è identico su due chiamate consecutive (nessun serializer dedicato necessario)", () => {
    const doc = buildSampleDocument();
    const first = JSON.stringify(exportIR(doc, CONTEXT));
    const second = JSON.stringify(exportIR(doc, CONTEXT));
    expect(first).toBe(second);
  });

  it("props impostate con più UPDATE_PROPS in ordine diverso, stesso stato finale, producono lo stesso IR (indipendenza dall'ordine di costruzione, non dall'ordine di childrenIds - quello è dato semantico, non incidentale)", () => {
    let docA = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { variant: "primary" } });

    let docB = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docB = applyCommand(docB, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { variant: "primary" } });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });

    expect(JSON.stringify(exportIR(docA, CONTEXT))).toBe(JSON.stringify(exportIR(docB, CONTEXT)));
  });

  it("viewportWidth diversi possono produrre IR diversi (sanity check anti falso-positivo)", () => {
    const doc = buildSampleDocument();
    const narrow = exportIR(doc, { ...CONTEXT, viewportWidth: 375 });
    const wide = exportIR(doc, { ...CONTEXT, viewportWidth: 1280 });
    expect(narrow.box.width).not.toBe(wide.box.width);
  });
});

describe('exportIR — non muta l\'input (RFC-000 §12: "Exporter senza side effect")', () => {
  it("exportIR non muta il Document in ingresso", () => {
    const doc = buildSampleDocument();
    const snapshotBefore = serializeDocument(doc);

    exportIR(doc, CONTEXT);

    expect(serializeDocument(doc)).toBe(snapshotBefore);
  });
});

describe("exportIR — pageId (già oggi obbligo strutturale di computeLayout, non nuovo)", () => {
  it("un pageId che non esiste nel Document propaga l'errore già esistente di computeLayout, nessuna duplicazione del controllo", () => {
    const doc = buildSampleDocument();
    expect(() => exportIR(doc, { ...CONTEXT, pageId: "does-not-exist" })).toThrow(/page not found/i);
  });

  it("una seconda pagina dello stesso Document produce un IR radicato sul suo rootNodeId, distinto da quello della prima", () => {
    const doc = buildSampleDocument();
    const root2 = { id: "root2", type: "page-root", parentId: null, childrenIds: [], props: {} };
    const secondPageDoc: Document = {
      ...doc,
      nodes: new Map(doc.nodes).set("root2", root2),
      pages: new Map(doc.pages).set("page-second", { id: "page-second", name: "Second", rootNodeId: "root2" }),
    };

    const irFirst = exportIR(secondPageDoc, { ...CONTEXT, pageId: "page-home" });
    const irSecond = exportIR(secondPageDoc, { ...CONTEXT, pageId: "page-second" });

    expect(irFirst.box.nodeId).toBe("root");
    expect(irSecond.box.nodeId).toBe("root2");
    expect(irSecond.meta.pageId).toBe("page-second");
  });
});

describe("exportIR — Batch 1 Exporter: 'IR.nodes' (nodeId -> resolvedProps)", () => {
  it("IR.nodes contiene esattamente resolvedProps per ciascun nodo, non un DocumentNode sorgente", () => {
    const ir = exportIR(buildSampleDocument(), CONTEXT);

    // "heading" non ha un `variant` - resolvedProps passa attraverso il
    // Resolver invariato, verifica diretta del passthrough.
    expect(ir.nodes.heading).toEqual({ content: "hi" });
    // "hero" ha `variant: "primary"` - il Resolver lo espande nel bundle di
    // stile della variant table (D-009, comportamento preesistente, non di
    // questo batch) - qui verifichiamo solo che NESSUN campo di
    // DocumentNode/ResolvedNode (id/type/parentId/childrenIds) sia presente,
    // indipendentemente da quali chiavi la variant table produca.
    expect(ir.nodes.hero).not.toHaveProperty("type");
    expect(ir.nodes.hero).not.toHaveProperty("parentId");
    expect(ir.nodes.hero).not.toHaveProperty("childrenIds");
    expect(ir.nodes.hero).not.toHaveProperty("id");
  });

  it("un nodo senza props ha un ingresso vuoto in IR.nodes, non un'assenza silenziosa (root, mai props impostati)", () => {
    const ir = exportIR(buildSampleDocument(), CONTEXT);
    expect(ir.nodes.root).toEqual({});
  });

  it("IR.box resta ESATTAMENTE quello prodotto da computeLayout(resolveDocument(...)) - nessuna modifica al contratto geometrico", () => {
    const doc = buildSampleDocument();
    const ir = exportIR(doc, CONTEXT);

    const model = resolveDocument(doc, { breakpoint: CONTEXT.breakpoint });
    const expectedBox = computeLayout(model, { pageId: CONTEXT.pageId, viewportWidth: CONTEXT.viewportWidth });

    expect(ir.box).toEqual(expectedBox);
  });

  it("IR.nodes è limitato ai nodi della pagina esportata - nessun nodo di un'altra pagina", () => {
    let doc = buildSampleDocument();
    const root2 = { id: "root2", type: "page-root", parentId: null, childrenIds: ["other"], props: {} };
    const other = { id: "other", type: "box", parentId: "root2", childrenIds: [], props: { onlyOnSecondPage: true } };
    doc = {
      ...doc,
      nodes: new Map(doc.nodes).set("root2", root2).set("other", other),
      pages: new Map(doc.pages).set("page-second", { id: "page-second", name: "Second", rootNodeId: "root2", props: {} }),
    };

    const irFirst = exportIR(doc, { ...CONTEXT, pageId: "page-home" });
    const irSecond = exportIR(doc, { ...CONTEXT, pageId: "page-second" });

    expect(irFirst.nodes).not.toHaveProperty("root2");
    expect(irFirst.nodes).not.toHaveProperty("other");
    expect(irSecond.nodes).not.toHaveProperty("hero");
    expect(irSecond.nodes).not.toHaveProperty("heading");
    expect(irSecond.nodes.other).toEqual({ onlyOnSecondPage: true });
  });

  it("le chiavi di IR.nodes (i nodeId) sono in ordine deterministico (alfabetico), indipendente dall'ordine di creazione dei nodi", () => {
    let docA = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "zeta", nodeType: "box", parentId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "alfa", nodeType: "box", parentId: "root" });

    const ir = exportIR(docA, CONTEXT);
    expect(Object.keys(ir.nodes)).toEqual(["alfa", "root", "zeta"]);
  });

  it("le chiavi di resolvedProps dentro ciascun nodo sono ordinate alfabeticamente, indipendenti dall'ordine con cui i comandi UPDATE_PROPS sono stati applicati (bug trovato verificando il determinismo, corretto in questo batch)", () => {
    let docA = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });
    docA = applyCommand(docA, { type: "UPDATE_PROPS", nodeId: "a", props: { color: "red" } });

    let docB = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docB = applyCommand(docB, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { color: "red" } });
    docB = applyCommand(docB, { type: "UPDATE_PROPS", nodeId: "a", props: { height: 10 } });

    const irA = exportIR(docA, CONTEXT);
    const irB = exportIR(docB, CONTEXT);

    expect(Object.keys(irA.nodes.a)).toEqual(["color", "height"]);
    expect(Object.keys(irB.nodes.a)).toEqual(["color", "height"]);
    expect(JSON.stringify(irA)).toBe(JSON.stringify(irB));
  });

  it("due chiamate consecutive su Document identici producono IR.nodes byte-per-byte identico", () => {
    const doc = buildSampleDocument();
    expect(JSON.stringify(exportIR(doc, CONTEXT).nodes)).toBe(JSON.stringify(exportIR(doc, CONTEXT).nodes));
  });
});

describe("exportIR — Batch 3 Exporter: 'IR.types' (nodeId -> type, D-039)", () => {
  it("IR.types contiene esattamente il 'type' di ciascun nodo, una stringa, non un DocumentNode/ResolvedNode sorgente", () => {
    let doc = buildSampleDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "titolo", nodeType: "h1", parentId: "root" });

    const ir = exportIR(doc, CONTEXT);

    expect(ir.types.hero).toBe("box");
    expect(ir.types.heading).toBe("text");
    expect(ir.types.titolo).toBe("h1");
    expect(typeof ir.types.hero).toBe("string");
  });

  it("un nodo esiste in IR.types anche se non ha alcun prop (root, mai props impostati) - IR.types non dipende da IR.nodes", () => {
    const ir = exportIR(buildSampleDocument(), CONTEXT);
    expect(ir.types).toHaveProperty("root");
    expect(ir.nodes.root).toEqual({});
  });

  it("IR.box resta ESATTAMENTE quello prodotto da computeLayout(resolveDocument(...)) anche con IR.types presente - nessuna modifica al contratto geometrico", () => {
    const doc = buildSampleDocument();
    const ir = exportIR(doc, CONTEXT);

    const model = resolveDocument(doc, { breakpoint: CONTEXT.breakpoint });
    const expectedBox = computeLayout(model, { pageId: CONTEXT.pageId, viewportWidth: CONTEXT.viewportWidth });

    expect(ir.box).toEqual(expectedBox);
  });

  it("IR.types è limitato ai nodi della pagina esportata - nessun nodo di un'altra pagina", () => {
    let doc = buildSampleDocument();
    const root2 = { id: "root2", type: "page-root", parentId: null, childrenIds: ["other"], props: {} };
    const other = { id: "other", type: "link", parentId: "root2", childrenIds: [], props: {} };
    doc = {
      ...doc,
      nodes: new Map(doc.nodes).set("root2", root2).set("other", other),
      pages: new Map(doc.pages).set("page-second", { id: "page-second", name: "Second", rootNodeId: "root2", props: {} }),
    };

    const irFirst = exportIR(doc, { ...CONTEXT, pageId: "page-home" });
    const irSecond = exportIR(doc, { ...CONTEXT, pageId: "page-second" });

    expect(irFirst.types).not.toHaveProperty("root2");
    expect(irFirst.types).not.toHaveProperty("other");
    expect(irSecond.types).not.toHaveProperty("hero");
    expect(irSecond.types).not.toHaveProperty("heading");
    expect(irSecond.types.other).toBe("link");
  });

  it("le chiavi di IR.types (i nodeId) sono in ordine deterministico (alfabetico), indipendente dall'ordine di creazione dei nodi", () => {
    let docA = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "zeta", nodeType: "box", parentId: "root" });
    docA = applyCommand(docA, { type: "CREATE_NODE", nodeId: "alfa", nodeType: "box", parentId: "root" });

    const ir = exportIR(docA, CONTEXT);
    expect(Object.keys(ir.types)).toEqual(["alfa", "root", "zeta"]);
  });

  it("due chiamate consecutive su Document identici producono IR.types byte-per-byte identico", () => {
    const doc = buildSampleDocument();
    expect(JSON.stringify(exportIR(doc, CONTEXT).types)).toBe(JSON.stringify(exportIR(doc, CONTEXT).types));
  });
});

describe("exportIR — B4 (SEO og:*/lang): 'og:url' deriva sempre da 'canonical', mai un campo separato", () => {
  it("canonical scritto su Page.props arriva in ir.meta.pageProps così com'è", () => {
    let doc = buildSampleDocument();
    doc = applyCommand(doc, { type: "UPDATE_PAGE_PROPS", pageId: "page-home", props: { canonical: "https://www.vicolocechov.it/" } });

    const ir = exportIR(doc, CONTEXT);

    expect(ir.meta.pageProps.canonical).toBe("https://www.vicolocechov.it/");
  });

  it("nessuna chiave 'ogUrl'/'og:url' compare MAI in ir.meta.pageProps, nemmeno dopo aver scritto ogni altro campo SEO per-pagina - la prova diretta che og:url non è un dato persistito, solo derivabile da 'canonical' in output (compito di un futuro Exporter, non di questo Document)", () => {
    let doc = buildSampleDocument();
    doc = applyCommand(doc, {
      type: "UPDATE_PAGE_PROPS",
      pageId: "page-home",
      props: {
        title: "Vicolo Cechov",
        description: "Scuola di teatro",
        canonical: "https://www.vicolocechov.it/",
        ogTitle: "Vicolo Cechov | Scuola di teatro",
        ogDescription: "Corsi e laboratori di teatro",
      },
    });

    const ir = exportIR(doc, CONTEXT);

    expect(ir.meta.pageProps).not.toHaveProperty("ogUrl");
    expect(ir.meta.pageProps).not.toHaveProperty("og:url");
  });

  it("nessuna chiave 'ogUrl'/'og:url' compare MAI in ir.meta.documentProps, nemmeno dopo aver scritto ogni campo SEO a livello documento (lang/og:site_name/og:type/og:locale)", () => {
    let doc = buildSampleDocument();
    doc = applyCommand(doc, {
      type: "UPDATE_DOCUMENT_PROPS",
      props: { lang: "it", ogSiteName: "Vicolo Cechov", ogType: "website", ogLocale: "it_IT" },
    });

    const ir = exportIR(doc, CONTEXT);

    expect(ir.meta.documentProps).not.toHaveProperty("ogUrl");
    expect(ir.meta.documentProps).not.toHaveProperty("og:url");
  });
});
