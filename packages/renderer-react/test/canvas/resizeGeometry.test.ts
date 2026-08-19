import { describe, expect, it } from "vitest";
import {
  computeResizedGeometry,
  contentFitGeometry,
  cornerScaleFactor,
  isCornerEdges,
  resizeHandles,
} from "../../src/canvas/resizeGeometry.js";

const start = { x: 10, y: 20, width: 100, height: 50 };

describe("computeResizedGeometry", () => {
  it("est: allarga la larghezza, ancoraggio x invariato", () => {
    expect(computeResizedGeometry(start, { east: true }, 30, 0)).toEqual({ width: 130 });
  });

  it("ovest: riduce la larghezza E sposta x per tenere fermo il bordo destro", () => {
    // Trascinando il bordo ovest verso destra (dx positivo) di 30: larghezza -30, x +30.
    expect(computeResizedGeometry(start, { west: true }, 30, 0)).toEqual({ width: 70, x: 40 });
  });

  it("ovest: trascinato verso sinistra (dx negativo) allarga e sposta x indietro", () => {
    expect(computeResizedGeometry(start, { west: true }, -20, 0)).toEqual({ width: 120, x: -10 });
  });

  it("sud: allarga l'altezza, ancoraggio y invariato", () => {
    expect(computeResizedGeometry(start, { south: true }, 0, 15)).toEqual({ height: 65 });
  });

  it("nord: riduce l'altezza E sposta y per tenere fermo il bordo inferiore", () => {
    expect(computeResizedGeometry(start, { north: true }, 0, 15)).toEqual({ height: 35, y: 35 });
  });

  it("angolo sud-est: larghezza e altezza crescono insieme, nessun cambio di x/y (stesso comportamento della maniglia unica preesistente)", () => {
    expect(computeResizedGeometry(start, { south: true, east: true }, 30, 15)).toEqual({ width: 130, height: 65 });
  });

  it("angolo nord-ovest: entrambi gli assi si spostano, il bordo opposto (sud-est) resta fisso", () => {
    const result = computeResizedGeometry(start, { north: true, west: true }, 10, 5);
    expect(result).toEqual({ width: 90, x: 20, height: 45, y: 25 });
    // Verifica che il bordo opposto sia davvero rimasto fisso.
    expect(result.x! + result.width!).toBe(start.x + start.width);
    expect(result.y! + result.height!).toBe(start.y + start.height);
  });

  it("mai un box degenerato: la larghezza non scende mai sotto 1px anche con un delta enorme", () => {
    expect(computeResizedGeometry(start, { east: true }, -1000, 0).width).toBe(1);
    const westResult = computeResizedGeometry(start, { west: true }, 1000, 0);
    expect(westResult.width).toBe(1);
    // Il bordo destro resta comunque fisso anche quando la larghezza è stata bloccata a 1px.
    expect(westResult.x! + westResult.width!).toBe(start.x + start.width);
  });

  it("nessun asse attivo -> oggetto vuoto (nessuna chiave)", () => {
    expect(computeResizedGeometry(start, {}, 50, 50)).toEqual({});
  });
});

describe("resizeHandles", () => {
  it("un nodo in un genitore 'libero' (come la maniglia unica preesistente) ha tutte e 8 le maniglie visibili quando anche canResizeHeight è vero", () => {
    const handles = resizeHandles({ canMoveXY: true, canResizeWidth: true, canResizeHeight: true });
    expect(handles.filter((h) => h.visible).map((h) => h.key).sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("un figlio di un genitore 'pila' (canMoveXY/canResizeWidth false, canResizeHeight vero se foglia) ha SOLO la maniglia sud visibile", () => {
    const handles = resizeHandles({ canMoveXY: false, canResizeWidth: false, canResizeHeight: true });
    expect(handles.filter((h) => h.visible).map((h) => h.key)).toEqual(["s"]);
  });

  it("un contenitore non-foglia con modalità propria 'pila' dentro un genitore 'libero' (canResizeHeight falso) ha solo le maniglie orizzontali est/ovest", () => {
    const handles = resizeHandles({ canMoveXY: true, canResizeWidth: true, canResizeHeight: false });
    expect(handles.filter((h) => h.visible).map((h) => h.key).sort()).toEqual(["e", "w"]);
  });

  it("nessuna capacità -> nessuna maniglia visibile", () => {
    const handles = resizeHandles({ canMoveXY: false, canResizeWidth: false, canResizeHeight: false });
    expect(handles.every((h) => !h.visible)).toBe(true);
  });
});

// Richiesta di prodotto ("scala l'elemento, non solo la scatola"): il
// contenuto scalabile (oggi solo fontSize, sui tipi text-bearing) segue
// SOLO le maniglie D'ANGOLO - `isCornerEdges` è il segnale unico condiviso
// tra l'anteprima dal vivo e il comando finale in Canvas.tsx.
describe("isCornerEdges", () => {
  it("le 4 maniglie di lato singolo (un solo edge ciascuna) NON sono d'angolo", () => {
    expect(isCornerEdges({ north: true })).toBe(false);
    expect(isCornerEdges({ south: true })).toBe(false);
    expect(isCornerEdges({ east: true })).toBe(false);
    expect(isCornerEdges({ west: true })).toBe(false);
  });

  it("le 4 maniglie d'angolo (nord/sud + est/ovest insieme) SONO d'angolo", () => {
    expect(isCornerEdges({ north: true, east: true })).toBe(true);
    expect(isCornerEdges({ north: true, west: true })).toBe(true);
    expect(isCornerEdges({ south: true, east: true })).toBe(true);
    expect(isCornerEdges({ south: true, west: true })).toBe(true);
  });

  it("nessun edge attivo -> non d'angolo", () => {
    expect(isCornerEdges({})).toBe(false);
  });
});

describe("cornerScaleFactor", () => {
  it("nessun ridimensionamento (stessa dimensione) -> fattore 1", () => {
    expect(cornerScaleFactor(100, 50, 100, 50)).toBe(1);
  });

  it("ingrandimento UNIFORME (stesso rapporto sui due assi) -> quel rapporto", () => {
    expect(cornerScaleFactor(100, 50, 200, 100)).toBe(2);
  });

  it("decisione esplicita del proprietario del prodotto: usa il MINIMO tra i due rapporti, non la media", () => {
    // Larghezza raddoppiata (rapporto 2), altezza invariata (rapporto 1) -
    // il fattore deve essere 1 (il minimo), non 1.5 (la media).
    expect(cornerScaleFactor(100, 50, 200, 50)).toBe(1);
  });

  it("un asse ridotto e l'altro ingrandito -> vince il rapporto più piccolo (quello che riduce)", () => {
    // Larghezza dimezzata (rapporto 0.5), altezza raddoppiata (rapporto 2) - il minimo è 0.5.
    expect(cornerScaleFactor(100, 50, 50, 100)).toBe(0.5);
  });

  // Vincolo esplicito del proprietario del prodotto, da verificare con un
  // test dedicato: il fattore di scala deve dipendere SOLO dal punto di
  // PARTENZA e da quello di ARRIVO, mai da valori intermedi - altrimenti lo
  // scaling diventerebbe cumulativo (il font crescerebbe in modo scorretto/
  // esponenziale durante un trascinamento prolungato). Verificato qui a
  // livello di formula pura: un trascinamento con MOLTI passaggi intermedi
  // (che in Canvas.tsx corrisponderebbero a più eventi `pointermove`, ognuno
  // dei quali ricalcola `cornerScaleFactor` da zero usando SEMPRE le stesse
  // dimensioni di partenza - mai un valore "già scalato" dal passaggio
  // precedente) produce lo STESSO risultato finale di un trascinamento
  // diretto dallo stesso punto di partenza allo stesso punto di arrivo.
  it("un trascinamento con più passaggi intermedi produce lo STESSO fattore finale di un trascinamento diretto (nessuna crescita cumulativa)", () => {
    const startWidth = 100;
    const startHeight = 50;
    const finalWidth = 250; // rapporto finale: 2.5
    const finalHeight = 150; // rapporto finale: 3.0 -> il minimo (2.5) vince

    // Simulazione "con passaggi intermedi": ogni chiamata usa SEMPRE
    // (startWidth, startHeight) come base - mai il risultato del passaggio
    // precedente - esattamente come fa Canvas.tsx (startLocal è immutabile
    // per la durata del gesto, resizeDelta è sempre relativo al punto di
    // partenza, mai incrementale).
    const intermediateSteps = [
      { width: 120, height: 60 },
      { width: 180, height: 200 }, // passaggio "rumoroso": un rapporto verticale alto, ignorato al passaggio successivo
      { width: 90, height: 40 }, // il gesto può anche tornare indietro momentaneamente
      { width: finalWidth, height: finalHeight },
    ];
    let lastFactor = NaN;
    for (const step of intermediateSteps) {
      lastFactor = cornerScaleFactor(startWidth, startHeight, step.width, step.height);
    }

    const directFactor = cornerScaleFactor(startWidth, startHeight, finalWidth, finalHeight);

    expect(lastFactor).toBe(directFactor);
    expect(lastFactor).toBe(2.5);
  });
});

// Bug segnalato ("la scatola non segue l'ingombro reale del testo dopo lo
// scaling", riferimento Ctrl+T di Photoshop): decisione esplicita del
// proprietario del prodotto - text/h1/h2/h3/link adattano sia width sia
// height al contenuto misurato ("both"); paragraph adatta solo height
// ("heightOnly"), width resta quella scelta dall'autore.
describe("contentFitGeometry", () => {
  const start = { x: 10, y: 20, width: 100, height: 50 };

  it("'both' su una maniglia sud-est: width e height diventano l'ingombro misurato, x/y invariati (nessun bordo ovest/nord attivo)", () => {
    const result = contentFitGeometry(start, { south: true, east: true }, "both", 180, 90);
    expect(result).toEqual({ width: 180, height: 90 });
  });

  it("'heightOnly' (paragraph) su una maniglia sud-est: SOLO height cambia, width non compare nel risultato", () => {
    const result = contentFitGeometry(start, { south: true, east: true }, "heightOnly", 999 /* ignorata */, 90);
    expect(result).toEqual({ height: 90 });
  });

  it("'both' su una maniglia NORD-EST: height adattata E l'ancora Y si sposta per tenere fermo il bordo INFERIORE", () => {
    // Bordo inferiore attuale: start.y + start.height = 70. Nuova height 30 -> nuova y = 70 - 30 = 40.
    const result = contentFitGeometry(start, { north: true, east: true }, "both", 120, 30);
    expect(result).toEqual({ width: 120, height: 30, y: 40 });
  });

  it("'both' su una maniglia SUD-OVEST: width adattata E l'ancora X si sposta per tenere fermo il bordo DESTRO", () => {
    // Bordo destro attuale: start.x + start.width = 110. Nuova width 40 -> nuova x = 110 - 40 = 70.
    const result = contentFitGeometry(start, { south: true, west: true }, "both", 40, 90);
    expect(result).toEqual({ width: 40, x: 70, height: 90 });
  });

  it("'both' su una maniglia NORD-OVEST: sia X sia Y si spostano per tenere fermo l'angolo opposto (sud-est)", () => {
    // Angolo sud-est attuale: (110, 70). Nuova dimensione 40x30 -> nuova origine (110-40, 70-30) = (70, 40).
    const result = contentFitGeometry(start, { north: true, west: true }, "both", 40, 30);
    expect(result).toEqual({ width: 40, x: 70, height: 30, y: 40 });
  });

  it("'heightOnly' con bordo ovest attivo: X non viene toccata (nessun ancoraggio orizzontale, la larghezza è dell'autore)", () => {
    const result = contentFitGeometry(start, { north: true, west: true }, "heightOnly", 999, 30);
    expect(result).toEqual({ height: 30, y: 40 }); // y sì (bordo nord attivo), x/width no
  });

  it("larghezza/altezza misurate non scendono mai sotto 1px (nessun box degenerato, anche per un contenuto vuoto)", () => {
    expect(contentFitGeometry(start, { south: true, east: true }, "both", 0, 0)).toEqual({ width: 1, height: 1 });
  });
});
