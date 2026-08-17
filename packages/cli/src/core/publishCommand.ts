import { deserializeDocument, assertValidDocument } from "@vicolobuilder/engine";
import { exportSite } from "@vicolobuilder/exporter";

/**
 * Core puro di `builder publish` (Exporter Batch 9): nessun filesystem qui
 * dentro, stesso schema di `runExport` (`exportCommand.ts`). Riceve il
 * contenuto grezzo del file già letto, restituisce il file HTML completo
 * pronto per la pubblicazione - il file di input non viene mai toccato.
 *
 * Pagina esportata: `document.rootPageId` (nessun flag di selezione
 * pagina) - stesso default già usato da `runExport`, coerente con il
 * perimetro "una pagina per chiamata" già stabilito da ogni batch
 * dell'Exporter (1-9, mai una generazione multi-pagina).
 *
 * Stesso gate di invariante di `runExport` (`assertValidDocument` prima di
 * `exportSite`): il Document arriva da JSON esterno/non fidato, non dal
 * CommandBus.
 */
export function runPublish(rawJson: string): string {
  const document = deserializeDocument(rawJson);
  assertValidDocument(document);
  return exportSite(document, document.rootPageId);
}
