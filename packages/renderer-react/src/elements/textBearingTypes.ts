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

/**
 * Blocco 1/3 (audit Builder UI/UX): complementare a `isTextBearingType` per
 * due usi con la stessa nozione - "sembra un contenitore" (Canvas.tsx, resa
 * distinta per tipo) e "può ricevere figli via drag-and-drop" (Blocco 3,
 * `dropTarget.ts`). "image" è l'unico altro tipo NON container-like fuori
 * dai text-bearing (nessun'altra eccezione nell'insieme chiuso
 * `ElementType` di `createElementCommand.ts`).
 */
export function isContainerLikeType(nodeType: string): boolean {
  return !isTextBearingType(nodeType) && nodeType !== "image";
}
