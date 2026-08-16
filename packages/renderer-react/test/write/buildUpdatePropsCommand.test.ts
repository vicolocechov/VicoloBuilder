import { describe, expect, it } from "vitest";
import { applyCommand, createDocument, resolveNode, getNode } from "@vicolobuilder/engine";
import { buildUpdatePropsCommand } from "../../src/write/buildUpdatePropsCommand.js";

// Fase 5, Blocco D: adattatore di scrittura Desktop-first (Decisione 1) +
// separazione geometria/contenuto (Opzione A per la geometria).
// Fase 6 (D-019): 7 fasce nominate, congelamento generalizzato a
// `widerBreakpoints` (vicini diretti, non più "la fascia successiva").
// Fase S1: terza categoria STYLE_KEYS (columns/gap/fontSize) - stesso
// comportamento di congelamento di GEOMETRY_KEYS, nome proprio.

function baseDoc() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card",
    nodeType: "box",
    parentId: "root",
    props: { x: 10, y: 10, width: 100, height: 50, color: "black" },
  });
  return doc;
}

function gridDoc() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "grid",
    nodeType: "box",
    parentId: "root",
    props: { layoutMode: "griglia", columns: 4, gap: 20 },
  });
  return doc;
}

describe("buildUpdatePropsCommand — chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dai tre elenchi chiusi", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { flexDirection: "row" } as never)).toThrow();
  });

  it("il messaggio d'errore elenca tutte e tre le categorie (geometria, stile, contenuto)", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { flexDirection: "row" } as never)).toThrow(
      /geometria.*stile.*contenuto/i,
    );
  });

  it("lancia se changedProps è vuoto", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", {})).toThrow();
  });
});

describe("buildUpdatePropsCommand — CONTENUTO: sempre sulla base", () => {
  it("scrive 'text' sui props base anche quando la vista attiva è Mobile verticale", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { text: "ciao" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { text: "ciao" } });
  });

  it("scrive 'color' sui props base anche quando la vista attiva è Tablet verticale", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "tablet-verticale", { color: "red" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { color: "red" } });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Desktop scrive direttamente sulla base", () => {
  it("nessun responsive coinvolto quando activeBreakpoint è 'desktop'", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "desktop", { x: 99, width: 200 });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { x: 99, width: 200 } });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Mobile verticale, nessun override preesistente altrove", () => {
  it("scrive sulla fascia mobile-verticale e congela tablet-verticale (unico vicino più largo) al valore risolto pre-modifica", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });

    // "card" non ha override responsive preesistenti: risolto a
    // tablet-verticale prima della modifica = base.x = 10.
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "mobile-verticale": { x: 5 }, "tablet-verticale": { x: 10 } } },
    });
  });

  it("il documento risultante mostra 5 su mobile-verticale, 10 su tablet-verticale, e 10 su desktop/laptop-compatto (isolamento tra diramazioni, non solo 'nessuna propagazione')", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile-verticale" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet-verticale" }).resolvedProps.x).toBe(10);
    // desktop/laptop-compatto non sono nemmeno nella cascata di mobile-verticale
    // (diramazioni di orientamento diverse) - isolati per costruzione, non solo schermati dal congelamento.
    expect(resolveNode(node, { breakpoint: "laptop-compatto" }).resolvedProps.x).toBe(10);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(10);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: vista Mobile orizzontale (l'altra diramazione)", () => {
  it("scrive su mobile-orizzontale e congela tablet-orizzontale (stessa meccanica, diramazione landscape)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-orizzontale", { y: 3 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "mobile-orizzontale": { y: 3 }, "tablet-orizzontale": { y: 10 } } },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: Tablet verticale ha già un override proprio", () => {
  it("il congelamento usa il valore GIÀ RISOLTO su tablet-verticale (con l'override), non il valore di base", () => {
    let doc = baseDoc();
    // tablet-verticale ha già un override esplicito: x=77 (diverso dalla base, 10).
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "tablet-verticale": { x: 77 }, "mobile-verticale": { x: 5 } } },
    });
  });

  it("non tocca laptop-compatto/desktop: già fuori dalla cascata di mobile-verticale, indipendentemente dal congelamento", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "card")!;

    expect(resolveNode(node, { breakpoint: "mobile-verticale" }).resolvedProps.x).toBe(5);
    expect(resolveNode(node, { breakpoint: "tablet-verticale" }).resolvedProps.x).toBe(77);
    expect(resolveNode(node, { breakpoint: "laptop-compatto" }).resolvedProps.x).toBe(10);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.x).toBe(10);
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: modifica su una fascia senza vicini più larghi", () => {
  it(
    "editare tablet-verticale non congela nulla: nessuna fascia più larga la include nella propria cascata " +
      "(cambio di comportamento rispetto a Fase 5, dove ogni fascia aveva sempre una 'successiva' - qui tablet-verticale " +
      "è l'estremità della propria diramazione, non un anello di una catena unica)",
    () => {
      const doc = baseDoc();
      const command = buildUpdatePropsCommand(doc, "card", "tablet-verticale", { y: 20 });

      expect(command).toEqual({
        type: "UPDATE_PROPS",
        nodeId: "card",
        props: { responsive: { "tablet-verticale": { y: 20 } } },
      });
    },
  );

  it("stesso comportamento per laptop-compatto e desktop-compatto (bende indipendenti, mai un vicino più largo)", () => {
    const doc = baseDoc();
    expect(buildUpdatePropsCommand(doc, "card", "laptop-compatto", { y: 20 })).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "laptop-compatto": { y: 20 } } },
    });
    expect(buildUpdatePropsCommand(doc, "card", "desktop-compatto", { y: 20 })).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { responsive: { "desktop-compatto": { y: 20 } } },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA: chiavi miste, congelamento per-chiave indipendente", () => {
  it("se tablet-verticale ha già un override solo per 'x', il congelamento su mobile-verticale tocca tablet-verticale solo per 'y'", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { responsive: { "tablet-verticale": { x: 77 } } } });

    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5, y: 6 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "tablet-verticale": { x: 77, y: 10 }, // x preesistente conservato, y congelato al valore risolto (=base, 10)
          "mobile-verticale": { x: 5, y: 6 },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — GEOMETRIA + CONTENUTO insieme", () => {
  it("divide correttamente le chiavi tra i due gruppi in una singola chiamata", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { x: 5, text: "ciao" });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: { text: "ciao", responsive: { "mobile-verticale": { x: 5 }, "tablet-verticale": { x: 10 } } },
    });
  });
});

describe("buildUpdatePropsCommand — STILE (Fase S1): vista Desktop scrive direttamente sulla base", () => {
  it("nessun responsive coinvolto quando activeBreakpoint è 'desktop'", () => {
    const doc = gridDoc();
    const command = buildUpdatePropsCommand(doc, "grid", "desktop", { columns: 2 });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "grid", props: { columns: 2 } });
  });
});

describe("buildUpdatePropsCommand — STILE (Fase S1): stesso congelamento della geometria, non un meccanismo separato", () => {
  it("scrive su mobile-verticale e congela tablet-verticale (unico vicino più largo) al valore risolto pre-modifica", () => {
    const doc = gridDoc();
    const command = buildUpdatePropsCommand(doc, "grid", "mobile-verticale", { columns: 2 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "grid",
      props: { responsive: { "mobile-verticale": { columns: 2 }, "tablet-verticale": { columns: 4 } } },
    });
  });

  it("il documento risultante mostra 2 su mobile-verticale e 4 (invariato) su tablet-verticale/laptop-compatto/desktop", () => {
    const doc = gridDoc();
    const command = buildUpdatePropsCommand(doc, "grid", "mobile-verticale", { columns: 2 });
    const next = applyCommand(doc, command);
    const node = getNode(next, "grid")!;

    expect(resolveNode(node, { breakpoint: "mobile-verticale" }).resolvedProps.columns).toBe(2);
    expect(resolveNode(node, { breakpoint: "tablet-verticale" }).resolvedProps.columns).toBe(4);
    expect(resolveNode(node, { breakpoint: "laptop-compatto" }).resolvedProps.columns).toBe(4);
    expect(resolveNode(node, { breakpoint: "desktop" }).resolvedProps.columns).toBe(4);
  });

  it("editare laptop-compatto non congela nulla: nessuna fascia più larga lo include nella propria cascata (stesso comportamento già visto per la geometria)", () => {
    const doc = gridDoc();
    const command = buildUpdatePropsCommand(doc, "grid", "laptop-compatto", { columns: 2 });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "grid",
      props: { responsive: { "laptop-compatto": { columns: 2 } } },
    });
  });

  it("STILE ('columns') + GEOMETRIA ('x') insieme finiscono nello STESSO oggetto responsive congelato, non due separati", () => {
    let doc = gridDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "grid", props: { x: 100 } });
    const command = buildUpdatePropsCommand(doc, "grid", "mobile-verticale", { columns: 2, x: 5 });

    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "grid",
      props: {
        responsive: {
          "mobile-verticale": { columns: 2, x: 5 },
          "tablet-verticale": { columns: 4, x: 100 }, // entrambe congelate insieme, unico oggetto responsive
        },
      },
    });
  });

  it("'gap' segue lo stesso trattamento di 'columns' (entrambe in STYLE_KEYS)", () => {
    const doc = gridDoc();
    const command = buildUpdatePropsCommand(doc, "grid", "mobile-verticale", { gap: 8 });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "grid",
      props: { responsive: { "mobile-verticale": { gap: 8 }, "tablet-verticale": { gap: 20 } } },
    });
  });
});

describe("buildUpdatePropsCommand — 'fontSize' accettato come STYLE_KEYS (classificazione D-023 chiusa insieme a questa fase)", () => {
  it("non lancia più 'proprietà non riconosciuta' per fontSize (prima di S1 non era in nessun elenco)", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { fontSize: "clamp(16px, 2vw, 24px)" })).not.toThrow();
  });

  it("congela come qualunque altra chiave di STYLE_KEYS quando editato su una fascia stretta", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { fontSize: "clamp(10px, 1vw, 14px)" } });
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { fontSize: "clamp(20px, 4vw, 30px)" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "mobile-verticale": { fontSize: "clamp(20px, 4vw, 30px)" },
          "tablet-verticale": { fontSize: "clamp(10px, 1vw, 14px)" },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — Fase 15 (Elemento immagine): 'src'/'alt' come CONTENT_KEYS", () => {
  it("scrive 'src' sui props base anche quando la vista attiva è Mobile verticale (nessuna evidenza di sorgente diversa per fascia)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { src: "https://example.com/foto.jpg" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { src: "https://example.com/foto.jpg" } });
  });

  it("scrive 'alt' sui props base allo stesso modo di 'src'", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { alt: "Descrizione" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { alt: "Descrizione" } });
  });
});

describe("buildUpdatePropsCommand — Fase 15 (Elemento immagine): 'objectFit' come STYLE_KEYS", () => {
  it("non lancia 'proprietà non riconosciuta' per objectFit", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { objectFit: "cover" })).not.toThrow();
  });

  it("congela come qualunque altra chiave di STYLE_KEYS quando editato su una fascia stretta", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { objectFit: "contain" } });
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { objectFit: "cover" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "mobile-verticale": { objectFit: "cover" },
          "tablet-verticale": { objectFit: "contain" },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — Fase 16 (Font custom): 'fontFamily'/'fontWeight' come STYLE_KEYS (Punto 3/4)", () => {
  it("non lancia 'proprietà non riconosciuta' per fontFamily/fontWeight", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { fontFamily: "Poppins" })).not.toThrow();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { fontWeight: "600" })).not.toThrow();
  });

  it("congelano entrambe come qualunque altra chiave di STYLE_KEYS quando editate su una fascia stretta", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { fontFamily: "Montserrat", fontWeight: "400" } });
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { fontFamily: "Poppins", fontWeight: "600" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "mobile-verticale": { fontFamily: "Poppins", fontWeight: "600" },
          "tablet-verticale": { fontFamily: "Montserrat", fontWeight: "400" },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — Fase 17 (Transizioni CSS di base): 'transition' come STYLE_KEYS (Punto 2)", () => {
  it("non lancia 'proprietà non riconosciuta' per transition", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { transition: "color .3s ease" })).not.toThrow();
  });

  it("congela come qualunque altra chiave di STYLE_KEYS quando editata su una fascia stretta", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "card", props: { transition: "color .2s" } });
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { transition: "color .5s ease-out" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "card",
      props: {
        responsive: {
          "mobile-verticale": { transition: "color .5s ease-out" },
          "tablet-verticale": { transition: "color .2s" },
        },
      },
    });
  });
});

describe("buildUpdatePropsCommand — B1 (href modificabile): 'href' come CONTENT_KEYS", () => {
  it("non lancia 'proprietà non riconosciuta' per href", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { href: "https://example.com" })).not.toThrow();
  });

  it("scrive 'href' sui props base anche quando la vista attiva è Mobile verticale (nessuna evidenza di destinazione diversa per fascia)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "mobile-verticale", { href: "#chi-siamo" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { href: "#chi-siamo" } });
  });

  it("nessuna validazione di schema (Opzione A, approvata): accetta qualunque stringa, incluso uno schema eseguibile", () => {
    const doc = baseDoc();
    expect(() => buildUpdatePropsCommand(doc, "card", "desktop", { href: "javascript:alert(1)" })).not.toThrow();
  });

  it("stringa vuota accettata (link senza destinazione, comportamento invariato dalla creazione)", () => {
    const doc = baseDoc();
    const command = buildUpdatePropsCommand(doc, "card", "desktop", { href: "" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "card", props: { href: "" } });
  });
});
