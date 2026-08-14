/**
 * Fase 9 (analisi, Punto 4): mappa `DocumentNode.type` -> tag HTML reale da
 * renderizzare, sia nel Canvas (editing) sia nella Preview. Compatibile col
 * vincolo D1 (Canvas piatto, Fase 5 Blocco D): cambia solo il TAG di un box
 * già foglia e assolutamente posizionato, non il nesting del DOM. Ogni
 * `type` non elencato qui (incluso "box"/"text"/"scene") ricade su `div`,
 * comportamento invariato rispetto a prima di questa fase.
 */
const TAG_BY_NODE_TYPE: Readonly<Record<string, string>> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  paragraph: "p",
  link: "a",
};

export function htmlTagFor(nodeType: string): string {
  return TAG_BY_NODE_TYPE[nodeType] ?? "div";
}
