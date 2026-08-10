import { deserializeDocument, assertValidDocument, exportIR } from "@vicolobuilder/engine";

/**
 * Default di breakpoint/viewportWidth usati da `builder export` in assenza
 * di flag (nessuna fonte del piano operativo di Fase 3 richiede un flag di
 * selezione breakpoint/viewport - vedi DECISIONS.md D-010). Il valore
 * riprende solo il precedente informale già usato nello script demo di
 * Fase 2 (packages/engine/demo/generate-fase-2-demo.mjs,
 * VIEWPORT_WIDTH.desktop). Non è una relazione architetturale ufficiale
 * tra breakpoint e viewportWidth: nell'Engine i due parametri restano
 * indipendenti (DECISIONS.md D-012) - questa è solo una scelta UX del
 * consumer CLI, non registrata nel decision log.
 */
const DEFAULT_BREAKPOINT = "desktop";
const DEFAULT_VIEWPORT_WIDTH = 1280;

/**
 * Core puro di `builder export`: nessun filesystem qui dentro. Riceve il
 * contenuto grezzo del file già letto, restituisce l'IR serializzato da
 * stampare su stdout - il file di input non viene mai toccato.
 *
 * Applica esplicitamente il gate di invariante (assertValidDocument) prima
 * di passare il Document a resolveDocument/computeLayout (via exportIR):
 * stesso principio già usato da applyCommand in Fase 1, qui necessario
 * perché il Document arriva da JSON esterno/non fidato, non dal CommandBus.
 */
export function runExport(rawJson: string): string {
  const document = deserializeDocument(rawJson);
  assertValidDocument(document);

  const ir = exportIR(document, {
    breakpoint: DEFAULT_BREAKPOINT,
    pageId: document.rootPageId,
    viewportWidth: DEFAULT_VIEWPORT_WIDTH,
  });

  return JSON.stringify(ir);
}
