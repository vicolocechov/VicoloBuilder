import { createDocument, serializeDocument } from "@vicolobuilder/engine";

/**
 * Core puro di `builder create`: nessun filesystem, nessun argv, nessun
 * process.exit qui dentro — solo Engine reale (barrel pubblico) più
 * serializzazione deterministica. L'entry-point (src/bin/builder.ts) è
 * l'unico punto che tocca I/O.
 */
export function runCreate(): string {
  return serializeDocument(createDocument());
}
