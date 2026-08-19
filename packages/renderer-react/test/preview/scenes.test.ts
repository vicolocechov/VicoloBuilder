import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { nextSceneOrigin, sceneNodeIds } from "../../src/preview/scenes.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("sceneNodeIds", () => {
  it("pagina inesistente -> lista vuota", () => {
    const doc = baseDoc();
    expect(sceneNodeIds(doc, "non-esiste")).toEqual([]);
  });

  it("nessun figlio con type==='scene' -> lista vuota (fallback Punto 1 dell'analisi Fase 7)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(sceneNodeIds(doc, "page-home")).toEqual([]);
  });

  it("filtra solo i figli diretti con type==='scene', nell'ordine di childrenIds", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "non-scena", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root" });
    expect(sceneNodeIds(doc, "page-home")).toEqual(["s1", "s2"]);
  });

  it("ignora un nodo type==='scene' che non è figlio diretto della radice pagina (nipote)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "contenitore", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "scena-annidata", nodeType: "scene", parentId: "contenitore" });
    expect(sceneNodeIds(doc, "page-home")).toEqual([]);
  });
});

// Bug segnalato dal proprietario del prodotto (primo giro): una nuova
// scena non si impilava sotto l'ultima esistente (dipendeva dal
// layoutMode della radice pagina, spesso "libero"). `nextSceneOrigin`
// garantisce l'impilamento SEMPRE, indipendentemente dalla radice.
//
// Bug 2 (secondo giro): la prima versione sommava SOLO le altezze delle
// altre SCENE, ignorando qualunque elemento non-scena che le precedesse -
// una scena poteva sovrapporsi a un testo/contenitore già presente alla
// radice. Corretto (Opzione B): il calcolo include TUTTI i figli diretti
// della radice, scena o no, nell'ordine di `childrenIds`.
//
// Bug 3 (terzo giro, diagnosi + fix): la formula `sum(height)` del giro
// precedente presuppone implicitamente che i figli siano impilati in
// sequenza SENZA sovrapposizioni né vuoti - vero per le scene (impilate
// per costruzione da questa stessa funzione), FALSO per elementi in
// modalità "libero" (posizione Y propria e indipendente). Riprodotto in
// browser: un testo e un'immagine sparsi (non impilati) producevano una
// sovrapposizione reale con `sum`. Corretto: `y` = il MASSIMO tra i bordi
// inferiori (`y + height`, RISOLTI) di TUTTI i figli precedenti - stessa
// formula UNICA per scena e non-scena (verificato su tre scenari prima di
// implementare, DECISIONS.md). `sum` resta il caso degenere di `max`
// quando gli elementi sono già impilati senza sovrapposizioni/vuoti -
// esattamente il caso "scena dopo scena", dove le due formule coincidono
// (nessuna regressione, dimostrato esplicitamente sotto).
describe("nextSceneOrigin", () => {
  it("nessuna scena esistente -> origine (0,0), stessa X/Y del default di ELEMENT_DEFAULTS.scene", () => {
    const doc = baseDoc();
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 0 });
  });

  it("una scena esistente (y:0, height:400) -> la successiva si impila sotto (y=400)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 0, height: 400 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
  });

  // Scenario 2 della diagnosi (scena -> scena): le due scene sono
  // REALMENTE impilate (stessa Y che una creazione reale via
  // nextSceneOrigin produrrebbe) - qui max(y+height) e sum(height)
  // coincidono esattamente, a dimostrazione che non c'è regressione per
  // il caso già corretto in precedenza.
  it("Scenario 2 (scena -> scena, impilate correttamente) — max(y+height) coincide con sum(height), nessuna regressione", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 0, height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root", props: { y: 400, height: 300 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 700 });
  });

  // Scenario 1 della diagnosi: due elementi LIBERI sparsi (non impilati -
  // l'immagine è deliberatamente lontana dal testo, un layout "libero"
  // realistico). `sum(height)` produrrebbe qui 60+120=180, sovrapposto
  // interamente all'immagine (che arriva fino a 620) - bug riprodotto e
  // confermato in browser prima di questo fix. `max(y+height)` produce
  // 620, il vero punto più basso occupato, nessuna sovrapposizione.
  it("Scenario 1 (elementi liberi SPARSI/non impilati) — max(y+height) evita la sovrapposizione che sum(height) produrrebbe", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "testo", nodeType: "text", parentId: "root", props: { y: 50, height: 60 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "immagine", nodeType: "image", parentId: "root", props: { y: 500, height: 120 } });
    const sumWouldGive = 60 + 120; // 180 - la formula precedente, sovrapposta all'immagine (bottom reale 620)
    expect(sumWouldGive).toBe(180);
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 620 });
  });

  // Scenario 3 della diagnosi: un elemento libero interamente CONTENUTO nel
  // range verticale già coperto da una scena precedente (non si estende
  // oltre il suo bordo inferiore) non deve spingere inutilmente in basso la
  // scena successiva. `sum(height)` produrrebbe 60+400+120=580 (uno spreco
  // di 120px ingiustificato); `max(y+height)` produce 460, il vero bordo
  // inferiore più basso (quello della scena, non dell'immagine).
  it("Scenario 3 (elemento libero CONTENUTO nel range di una scena precedente) — max(y+height) non spreca spazio, a differenza di sum(height)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "testo", nodeType: "text", parentId: "root", props: { y: 50, height: 60 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 60, height: 400 } }); // bottom: 460
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "immagine", nodeType: "image", parentId: "root", props: { y: 30, height: 120 } }); // bottom: 150, dentro il range di s1
    const sumWouldGive = 60 + 400 + 120; // 580 - la formula precedente, 120px di spreco ingiustificato
    expect(sumWouldGive).toBe(580);
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 460 });
  });

  // Un elemento non-scena PRIMA della prima scena, REALMENTE impilato
  // (stessa Y che una creazione reale produrrebbe) - stesso risultato di
  // prima del Bug 3 quando non c'è sovrapposizione/spreco da correggere.
  it("un elemento non-scena PRIMA della prima scena, impilato correttamente, viene incluso (non più ignorato, Bug 2)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "non-scena", nodeType: "box", parentId: "root", props: { y: 0, height: 9999 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 9999, height: 400 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 9999 + 400 });
  });

  // Un elemento non-scena INTERCALATO tra due scene, REALMENTE impilato -
  // nessun caso speciale per "prima" vs "in mezzo" (Bug 2, richiesto
  // esplicitamente in quel giro).
  it("un elemento non-scena INTERCALATO tra due scene, impilato correttamente, viene incluso (Bug 2)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 0, height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "intercalato", nodeType: "text", parentId: "root", props: { y: 400, height: 150 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root", props: { y: 550, height: 300 } });
    // Una terza scena si impilerebbe dopo TUTTO: max(400, 550, 850) = 850.
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 850 });
  });

  // Bug 3, richiesto esplicitamente: una scena riposizionata MANUALMENTE
  // dopo la creazione (trascinata più in basso) veniva ignorata da
  // `sum(height)` (che leggeva solo l'altezza, mai la Y reale) - ora
  // tracciata correttamente, dato che `max(y+height)` legge sempre la Y
  // EFFETTIVA di ciascun figlio.
  it("Bug 3 — una scena riposizionata MANUALMENTE dopo la creazione viene tracciata correttamente (limite noto di sum(height), D-064/D-068)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { y: 0, height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root", props: { y: 400, height: 300 } });
    // Prima del riposizionamento: una terza scena si impilerebbe a 700 (400+300, sum e max coincidono).
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 700 });

    // "s2" viene trascinata più in basso (es. un vero MOVE via Canvas.tsx) - la sua Y EFFETTIVA è ora 600, non più 400.
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "s2", props: { y: 600 } });
    // sum(height) darebbe ANCORA 700 (ignora la Y reale, limite noto) - qui invece si aggiorna a 900 (600+300).
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 900 });
  });

  it("una scena senza height valido usa il fallback difensivo (400), mai NaN", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root" }); // nessun height/y esplicito
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
  });

  it("usa l'altezza RISOLTA alla fascia richiesta (override responsive rispettato, non solo il prop base)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "s1",
      nodeType: "scene",
      parentId: "root",
      props: { y: 0, height: 400, responsive: { "mobile-verticale": { height: 812 } } },
    });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
    expect(nextSceneOrigin(doc, "page-home", "mobile-verticale")).toEqual({ x: 0, y: 812 });
  });

  it("pagina inesistente -> origine (0,0)", () => {
    const doc = baseDoc();
    expect(nextSceneOrigin(doc, "non-esiste", "desktop")).toEqual({ x: 0, y: 0 });
  });
});
