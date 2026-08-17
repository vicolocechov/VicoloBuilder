import type { Document, NodeId } from "@vicolobuilder/engine";

/**
 * Fase 17 (Transizioni CSS di base, Punto 2 - decisione esplicita: quarto
 * bag, mirror strutturale di `props.responsive` ma per STATO invece che
 * per fascia). Elenco chiuso guidato dall'evidenza reale (sito di
 * riferimento, in ordine di frequenza): `transform` (18 occorrenze),
 * `background`/`color` (17 ciascuna), `borderColor` (1) - esplicitamente
 * ESCLUSE geometria/layout (`x`/`y`/`width`/`height`/`layoutMode`): zero
 * evidenza reale, e includerle richiederebbe un concetto di "stato
 * transitorio" nel Layout Engine che oggi non esiste (RFC-004).
 *
 * Nessuna cascata con `props.responsive`: verificato che `:hover` non
 * compare mai dentro un blocco `@media` nel sito reale - l'hover è un asse
 * ortogonale alla fascia, non integrato nel Resolver (Punto 2, approvato).
 *
 * ATTENZIONE - `color` qui (nel bag hover) mappa alla proprietà CSS
 * `color` (testo), MENTRE la `color` BASE di un nodo (`CONTENT_KEYS`,
 * `DocumentNode.props.color`, mai in questo bag) mappa a `background` -
 * stessa chiave, semantica diversa a seconda del bag: convenzione già
 * consolidata nell'editor (`Preview.tsx`/Canvas.tsx), non reinventata qui.
 *
 * Exporter Batch 7: spostato da `renderer-react/src/interactions/hoverStyle.ts`
 * a questo pacchetto neutro, stesso principio già applicato a `htmlTagFor`
 * (D-038), `PREVIEW_SIZE` (D-041) e `FontRegistration` (D-046) - l'Exporter
 * ha bisogno esattamente della stessa forma/lettura di `props.hover` già
 * usata da `Preview.tsx`/`useHoverStyles.ts` per renderizzare l'hover
 * nell'editor. `renderer-react` importa ora da qui invece di tenere una
 * copia locale - zero cambi di comportamento, stesso identico output.
 */
export const HOVER_KEYS = ["color", "background", "transform", "borderColor"] as const;
export type HoverKey = (typeof HOVER_KEYS)[number];
export type HoverStyle = Readonly<Partial<Record<HoverKey, string>>>;

const HOVER_KEY_SET: ReadonlySet<string> = new Set(HOVER_KEYS);

function isHoverStyle(value: unknown): value is HoverStyle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, val]) => HOVER_KEY_SET.has(key) && typeof val === "string",
  );
}

/**
 * Legge `node.props.hover` per ogni nodo del Document, scartando ogni
 * valore che non ha esattamente la forma attesa (stesso trattamento già
 * dato a `document.props.fonts`) e ogni nodo senza alcuna chiave hover
 * valorizzata (bag vuoto o assente).
 */
export function readHoverStyles(document: Document): ReadonlyMap<NodeId, HoverStyle> {
  const result = new Map<NodeId, HoverStyle>();
  for (const node of document.nodes.values()) {
    const hover = node.props.hover;
    if (isHoverStyle(hover) && Object.keys(hover).length > 0) {
      result.set(node.id, hover);
    }
  }
  return result;
}
