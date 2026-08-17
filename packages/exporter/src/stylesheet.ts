import type { Box, Document, PageId } from "@vicolobuilder/engine";
import { exportIR, getBreakpoint, listBreakpointNames } from "@vicolobuilder/engine";
import { PREVIEW_SIZE } from "@vicolobuilder/render-conventions";
import { escapeCssText } from "./escape.js";

/**
 * Batch 4 dell'Exporter: foglio di stile "snapshot posizionale" (analisi
 * Exporter §3.1, Opzione A approvata) - un blocco `@media` per ciascuna
 * delle 7 fasce nominate (D-019), con la geometria ASSOLUTA di pagina già
 * calcolata da `computeLayout` per quella fascia (`position:absolute` +
 * `left`/`top`/`width`/`height`, stesso principio già usato da
 * Canvas.tsx/Preview.tsx per il posizionamento nell'editor). Selettore
 * `[data-node-id="..."]`, stesso attributo già emesso da `renderMarkup`
 * (Batch 3) - nessun nuovo identificatore introdotto.
 *
 * `viewportWidth` per fascia preso da `PREVIEW_SIZE`
 * (`@vicolobuilder/render-conventions`, D-041) - la stessa identica tabella
 * già usata da Canvas/Preview per l'anteprima nell'editor, non una copia:
 * questo è ciò che garantisce che l'HTML pubblicato mostri la stessa
 * geometria già vista in Preview per ciascuna fascia.
 *
 * Soglie `@media` prese da `getBreakpoint` (`@vicolobuilder/engine`,
 * D-043) - il predicato REALE di ciascuna fascia, mai reinventato: ogni
 * campo opzionale (`minWidth`/`maxWidth`/`orientation`/`minHeight`/
 * `maxHeight`) diventa la corrispondente media feature CSS solo se
 * presente nel predicato, nello stesso ordine in cui compare in
 * `Breakpoint` (nessun significato nell'ordine delle feature dentro una
 * singola query - `and` è commutativo in CSS - a differenza dell'ordine
 * TRA i 7 blocchi, che invece è significativo, vedi sotto).
 */

/**
 * Ordine di emissione dei 7 blocchi (D-044) - priorità di prodotto
 * ESPLICITA, dichiarata dal proprietario del prodotto, non derivata da
 * BREAKPOINTS né da alcuna proprietà calcolata dei predicati (un tentativo
 * di derivarla dal conteggio dei campi è stato verificato insufficiente:
 * produce parità non decidibile su 2 delle 5 coppie di overlap reali -
 * D-044). Le 7 fasce nominate si sovrappongono per costruzione (fatto
 * verificato e accettato fin da D-019, non un difetto di questo batch) - a
 * parità di selettore, la cascata CSS nativa fa vincere l'ULTIMA regola
 * dichiarata: questo elenco va quindi letto dalla PRIORITÀ PIÙ BASSA
 * (emessa per prima) alla PIÙ ALTA (emessa per ultima, quindi vincente in
 * ogni zona di overlap - `desktop` è ultimo per corrispondenza, non per
 * priorità: è il PRIMO a essere scavalcato quando un'altra fascia più
 * specifica corrisponde anch'essa). Verificato con l'algebra dei predicati
 * (non solo assunto) che questo ordine risolve deterministicamente tutte
 * le 5 coppie di overlap reali oggi note, incluso il caso a tre vie
 * `mobile-orizzontale`+`desktop-compatto`+`desktop` - vedi D-044.
 */
const EMISSION_ORDER: readonly string[] = [
  "desktop",
  "laptop-compatto",
  "desktop-compatto",
  "mobile-verticale",
  "tablet-verticale",
  "tablet-orizzontale",
  "mobile-orizzontale",
];

function mediaCondition(breakpointName: string): string {
  const breakpoint = getBreakpoint(breakpointName);
  const features: string[] = [];
  if (breakpoint.minWidth !== undefined) features.push(`(min-width: ${breakpoint.minWidth}px)`);
  if (breakpoint.maxWidth !== undefined) features.push(`(max-width: ${breakpoint.maxWidth}px)`);
  if (breakpoint.orientation !== undefined) features.push(`(orientation: ${breakpoint.orientation})`);
  if (breakpoint.minHeight !== undefined) features.push(`(min-height: ${breakpoint.minHeight}px)`);
  if (breakpoint.maxHeight !== undefined) features.push(`(max-height: ${breakpoint.maxHeight}px)`);
  return features.join(" and ");
}

/**
 * `nodeId` è generato dall'Engine (`uniqueId()`, mai testo libero
 * dell'utente), ma escapato comunque per difesa in profondità dentro la
 * stringa CSS tra apici del selettore attributo - stesso principio già
 * scelto per `data-node-id` in `renderMarkup` (Batch 3, con
 * `escapeHtmlAttribute` per il contesto HTML; qui `escapeCssText`, Batch 2,
 * perché il contesto di destinazione è una stringa CSS, non un attributo
 * HTML - le due discipline non sono intercambiabili).
 */
function renderGeometryRules(box: Box, out: string[]): void {
  const selector = `[data-node-id="${escapeCssText(box.nodeId)}"]`;
  out.push(`${selector}{position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;}`);
  for (const child of box.children) renderGeometryRules(child, out);
}

/**
 * Punto di ingresso del Batch 4: produce SOLO i 7 blocchi `@media` (nessun
 * `<style>`/`<head>` - l'assemblaggio del documento completo resta compito
 * dei Batch 8/9, fuori da questo batch, stesso perimetro già rispettato da
 * `renderMarkup` per il Batch 3).
 */
export function renderGeometryStylesheet(document: Document, pageId: PageId): string {
  // Difesa in profondità (D-044): se in futuro `BREAKPOINTS` cambierà (nuova
  // fascia, fascia rimossa), `EMISSION_ORDER` va aggiornato ESPLICITAMENTE
  // a mano - un fallimento rumoroso qui è preferibile a un ordine di
  // emissione silenziosamente incompleto/obsoleto.
  const known = new Set(listBreakpointNames());
  if (EMISSION_ORDER.length !== known.size || EMISSION_ORDER.some((name) => !known.has(name))) {
    throw new Error(
      "renderGeometryStylesheet: EMISSION_ORDER (D-044) non corrisponde più a listBreakpointNames() - " +
        "aggiorna EMISSION_ORDER a mano con una nuova priorità di prodotto esplicita, non derivarla automaticamente.",
    );
  }

  const blocks: string[] = [];
  for (const breakpointName of EMISSION_ORDER) {
    const viewportWidth = PREVIEW_SIZE[breakpointName]?.width ?? 1600;
    const ir = exportIR(document, { breakpoint: breakpointName, pageId, viewportWidth });
    const rules: string[] = [];
    renderGeometryRules(ir.box, rules);
    blocks.push(`@media ${mediaCondition(breakpointName)}{${rules.join("")}}`);
  }
  return blocks.join("");
}
