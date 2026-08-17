import { assertValidDocument, deserializeDocument, serializeDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";

/**
 * Blocco 1 (audit Builder UI/UX, Punto 2 - persistenza minima): riusa
 * esattamente serializeDocument/deserializeDocument dell'Engine, stesso
 * gate di invariante (assertValidDocument) già applicato dal CLI su
 * qualunque JSON esterno (publishCommand.ts/exportCommand.ts) - nessuna
 * serializzazione parallela inventata qui. Persistito SOLO il Document
 * (contenuto/struttura/props): pagina attiva, fascia attiva e selezione
 * sono stato di sessione dell'editor, non del Document, e non sono
 * richiesti da questo blocco (possono ripartire da un default al
 * caricamento).
 */
const STORAGE_KEY = "vicolobuilder:document";

export function saveDocumentToLocalStorage(document: Document): void {
  window.localStorage.setItem(STORAGE_KEY, serializeDocument(document));
}

export function hasSavedDocument(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}

/** Lancia DocumentParseError/DocumentInvariantError (stesse classi del CLI) se non c'è nulla di salvato o il contenuto non è un Document valido. */
export function loadDocumentFromLocalStorage(): Document {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    throw new Error("Nessun documento salvato trovato.");
  }
  const document = deserializeDocument(raw);
  assertValidDocument(document);
  return document;
}
