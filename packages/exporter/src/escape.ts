/**
 * Batch 2 dell'Exporter (analisi Exporter, §3.7 - "Escaping/sanitizzazione,
 * non solo href"): tre discipline DISTINTE, mai intercambiabili, per i tre
 * contesti in cui un valore testo libero dell'autore finisce nell'output
 * statico. Nessuna delle tre dipende dall'Engine (funzioni pure
 * stringa->stringa) - deliberatamente il primo modulo di questo pacchetto,
 * prima di qualunque markup/CSS reale (Batch 3+), perché ogni batch
 * successivo che tocca testo libero le userà, non le reinventerà.
 *
 * Le tre funzioni sono scritte per essere SICURE anche in composizione
 * (es. un valore passato sia a `escapeCssText` sia inserito dentro una
 * stringa CSS tra doppi apici) - non per un solo contesto di inserimento
 * alla volta.
 */

/**
 * Testo HTML (contenuto tra tag, es. `text` di un nodo). `&` va sostituito
 * PRIMA di `<`/`>` - altrimenti l'entità appena scritta per `<`/`>`
 * (che contiene `&`) verrebbe ri-processata dalla sostituzione di `&`
 * successiva, producendo un doppio escaping. L'ordine qui è quindi
 * significativo, non stilistico.
 */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Attributo HTML tra doppi apici (es. `href="..."`, `alt="..."`,
 * `content="..."`). Oltre a `&`/`<`/`>` (stessa disciplina di
 * `escapeHtmlText`, stesso ordine), anche `"` (la convenzione di questo
 * Exporter è SEMPRE doppi apici, mai singoli - vedi Batch 3+) e `'` per
 * difesa in profondità, nel caso un valore finisse mai dentro un attributo
 * tra apici singoli.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Testo CSS (valore di una dichiarazione, es. `color: valore;`, o dentro
 * una stringa CSS tra apici, es. `font-family: "valore"`/`url("valore")`).
 * `\` va sostituito PRIMA di ogni altro carattere - le sostituzioni
 * successive introducono nuovi `\` (le sequenze di escape stesse), che non
 * vanno ri-processati da un secondo giro su `\`. Ogni carattere sostituito
 * usa la sintassi di escape nativa di CSS (Syntax Level 3: `\` seguito da
 * un carattere qualunque - diverso da cifra esadecimale o newline -
 * rappresenta quel carattere letteralmente, valida sia in identificatori
 * sia in stringhe sia nei valori "nudi"): `"`/`'` (rottura di una stringa
 * CSS tra apici), `{`/`}` (rottura del blocco della regola corrente,
 * iniezione di una regola/selettore nuovo), `;` (iniezione di una nuova
 * dichiarazione nella stessa regola). Un a-capo letterale è rappresentato
 * con l'escape esadecimale standard di CSS per line feed (`\A `, con lo
 * spazio finale richiesto dalla sintassi) invece di essere rimosso -
 * stessa filosofia delle altre due funzioni: escape, mai eliminazione
 * silenziosa del carattere.
 */
export function escapeCssText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/;/g, "\\;")
    .replace(/\r\n|\r|\n/g, "\\A ");
}
