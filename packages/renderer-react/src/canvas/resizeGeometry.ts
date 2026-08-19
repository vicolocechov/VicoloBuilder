import type { DragCapabilities } from "./flattenBoxes.js";

export interface ResizeEdges {
  readonly north?: boolean;
  readonly south?: boolean;
  readonly east?: boolean;
  readonly west?: boolean;
}

export interface ResizeStart {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResizedGeometry {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Blocco 4 ("rifinitura visiva", maniglie di resize su più lati/angoli):
 * calcola la nuova geometria per un ridimensionamento da una maniglia, dati
 * i delta del puntatore. Puramente numerico - nessuna unità di coordinate
 * (locale o assoluta) codificata qui: la stessa funzione serve sia per il
 * comando finale (coordinate locali, le props del nodo) sia per l'anteprima
 * dal vivo durante il trascinamento (coordinate assolute, `Box.x`/`y`) -
 * una traslazione è lineare, la formula è identica in entrambi gli spazi.
 *
 * Un bordo "positivo" (est/sud) tiene fermo l'angolo opposto e fa crescere
 * la dimensione nella direzione del trascinamento. Un bordo "negativo"
 * (ovest/nord) tiene fermo il bordo OPPOSTO: la dimensione cambia E
 * l'ancoraggio (x/y) si sposta in modo che il bordo opposto resti
 * geometricamente fisso - lo stesso comportamento atteso da qualunque
 * editor grafico con maniglie sui 4 lati. Larghezza/altezza mai sotto 1px
 * (nessun box degenerato/invertito, stesso limite già in vigore per la
 * maniglia unica preesistente).
 */
export function computeResizedGeometry(start: ResizeStart, edges: ResizeEdges, dx: number, dy: number): ResizedGeometry {
  const result: { x?: number; y?: number; width?: number; height?: number } = {};

  if (edges.east) {
    result.width = Math.max(1, start.width + dx);
  } else if (edges.west) {
    const width = Math.max(1, start.width - dx);
    result.width = width;
    result.x = start.x + (start.width - width);
  }

  if (edges.south) {
    result.height = Math.max(1, start.height + dy);
  } else if (edges.north) {
    const height = Math.max(1, start.height - dy);
    result.height = height;
    result.y = start.y + (start.height - height);
  }

  return result;
}

/**
 * Richiesta di prodotto ("scala l'elemento, non solo la scatola"): il
 * contenuto scalabile di un nodo (oggi: `fontSize`, sui tipi text-bearing)
 * segue SOLO le maniglie D'ANGOLO - un lato singolo cambia una sola
 * dimensione della scatola, mai un "resize proporzionale" in nessun editor
 * visivo di riferimento. Vero se ENTRAMBI gli assi sono attivi (nord/sud E
 * est/ovest) - esattamente le 4 maniglie d'angolo (ne/nw/se/sw) restituite
 * da `resizeHandles` sopra, mai le 4 di lato singolo (n/s/e/w, un solo edge
 * ciascuna). Riusa la stessa struttura `edges` già usata per il calcolo
 * geometrico - nessuna nuova enumerazione parallela di "quali maniglie sono
 * d'angolo".
 */
export function isCornerEdges(edges: ResizeEdges): boolean {
  return (edges.north === true || edges.south === true) && (edges.east === true || edges.west === true);
}

/**
 * Fattore di scala per il contenuto scalabile di un nodo durante un
 * ridimensionamento d'angolo (decisione esplicita del proprietario del
 * prodotto): il MINIMO tra il rapporto orizzontale e quello verticale, non
 * la media - più prevedibile per l'autore, il contenuto non cresce mai più
 * di quanto l'asse "tirato di meno" giustifichi (es. un trascinamento
 * puramente orizzontale, con l'asse verticale invariato, non fa crescere
 * affatto il font - `resizedHeight === startHeight` produce un rapporto
 * verticale di 1, che vince come minimo).
 */
export function cornerScaleFactor(startWidth: number, startHeight: number, resizedWidth: number, resizedHeight: number): number {
  return Math.min(resizedWidth / startWidth, resizedHeight / startHeight);
}

/**
 * "both": text/h1/h2/h3/link (tipicamente riga singola) - sia width sia
 * height si adattano al contenuto reale. "heightOnly": paragraph (può
 * andare a capo su più righe) - SOLO height si adatta, width resta quella
 * scelta dall'autore (mantiene il controllo su DOVE il testo va a capo:
 * misurare l'ingombro "naturale" richiederebbe rimuovere il vincolo di
 * larghezza, eliminando quella scelta).
 */
export type ContentFitAxes = "both" | "heightOnly";

/**
 * Bug segnalato ("il bordo di trasformazione dovrebbe sempre seguire
 * esattamente il contenuto, come Ctrl+T in Photoshop"): dopo lo scaling
 * proporzionale del font (`cornerScaleFactor` sopra), la scatola deve
 * adattarsi all'ingombro REALE del contenuto misurato - restare quella
 * geometricamente scalata lascia un divario tra bordo e testo (preesistente
 * al font-scaling, un default mai stato "snug", reso più visibile da esso).
 *
 * Puro: riceve l'ingombro GIÀ misurato (width/height del contenuto reale,
 * in spazio DOCUMENTO) come parametro - la misura stessa (DOM, quando
 * leggerla rispetto al nuovo fontSize) resta responsabilità esclusiva di
 * Canvas.tsx, mai di questo modulo, stesso confine già rispettato da
 * `computeResizedGeometry`/`cornerScaleFactor`.
 *
 * Stessa logica di ancoraggio già usata in `computeResizedGeometry` per i
 * bordi "negativi" (ovest/nord): se quel bordo è attivo per questa
 * maniglia, l'ancora (x/y) si sposta per tenere fermo il bordo OPPOSTO -
 * ora con la dimensione MISURATA al posto di quella geometricamente
 * scalata, altrimenti il bordo opposto "salterebbe" quando la misura reale
 * differisce da quella puramente geometrica. Larghezza/altezza mai sotto
 * 1px (stesso limite già in vigore in `computeResizedGeometry`, nessun box
 * degenerato anche per un contenuto vuoto).
 */
export function contentFitGeometry(
  startLocal: ResizeStart,
  edges: ResizeEdges,
  axes: ContentFitAxes,
  measuredWidth: number,
  measuredHeight: number,
): { readonly width?: number; readonly height: number; readonly x?: number; readonly y?: number } {
  const height = Math.max(1, measuredHeight);
  const result: { width?: number; height: number; x?: number; y?: number } = { height };
  if (edges.north) result.y = startLocal.y + (startLocal.height - height);

  if (axes === "both") {
    const width = Math.max(1, measuredWidth);
    result.width = width;
    if (edges.west) result.x = startLocal.x + (startLocal.width - width);
  }

  return result;
}

export interface ResizeHandleDef {
  readonly key: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
  readonly edges: ResizeEdges;
  readonly cursor: string;
  readonly visible: boolean;
}

/**
 * Quali delle 8 maniglie hanno senso per QUESTO elemento, date le stesse
 * `DragCapabilities` già usate per il trascinamento geometrico
 * (`flattenBoxes.ts` - `canMoveXY`/`canResizeWidth`/`canResizeHeight`,
 * decise dalla modalità del genitore/del nodo stesso, mai da questo
 * modulo). Un bordo ovest/nord SPOSTA anche l'ancoraggio (x/y) per tenere
 * fermo il lato opposto - richiede quindi `canMoveXY`, non solo la
 * capacità di ridimensionare quell'asse (`canResizeWidth`/
 * `canResizeHeight` da sole bastano solo per est/sud, dove x/y non
 * cambiano mai). Coerente con l'unica maniglia preesistente (sud-est):
 * richiedeva `canResizeWidth || canResizeHeight` per essere visibile,
 * qui EST e SUD (le direzioni "positive") restano soggette alla stessa
 * condizione di base, senza il vincolo aggiuntivo di `canMoveXY`.
 */
export function resizeHandles(caps: DragCapabilities): readonly ResizeHandleDef[] {
  const { canMoveXY, canResizeWidth, canResizeHeight } = caps;
  return [
    { key: "n", edges: { north: true }, cursor: "ns-resize", visible: canResizeHeight && canMoveXY },
    { key: "s", edges: { south: true }, cursor: "ns-resize", visible: canResizeHeight },
    { key: "e", edges: { east: true }, cursor: "ew-resize", visible: canResizeWidth },
    { key: "w", edges: { west: true }, cursor: "ew-resize", visible: canResizeWidth && canMoveXY },
    { key: "ne", edges: { north: true, east: true }, cursor: "nesw-resize", visible: canResizeHeight && canResizeWidth && canMoveXY },
    { key: "nw", edges: { north: true, west: true }, cursor: "nwse-resize", visible: canResizeHeight && canResizeWidth && canMoveXY },
    { key: "se", edges: { south: true, east: true }, cursor: "nwse-resize", visible: canResizeHeight && canResizeWidth },
    { key: "sw", edges: { south: true, west: true }, cursor: "nesw-resize", visible: canResizeHeight && canResizeWidth && canMoveXY },
  ];
}
