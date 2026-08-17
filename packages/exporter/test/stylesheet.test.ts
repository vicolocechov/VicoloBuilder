import { describe, expect, it } from "vitest";
import { applyCommand, createDocument, getBreakpoint, listBreakpointNames } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { PREVIEW_SIZE } from "@vicolobuilder/render-conventions";
import { escapeCssText } from "../src/escape.js";
import { renderGeometryStylesheet } from "../src/stylesheet.js";

const PAGE_ID = "page-home";

function baseDoc(): Document {
  return createDocument({ rootPageId: PAGE_ID, rootNodeId: "root" });
}

function expectedMediaCondition(name: string): string {
  const bp = getBreakpoint(name);
  const features: string[] = [];
  if (bp.minWidth !== undefined) features.push(`(min-width: ${bp.minWidth}px)`);
  if (bp.maxWidth !== undefined) features.push(`(max-width: ${bp.maxWidth}px)`);
  if (bp.orientation !== undefined) features.push(`(orientation: ${bp.orientation})`);
  if (bp.minHeight !== undefined) features.push(`(min-height: ${bp.minHeight}px)`);
  if (bp.maxHeight !== undefined) features.push(`(max-height: ${bp.maxHeight}px)`);
  return features.join(" and ");
}

// Ordine di emissione (D-044): priorità di prodotto esplicita, dalla PIÙ
// BASSA (emessa per prima) alla PIÙ ALTA (emessa per ultima, quindi
// vincente per cascata CSS nella zona di overlap) - stesso ordine di
// `EMISSION_ORDER` in `src/stylesheet.ts`, duplicato qui deliberatamente
// (non importato) perché il TEST deve fissare in modo indipendente il
// comportamento atteso, non limitarsi a rispecchiare l'implementazione.
const EXPECTED_EMISSION_ORDER = [
  "desktop",
  "laptop-compatto",
  "desktop-compatto",
  "mobile-verticale",
  "tablet-verticale",
  "tablet-orizzontale",
  "mobile-orizzontale",
];

describe("renderGeometryStylesheet — 7 blocchi @media, uno per fascia (D-019)", () => {
  it("genera esattamente 7 blocchi @media, nell'ordine di priorità dichiarato (D-044, dal più generico al più specifico)", () => {
    const css = renderGeometryStylesheet(baseDoc(), PAGE_ID);
    expect(EXPECTED_EMISSION_ORDER).toHaveLength(7);
    expect([...EXPECTED_EMISSION_ORDER].sort()).toEqual([...listBreakpointNames()].sort());

    let cursor = -1;
    for (const name of EXPECTED_EMISSION_ORDER) {
      const marker = `@media ${expectedMediaCondition(name)}{`;
      const index = css.indexOf(marker);
      expect(index).toBeGreaterThan(cursor); // ogni fascia compare, in ordine, dopo la precedente
      cursor = index;
    }
  });

  it("ogni condizione @media usa esattamente il predicato reale di getBreakpoint, mai soglie reinventate", () => {
    const css = renderGeometryStylesheet(baseDoc(), PAGE_ID);
    expect(css).toContain("@media (max-width: 767px) and (orientation: portrait){"); // mobile-verticale
    expect(css).toContain("@media (orientation: landscape) and (max-height: 550px){"); // mobile-orizzontale
    expect(css).toContain("@media (min-width: 768px) and (max-width: 1024px) and (orientation: portrait){"); // tablet-verticale
    expect(css).toContain("@media (min-width: 768px) and (max-width: 1199px) and (orientation: landscape) and (min-height: 551px){"); // tablet-orizzontale
    expect(css).toContain("@media (min-width: 1025px) and (max-width: 1199px){"); // laptop-compatto
    expect(css).toContain("@media (min-width: 1200px) and (max-width: 1399px){"); // desktop-compatto
    expect(css).toContain("@media (min-width: 1200px){"); // desktop
  });
});

describe("renderGeometryStylesheet — viewportWidth identico a Canvas/Preview (PREVIEW_SIZE, D-041)", () => {
  it.each([...listBreakpointNames()])(
    "su '%s', un nodo radice senza figli (pila, larghezza ereditata dall'alto) ha width pari a PREVIEW_SIZE[fascia].width",
    (breakpointName) => {
      const css = renderGeometryStylesheet(baseDoc(), PAGE_ID);
      const expectedWidth = PREVIEW_SIZE[breakpointName].width;
      const marker = `@media ${expectedMediaCondition(breakpointName)}{[data-node-id="root"]{position:absolute;left:0px;top:0px;width:${expectedWidth}px;`;
      expect(css).toContain(marker);
    },
  );
});

describe("renderGeometryStylesheet — regole di geometria per nodo", () => {
  it("emette una regola position:absolute con left/top/width/height per ciascun nodo, selettore [data-node-id]", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root", props: { height: 30 } });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).toContain('[data-node-id="root"]{position:absolute;');
    expect(css).toContain('[data-node-id="a"]{position:absolute;left:0px;top:0px;width:');
    expect(css).toContain(";height:30px;font-size:12px;object-fit:cover;}");
  });

  it("struttura piatta: ogni nodo è un selettore proprio, un figlio non è annidato dentro la regola del genitore", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    // Ogni regola CSS è un blocco {...} indipendente per il proprio nodeId - non
    // esiste una regola "[data-node-id=\"root\"] [data-node-id=\"a\"]" (selettore discendente).
    expect(css).not.toContain('"] [data-node-id="');
  });

  it("escapa il selettore con escapeCssText (difesa in profondità - nodeId è generato dall'Engine, mai testo libero)", () => {
    const rawNodeId = 'n"};body{background:red}[x="';
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: rawNodeId, nodeType: "text", parentId: "root" });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).not.toContain(`[data-node-id="${rawNodeId}"]`);
    expect(css).toContain(`[data-node-id="${escapeCssText(rawNodeId)}"]`);
  });
});

describe("renderGeometryStylesheet — determinismo", () => {
  it("due chiamate consecutive sullo stesso Document producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root" });
    expect(renderGeometryStylesheet(doc, PAGE_ID)).toBe(renderGeometryStylesheet(doc, PAGE_ID));
  });
});

/**
 * D-044: le 5 coppie di overlap reale oggi note tra le 7 fasce (verificate
 * algebricamente sui predicati, non assunte) - per ciascuna, un nodo con
 * valori DIVERGENTI tra le due fasce deve mostrare la fascia a priorità
 * più alta vincente per cascata CSS nella zona condivisa (la sua regola è
 * l'ULTIMA dichiarata a parità di selettore, D-044/EMISSION_ORDER).
 */
describe("renderGeometryStylesheet — le 5 coppie di overlap reale (D-044)", () => {
  it.each([
    ["tablet-orizzontale", "laptop-compatto"], // tablet-orizzontale vince (più specifico: orientamento+altezza)
    ["desktop-compatto", "desktop"], // desktop-compatto vince (ha un maxWidth, desktop no)
    ["mobile-orizzontale", "laptop-compatto"], // mobile-orizzontale vince (orientamento+altezza)
    ["mobile-orizzontale", "desktop-compatto"], // mobile-orizzontale vince
    ["mobile-orizzontale", "desktop"], // mobile-orizzontale vince
  ])("%s vince su %s quando i valori divergono nella zona condivisa", (winnerBp, loserBp) => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root", props: { x: 0, y: 0, width: 50, height: 50 } });
    doc = applyCommand(doc, {
      type: "UPDATE_PROPS",
      nodeId: "n",
      props: { responsive: { [winnerBp]: { x: 111 }, [loserBp]: { x: 222 } } },
    });

    const css = renderGeometryStylesheet(doc, PAGE_ID);

    const winnerBlockStart = css.indexOf(`@media ${expectedMediaCondition(winnerBp)}{`);
    const loserBlockStart = css.indexOf(`@media ${expectedMediaCondition(loserBp)}{`);
    expect(winnerBlockStart).toBeGreaterThanOrEqual(0);
    expect(loserBlockStart).toBeGreaterThanOrEqual(0);
    // Il blocco della fascia a priorità più alta (D-044) è emesso DOPO -
    // vince per cascata CSS nativa a parità di selettore [data-node-id="n"].
    expect(winnerBlockStart).toBeGreaterThan(loserBlockStart);

    // La regola del perdente (left:222px) compare dentro il SUO blocco,
    // prima dell'inizio del blocco del vincitore. Cercata a partire da
    // loserBlockStart: un override su una fascia può cascare in avanti su
    // una fascia che la include nella propria catena (D-019/CASCADE_ORDER,
    // es. tablet-orizzontale eredita da mobile-orizzontale) - la ricerca
    // deve restare scoped al blocco atteso, non trovare la prima occorrenza
    // ovunque nel documento.
    const loserRuleIndex = css.indexOf('[data-node-id="n"]{position:absolute;left:222px;', loserBlockStart);
    expect(loserRuleIndex).toBeGreaterThan(loserBlockStart);
    expect(loserRuleIndex).toBeLessThan(winnerBlockStart);

    // La regola del vincitore (left:111px) compare dentro il SUO blocco.
    const winnerRuleIndex = css.indexOf('[data-node-id="n"]{position:absolute;left:111px;', winnerBlockStart);
    expect(winnerRuleIndex).toBeGreaterThan(winnerBlockStart);
  });

  it("quando i valori NON divergono (caso reale oggi), le regole nelle due fasce sono identiche - l'ordine di emissione è ininfluente", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root", props: { x: 0, y: 0, width: 50, height: 50 } });

    const css = renderGeometryStylesheet(doc, PAGE_ID);
    const nRule = '[data-node-id="n"]{position:absolute;left:0px;top:0px;width:50px;height:50px;font-size:12px;object-fit:cover;}';

    for (const bp of ["tablet-orizzontale", "laptop-compatto", "desktop-compatto", "desktop", "mobile-orizzontale"]) {
      const blockStart = css.indexOf(`@media ${expectedMediaCondition(bp)}{`);
      expect(css.indexOf(nRule, blockStart)).toBeGreaterThan(blockStart);
    }
  });

  it("caso a tre vie: mobile-orizzontale + desktop-compatto + desktop corrispondono simultaneamente (es. 1300x400 landscape) - mobile-orizzontale vince su ENTRAMBE", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root", props: { x: 0, y: 0, width: 50, height: 50 } });
    doc = applyCommand(doc, {
      type: "UPDATE_PROPS",
      nodeId: "n",
      props: {
        responsive: {
          "mobile-orizzontale": { x: 1 },
          "desktop-compatto": { x: 2 },
          desktop: { x: 3 },
        },
      },
    });

    const css = renderGeometryStylesheet(doc, PAGE_ID);
    const mobileOrizzontaleStart = css.indexOf(`@media ${expectedMediaCondition("mobile-orizzontale")}{`);
    const desktopCompattoStart = css.indexOf(`@media ${expectedMediaCondition("desktop-compatto")}{`);
    const desktopStart = css.indexOf(`@media ${expectedMediaCondition("desktop")}{`);

    // mobile-orizzontale, priorità più alta delle tre, è emesso per ultimo.
    expect(mobileOrizzontaleStart).toBeGreaterThan(desktopCompattoStart);
    expect(mobileOrizzontaleStart).toBeGreaterThan(desktopStart);

    const mobileOrizzontaleRule = css.indexOf('[data-node-id="n"]{position:absolute;left:1px;', mobileOrizzontaleStart);
    expect(mobileOrizzontaleRule).toBeGreaterThan(mobileOrizzontaleStart);
  });
});

/**
 * Batch 5: proprietà STYLE_KEYS di tipografia/immagine/transizione -
 * fontSize/fontFamily/fontWeight/objectFit/transition. Stessi default già
 * verificati in Canvas.tsx/Preview.tsx (non inventati qui).
 */
describe("renderGeometryStylesheet — Batch 5: fontSize/objectFit (con fallback fisso)", () => {
  it("fontSize: fallback '12px' se assente (stesso default di Canvas.tsx/Preview.tsx, mai un numero nudo)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "box", parentId: "root" });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).toContain("font-size:12px;");
  });

  it("fontSize: valore esplicito passato così com'è (stringa CSS opaca, es. clamp())", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "h1", parentId: "root", props: { fontSize: "clamp(16px, 2vw, 24px)" } });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).toContain("font-size:clamp(16px, 2vw, 24px);");
  });

  it("objectFit: fallback 'cover' se assente, applicato incondizionatamente anche su un nodo non-immagine", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "text", parentId: "root" });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).toContain("object-fit:cover;");
  });

  it("objectFit: valore esplicito passato così com'è", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "image", parentId: "root", props: { objectFit: "contain" } });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).toContain("object-fit:contain;");
  });
});

describe("renderGeometryStylesheet — Batch 5: fontFamily/fontWeight/transition (nessun default inventato)", () => {
  it("fontFamily/fontWeight/transition assenti: nessuna dichiarazione CSS emessa per loro (il browser resta libero di usare il proprio default)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "box", parentId: "root" });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).not.toContain("font-family:");
    expect(css).not.toContain("font-weight:");
    expect(css).not.toContain("transition:");
  });

  it("fontFamily/fontWeight/transition presenti: passati così come sono, stringhe CSS opache", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "box",
      parentId: "root",
      props: { fontFamily: "'Georgia', serif", fontWeight: "700", transition: "all 0.3s ease" },
    });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    // "'Georgia', serif" contiene apici singoli - escapati da escapeCssText
    // (Batch 2) come ogni altro valore STYLE_KEYS, stessa disciplina del
    // test di escaping avversario sotto - non un valore letterale.
    expect(css).toContain(`font-family:${escapeCssText("'Georgia', serif")};`);
    expect(css).toContain("font-weight:700;");
    expect(css).toContain("transition:all 0.3s ease;");
  });
});

describe("renderGeometryStylesheet — Batch 5: escaping avversario delle proprietà STYLE_KEYS", () => {
  it("un valore che tenta di chiudere la regola e iniettarne una nuova viene neutralizzato da escapeCssText, mai presente in chiaro", () => {
    const malicious = 'Arial";}[data-node-id="x"]{display:none;}[y="';
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "box", parentId: "root", props: { fontFamily: malicious } });
    const css = renderGeometryStylesheet(doc, PAGE_ID);
    expect(css).not.toContain(`font-family:${malicious}`);
    expect(css).toContain(`font-family:${escapeCssText(malicious)}`);
  });
});

describe("renderGeometryStylesheet — Batch 5: STYLE_KEYS responsive (congelamento per fascia, D-018)", () => {
  it("un override di fontSize su una fascia si applica solo lì e sulle fasce che la includono nella propria cascata (stesso comportamento già garantito dal Resolver per la geometria)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "n", nodeType: "h1", parentId: "root", props: { fontSize: "16px" } });
    doc = applyCommand(doc, {
      type: "UPDATE_PROPS",
      nodeId: "n",
      props: { responsive: { "mobile-verticale": { fontSize: "14px" } } },
    });

    const css = renderGeometryStylesheet(doc, PAGE_ID);
    const mobileVerticaleStart = css.indexOf(`@media ${expectedMediaCondition("mobile-verticale")}{`);
    const desktopStart = css.indexOf(`@media ${expectedMediaCondition("desktop")}{`);

    expect(css.indexOf('[data-node-id="n"]', mobileVerticaleStart)).toBeGreaterThan(-1);
    const mobileVerticaleRule = css.slice(mobileVerticaleStart, css.indexOf("}}", mobileVerticaleStart) + 2);
    expect(mobileVerticaleRule).toContain("font-size:14px;");

    const desktopRule = css.slice(desktopStart);
    expect(desktopRule).toContain("font-size:16px;");
  });
});

describe("renderGeometryStylesheet — Batch 5: determinismo con STYLE_KEYS presenti", () => {
  it("due chiamate consecutive con fontSize/fontFamily/fontWeight/objectFit/transition impostati producono la stessa stringa byte-per-byte", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "n",
      nodeType: "h1",
      parentId: "root",
      props: { fontSize: "clamp(16px, 2vw, 24px)", fontFamily: "Georgia, serif", fontWeight: "700", objectFit: "contain", transition: "all 0.3s ease" },
    });
    expect(renderGeometryStylesheet(doc, PAGE_ID)).toBe(renderGeometryStylesheet(doc, PAGE_ID));
  });
});
