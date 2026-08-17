import type { Document, PageId } from "@vicolobuilder/engine";
import { getPage } from "@vicolobuilder/engine";
import { escapeHtmlAttribute, escapeHtmlText } from "./escape.js";

/**
 * Batch 8 dell'Exporter: `<head>` da `Page.props`/`Document.props` (SEO,
 * D-027/D-035). Nessuna nuova lettura dall'Engine - gli stessi valori sono
 * già osservabili end-to-end da `IR.meta.pageProps`/`IR.meta.documentProps`
 * fin da D-027/D-035 ("questo rende `Page.props` osservabile end-to-end...
 * senza un Exporter HTML reale"), qui letti direttamente da `Document`
 * (`getPage(document, pageId).props`/`document.props`) - stesso dato,
 * nessuna duplicazione di percorso.
 *
 * **Confine di questo batch, non un'omissione**: `<head>` qui prodotto
 * contiene SOLO i campi SEO editabili dall'autore (`title`/`description`/
 * `canonical`/`og:*`) e l'attributo `lang` (letto separatamente da chi
 * assembla il documento completo, `resolveHtmlLang` sotto - `lang` è un
 * attributo di `<html>`, non un elemento dentro `<head>`). `<meta
 * charset>`/`<meta name="viewport">` - requisiti di base di qualunque
 * documento HTML, MAI editabili dall'autore, nessun dato da leggere -
 * restano fuori da questo batch, stesso trattamento già dato a
 * `html,body{margin:0}` (Batch 4/5): compito dell'assemblaggio del
 * documento completo (Batch 9), non di questo generatore.
 *
 * **Nessun valore inventato** (coerente con D-027/D-035, "Nessuna
 * validazione... nessun controllo di forma"): ogni campo è OMESSO se
 * assente o non stringa - stesso trattamento già dato a `fontFamily`/
 * `fontWeight` (Batch 5), mai un default silenzioso come `fontSize`/
 * `objectFit`. Nessun campo SEO ha mai avuto un default in tutto il
 * prodotto.
 *
 * **`og:url` - SEMPRE derivato da `canonical`, mai un campo proprio**
 * (D-035, Opzione H): emesso se e solo se `canonical` è una stringa non
 * vuota, con lo STESSO valore verbatim - nessuna trasformazione. Verificato
 * qui che nessuna chiave `ogUrl` venga mai letta da `pageProps`/
 * `documentProps` (non esiste, per costruzione del Document Model - D-035
 * l'ha esplicitamente esclusa dall'elenco chiuso in scrittura).
 */
function metaTag(property: string, value: unknown): string {
  return typeof value === "string" && value !== "" ? `<meta property="${property}" content="${escapeHtmlAttribute(value)}">` : "";
}

export function renderHead(document: Document, pageId: PageId): string {
  const pageProps = getPage(document, pageId)?.props ?? {};
  const documentProps = document.props;

  const tags: string[] = [];

  const title = pageProps.title;
  if (typeof title === "string" && title !== "") {
    tags.push(`<title>${escapeHtmlText(title)}</title>`);
  }

  const description = pageProps.description;
  if (typeof description === "string" && description !== "") {
    tags.push(`<meta name="description" content="${escapeHtmlAttribute(description)}">`);
  }

  const canonical = pageProps.canonical;
  const hasCanonical = typeof canonical === "string" && canonical !== "";
  if (hasCanonical) {
    tags.push(`<link rel="canonical" href="${escapeHtmlAttribute(canonical)}">`);
  }

  tags.push(metaTag("og:title", pageProps.ogTitle));
  tags.push(metaTag("og:description", pageProps.ogDescription));
  if (hasCanonical) {
    tags.push(metaTag("og:url", canonical));
  }
  tags.push(metaTag("og:site_name", documentProps.ogSiteName));
  tags.push(metaTag("og:type", documentProps.ogType));
  tags.push(metaTag("og:locale", documentProps.ogLocale));

  return `<head>${tags.filter((tag) => tag !== "").join("")}</head>`;
}

/**
 * `lang` (`DOCUMENT_SEO_KEYS`, D-035) è un attributo di `<html>`, non un
 * elemento dentro `<head>` - letto qui separatamente per chi assembla il
 * documento completo (`<html lang="...">`, Batch 9). Nessun default
 * inventato (stesso principio di `renderHead`): `undefined` se assente o
 * non stringa - un `<html>` senza `lang` resta comunque HTML valido,
 * l'omissione è dell'autore, non un errore da mascherare qui.
 */
export function resolveHtmlLang(document: Document): string | undefined {
  const lang = document.props.lang;
  return typeof lang === "string" && lang !== "" ? lang : undefined;
}
