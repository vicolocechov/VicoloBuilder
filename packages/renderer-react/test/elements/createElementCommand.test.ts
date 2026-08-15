import { describe, expect, it } from "vitest";
import { applyCommand, computeLayout, createDocument, resolveDocument } from "@vicolobuilder/engine";
import {
  buildCreateElementCommand,
  elementIdBase,
  resolveNewElementParent,
} from "../../src/elements/createElementCommand.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("elementIdBase", () => {
  it("restituisce una base leggibile per ciascun tipo", () => {
    expect(elementIdBase("text")).toBe("testo");
    expect(elementIdBase("container")).toBe("contenitore");
    expect(elementIdBase("scene")).toBe("scena");
    expect(elementIdBase("griglia")).toBe("griglia");
    expect(elementIdBase("h1")).toBe("h1");
    expect(elementIdBase("h2")).toBe("h2");
    expect(elementIdBase("h3")).toBe("h3");
    expect(elementIdBase("paragraph")).toBe("paragrafo");
    expect(elementIdBase("link")).toBe("link");
    expect(elementIdBase("image")).toBe("immagine");
  });
});

describe("buildCreateElementCommand", () => {
  it("costruisce un CREATE_NODE 'text' con i default approvati, incluso 'fontSize' (Fase 10 - stringa clamp() letterale)", () => {
    const command = buildCreateElementCommand("text", "testo-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "testo-1",
      nodeType: "text",
      parentId: "root",
      props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" },
    });
  });

  it("costruisce un CREATE_NODE 'container' in modalità libero con i default approvati", () => {
    const command = buildCreateElementCommand("container", "contenitore-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "contenitore-1",
      nodeType: "box",
      parentId: "root",
      props: { x: 20, y: 20, width: 200, height: 120, layoutMode: "libero" },
    });
  });

  it("costruisce un CREATE_NODE 'scene' con x/y/width/height espliciti (Fase 7: serve anche se il genitore è in modalità 'libero', vedi createElementCommand.ts)", () => {
    const command = buildCreateElementCommand("scene", "scena-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "scena-1",
      nodeType: "scene",
      parentId: "root",
      props: { x: 0, y: 0, width: 800, height: 400 },
    });
  });

  it("una 'scene' non manda in crash computeLayout sotto una radice pagina in modalità 'libero' (regressione: bug trovato verificando in browser)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, buildCreateElementCommand("scene", "scena-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  it("una 'scene' non manda in crash computeLayout sotto una radice pagina in modalità 'pila' (default)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildCreateElementCommand("scene", "scena-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  it("costruisce un CREATE_NODE 'griglia' (box + layoutMode:'griglia') con i default approvati, nessun figlio pre-creato", () => {
    const command = buildCreateElementCommand("griglia", "griglia-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "griglia-1",
      nodeType: "box",
      parentId: "root",
      props: { x: 20, y: 20, width: 600, height: 200, layoutMode: "griglia", columns: 3, gap: 16 },
    });
  });

  it("una 'griglia' appena creata (vuota) non manda in crash computeLayout sotto una radice 'libero' (stessa regressione già coperta per 'scene')", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, buildCreateElementCommand("griglia", "griglia-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  it("una 'griglia' appena creata (vuota) non manda in crash computeLayout sotto una radice 'pila' (default)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildCreateElementCommand("griglia", "griglia-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  // Fase 9: h1/h2/h3/paragraph riusano ESATTAMENTE x/y/width/height/text/
  // fontSize di "text" (nessun valore nuovo inventato, correzione esplicita
  // del proprietario del prodotto - vedi createElementCommand.ts) - solo
  // `nodeType` cambia, mappato a un tag HTML diverso nel Renderer.
  it.each([
    ["h1", "h1"],
    ["h2", "h2"],
    ["h3", "h3"],
    ["paragraph", "paragraph"],
  ] as const)("costruisce un CREATE_NODE '%s' con esattamente i default di 'text' (solo nodeType cambia)", (elementType, nodeType) => {
    const command = buildCreateElementCommand(elementType, `${elementType}-1`, "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: `${elementType}-1`,
      nodeType,
      parentId: "root",
      props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" },
    });
  });

  it("costruisce un CREATE_NODE 'link' con gli stessi default di 'text' più 'href' (deciso esplicitamente: stringa vuota, nessun precedente lo determinava)", () => {
    const command = buildCreateElementCommand("link", "link-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "link-1",
      nodeType: "link",
      parentId: "root",
      props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", href: "", fontSize: "clamp(16px, 2vw, 24px)" },
    });
  });

  it.each(["h1", "h2", "h3", "paragraph", "link"] as const)(
    "un '%s' appena creato non manda in crash computeLayout sotto una radice 'libero' (stessa regressione già coperta per 'scene'/'griglia')",
    (elementType) => {
      let doc = baseDoc();
      doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
      doc = applyCommand(doc, buildCreateElementCommand(elementType, `${elementType}-1`, "root"));
      const model = resolveDocument(doc, { breakpoint: "desktop" });
      expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
    },
  );

  it.each(["h1", "h2", "h3", "paragraph", "link"] as const)(
    "un '%s' appena creato non manda in crash computeLayout sotto una radice 'pila' (default)",
    (elementType) => {
      let doc = baseDoc();
      doc = applyCommand(doc, buildCreateElementCommand(elementType, `${elementType}-1`, "root"));
      const model = resolveDocument(doc, { breakpoint: "desktop" });
      expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
    },
  );

  // Fase 15: 'image' porta x/y/width/height come gli altri elementi, più
  // src (placeholder inline, Punto 2 - nessuna stringa vuota), alt
  // (Punto 3, vuoto), objectFit (Punto 4, "cover").
  it("costruisce un CREATE_NODE 'image' con un placeholder inline come 'src' (Punto 2 - non una stringa vuota) e 'alt'/'objectFit' di default", () => {
    const command = buildCreateElementCommand("image", "immagine-1", "root");
    expect(command.type).toBe("CREATE_NODE");
    expect(command.nodeId).toBe("immagine-1");
    expect(command.nodeType).toBe("image");
    expect(command.parentId).toBe("root");
    expect(command.props).toMatchObject({ x: 20, y: 20, width: 200, height: 120, alt: "", objectFit: "cover" });
    expect(typeof command.props.src).toBe("string");
    expect(command.props.src).not.toBe("");
  });

  it("un 'image' appena creata non manda in crash computeLayout sotto una radice 'libero' (stessa regressione già coperta per gli altri tipi)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, buildCreateElementCommand("image", "immagine-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });

  it("un 'image' appena creata non manda in crash computeLayout sotto una radice 'pila' (default)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildCreateElementCommand("image", "immagine-1", "root"));
    const model = resolveDocument(doc, { breakpoint: "desktop" });
    expect(() => computeLayout(model, { viewportWidth: 1280 })).not.toThrow();
  });
});

describe("resolveNewElementParent", () => {
  it("nessuna selezione -> radice della pagina attiva", () => {
    const doc = baseDoc();
    expect(resolveNewElementParent(doc, "root", null, "desktop")).toBe("root");
  });

  it("selezione pendente (nodo inesistente) -> radice della pagina attiva", () => {
    const doc = baseDoc();
    expect(resolveNewElementParent(doc, "root", "non-esiste", "desktop")).toBe("root");
  });

  it("contenitore selezionato in modalità libera -> dentro il contenitore", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "libero", width: 400, height: 300 },
    });
    expect(resolveNewElementParent(doc, "root", "canvas", "desktop")).toBe("canvas");
  });

  it("contenitore selezionato a pila -> radice della pagina, NON forzato dentro il contenitore a pila", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "stack", nodeType: "box", parentId: "root" });
    expect(resolveNewElementParent(doc, "root", "stack", "desktop")).toBe("root");
  });

  it("un nodo selezionato senza layoutMode 'libero' (qui una foglia) -> radice della pagina attiva", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "card",
      nodeType: "text",
      parentId: "root",
      props: { x: 0, y: 0, width: 100 },
    });
    expect(resolveNewElementParent(doc, "root", "card", "desktop")).toBe("root");
  });

  it("rispetta un override responsive di layoutMode alla fascia attiva (risolto, non solo il prop base)", () => {
    let doc = baseDoc();
    // props base: nessun layoutMode (equivale a "pila"). Override esplicito
    // SOLO sulla fascia desktop (la più larga: non si propaga a
    // mobile-verticale - diramazioni di orientamento diverse, vedi
    // DECISIONS.md D-019 - a differenza di un override lasciato su una
    // fascia stretta della STESSA diramazione).
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { responsive: { desktop: { layoutMode: "libero" } } },
    });
    expect(resolveNewElementParent(doc, "root", "canvas", "mobile-verticale")).toBe("root");
    expect(resolveNewElementParent(doc, "root", "canvas", "desktop")).toBe("canvas");
  });
});
