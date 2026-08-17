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
