import type { Document } from "@vicolobuilder/engine";
import { readHoverStyles } from "@vicolobuilder/render-conventions";
import type { HoverKey } from "@vicolobuilder/render-conventions";
import { escapeCssText } from "./escape.js";

/**
 * Batch 7 dell'Exporter: regole `:hover` da `props.hover`
 * (`readHoverStyles`, `@vicolobuilder/render-conventions`, D-030/D-047) -
 * stessa fonte dati già usata da `useHoverStyles.ts` per l'editor. Nessuna
 * cascata con la fascia responsive (D-030, Punto 2 - verificato che
 * `:hover` non compare mai dentro un `@media` nel sito reale): generato
 * una sola volta, non dentro i 7 blocchi `@media` di
 * `renderGeometryStylesheet` - stesso trattamento di `renderFontFaces`
 * (Batch 6).
 *
 * **Deviazione deliberata dal meccanismo dell'editor, non una nuova
 * decisione di prodotto** (stesso schema già applicato in Batch 6 per i
 * font): `useHoverStyles.ts` costruisce le regole via CSSOM
 * (`insertRule` + assegnazione programmatica, JavaScript) PROPRIO per
 * evitare di interpolare `color`/`background`/`transform`/`borderColor`
 * (campi di testo liberi) dentro testo CSS grezzo - un vettore di CSS
 * injection esplicitamente identificato ed evitato in D-030. L'Exporter
 * non può usare quella via ("zero JavaScript", analisi Exporter §3.8):
 * l'unica via possibile è un `<style>` con selettore `:hover` costruito
 * per interpolazione di stringa, resa sicura da `escapeCssText` (Batch 2,
 * già verificata in un contesto di valore CSS non tra apici nei Batch 5/6).
 *
 * `!important` su ogni dichiarazione, stesso trattamento di
 * `useHoverStyles.ts` (D-030): nell'editor è OBBLIGATORIO perché il `Tag`
 * porta sempre uno style inline concorrente; nell'Exporter la regola base
 * (Batch 4/5/7) vive in un foglio esterno con la STESSA specificità di
 * `[data-node-id="x"]` - `:hover` (specificità più alta per il proprio
 * pseudo-selettore) vincerebbe comunque per cascata nativa anche senza
 * `!important` con la struttura attuale. Mantenuto per parità esplicita
 * con la convenzione già stabilita e verificata in D-030, e per robustezza
 * a eventuali cambi futuri di struttura delle regole - non richiesto dal
 * protocollo attuale, ma coerente e a costo trascurabile.
 *
 * Ordine di emissione: per `nodeId` crescente, non l'ordine di
 * inserimento della `Map` restituita da `readHoverStyles` - stesso motivo
 * già applicato a `IR.nodes`/`IR.types` (D-036): l'ordine di inserimento
 * non è un dato significativo, va reso indipendente esplicitamente per il
 * determinismo byte-per-byte dell'output.
 */
const CSS_PROPERTY_BY_HOVER_KEY: Record<HoverKey, string> = {
  color: "color",
  background: "background",
  transform: "transform",
  borderColor: "border-color",
};

export function renderHoverRules(document: Document): string {
  const hoverStyles = readHoverStyles(document);
  const nodeIds = [...hoverStyles.keys()].sort();

  const blocks: string[] = [];
  for (const nodeId of nodeIds) {
    const hover = hoverStyles.get(nodeId);
    if (!hover) continue;

    const decls: string[] = [];
    for (const key of Object.keys(hover) as HoverKey[]) {
      const value = hover[key];
      if (typeof value === "string") {
        decls.push(`${CSS_PROPERTY_BY_HOVER_KEY[key]}:${escapeCssText(value)} !important`);
      }
    }
    if (decls.length > 0) {
      blocks.push(`[data-node-id="${escapeCssText(nodeId)}"]:hover{${decls.join(";")};}`);
    }
  }
  return blocks.join("");
}
