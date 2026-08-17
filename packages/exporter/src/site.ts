import type { Document, PageId } from "@vicolobuilder/engine";
import { BASE_BREAKPOINT, exportIR } from "@vicolobuilder/engine";
import { PREVIEW_SIZE } from "@vicolobuilder/render-conventions";
import { escapeHtmlAttribute } from "./escape.js";
import { renderMarkup } from "./markup.js";
import { renderGeometryStylesheet } from "./stylesheet.js";
import { renderFontFaces } from "./fonts.js";
import { renderHoverRules } from "./hover.js";
import { renderSeoTags, resolveHtmlLang } from "./head.js";

/**
 * Batch 9 dell'Exporter (ultimo del piano): assemblaggio di un'intera
 * pagina in UN SOLO file HTML pubblicabile - compone tutti gli otto batch
 * precedenti (markup, geometria per fascia, `STYLE_KEYS`/sfondo base,
 * font, hover, `<head>`/SEO) più i requisiti di base già identificati
 * come "compito di questo batch" lungo il percorso (mai anticipati prima
 * d'ora, per disciplina di perimetro):
 *
 * - `html,body{margin:0;padding:0;}` (trovato in Batch 4: necessario
 *   perché le coordinate `position:absolute` coincidano con `Box.x`/`Box.y`
 *   - verificato allora contro la Preview reale, mai aggiunto prima perché
 *   fuori dal perimetro dei batch di generazione dei singoli frammenti);
 * - `<meta charset="utf-8">`/`<meta name="viewport">` (D-048: requisiti di
 *   base di qualunque documento HTML, mai editabili dall'autore);
 * - l'apertura `<html lang="...">` vera e propria (D-048: `resolveHtmlLang`
 *   restituisce solo il valore, l'attributo lo scrive questo batch).
 *
 * **Una sola pagina per chiamata, non un sito multi-pagina**: coerente con
 * OGNI batch precedente (1-8), che ha sempre operato su una singola coppia
 * `(document, pageId)` - nessuno ha mai introdotto generazione multi-file/
 * navigazione tra pagine pubblicate. Non un'omissione di questo batch: è
 * la continuazione diretta dello stesso perimetro già stabilito.
 *
 * **Markup generato dalla fascia BASE (`desktop`, D-019)**: il contenuto
 * (`renderMarkup`) non varia per fascia (`CONTENT_KEYS` non cascano mai,
 * D-024/D-035 - verificato, non assunto) - qualunque fascia produrrebbe lo
 * stesso markup; `desktop`/`BASE_BREAKPOINT` è la scelta più naturale
 * (dove vivono i props diretti di un nodo), non una fascia arbitraria.
 *
 * **Questione esplicitamente NON decisa qui, lasciata aperta**: un
 * font-family di base per il `<body>` (nessun reset CSS tipografico
 * aggiunto) - D-045 aveva rimandato questa domanda esplicitamente
 * all'assemblaggio del documento completo ("se il prodotto vuole un font
 * di base per il sito pubblicato, va deciso esplicitamente lì, non
 * dedotto dallo stile dell'editor"). Nessuna decisione di prodotto è
 * arrivata in merito - coerente con "nessun valore inventato" (stessa
 * disciplina di ogni campo SEO/STYLE_KEYS in questo Exporter), qui non si
 * aggiunge alcun font-family di base: il browser del visitatore userà il
 * proprio default nativo per ogni nodo privo di un `fontFamily` esplicito.
 * Segnalata, non decisa autonomamente.
 */
export function exportSite(document: Document, pageId: PageId): string {
  const viewportWidth = PREVIEW_SIZE[BASE_BREAKPOINT]?.width ?? 1600;
  const ir = exportIR(document, { breakpoint: BASE_BREAKPOINT, pageId, viewportWidth });

  const markup = renderMarkup(ir);
  const seoTags = renderSeoTags(document, pageId);
  const lang = resolveHtmlLang(document);
  const css = `html,body{margin:0;padding:0;}${renderFontFaces(document)}${renderGeometryStylesheet(document, pageId)}${renderHoverRules(document)}`;

  const langAttr = lang !== undefined ? ` lang="${escapeHtmlAttribute(lang)}"` : "";
  const head =
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `${seoTags}<style>${css}</style></head>`;

  return `<!doctype html><html${langAttr}>${head}<body>${markup}</body></html>`;
}
