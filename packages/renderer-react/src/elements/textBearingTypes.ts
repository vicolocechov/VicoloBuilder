/**
 * Fase S2 (analisi, Punto 2): quali `DocumentNode.type` portano testo (hanno
 * `fontSize`/`text` nei propri default, `elements/createElementCommand.ts`)
 * - usato dal `PropertyPanel` per decidere quando mostrare il campo
 * `fontSize` (visibilità condizionale, pattern stabilito in S1/D-025).
 * `node.type` non varia mai per fascia (nessun comando lo modifica dopo
 * `CREATE_NODE`), quindi qui si controlla il valore diretto, non uno
 * risolto - a differenza di `layoutMode` (S1), che può avere un override
 * responsive.
 */
const TEXT_BEARING_TYPES: ReadonlySet<string> = new Set(["text", "h1", "h2", "h3", "paragraph", "link"]);

export function isTextBearingType(nodeType: string): boolean {
  return TEXT_BEARING_TYPES.has(nodeType);
}
