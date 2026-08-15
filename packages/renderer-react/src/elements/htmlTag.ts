/**
 * Fase 9 (analisi, Punto 4): mappa `DocumentNode.type` -> tag HTML reale da
 * renderizzare, sia nel Canvas (editing) sia nella Preview. Compatibile col
 * vincolo D1 (Canvas piatto, Fase 5 Blocco D): cambia solo il TAG di un box
 * già foglia e assolutamente posizionato, non il nesting del DOM. Ogni
 * `type` non elencato qui (incluso "box"/"text"/"scene") ricade su `div`,
 * comportamento invariato rispetto a prima di questa fase.
 *
 * Fase 15 — `image` -> `img`, primo (e per ora unico) void element di
 * questo elenco: vedi `Canvas.tsx` (overlay di selezione ristrutturato
 * come fratelli, non figli, proprio per restare compatibile con un tag
 * che non può avere children).
 */
const TAG_BY_NODE_TYPE: Readonly<Record<string, string>> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  paragraph: "p",
  link: "a",
  image: "img",
};

export function htmlTagFor(nodeType: string): string {
  return TAG_BY_NODE_TYPE[nodeType] ?? "div";
}
