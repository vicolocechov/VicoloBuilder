import { getNode, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, CreateNodeCommand, Document, NodeId } from "@vicolobuilder/engine";

/**
 * Fase 5 — creazione interattiva di elementi, scope ridotto approvato:
 * solo "testo" e "contenitore" in questo giro. "Immagine" rimandata
 * esplicitamente (toccherebbe l'elenco chiuso CONTENT_KEYS in
 * write/buildUpdatePropsCommand.ts, che resta bloccato com'è).
 *
 * Fase 7 — aggiunto "scene": nessuno schema dedicato nel Document Model
 * (`DocumentNode.type` resta una stringa libera, invariata da Fase 1 - qui
 * usata col valore "scene" così come finora con "box"/"text"), solo una
 * convenzione che il motore di navigazione (preview/scenes.ts) riconosce
 * filtrando i figli diretti della radice pagina per `node.type === "scene"`
 * (analisi Fase 7, Punto 1 - Opzione B, DECISIONS.md).
 *
 * Fase 8 — aggiunto "griglia": un contenitore NORMALE come "contenitore"
 * (`nodeType: "box"`, nessuna "cella" nel Document Model - principio
 * corretto esplicitamente prima dell'implementazione) con
 * `layoutMode: "griglia"`. A differenza di "scene", NON ha un parent fisso:
 * segue la stessa regola di collocamento di "testo"/"contenitore"
 * (`resolveNewElementParent` - dentro un contenitore libero selezionato,
 * altrimenti la radice pagina), perché una griglia può stare ovunque un
 * contenitore normale può stare. Nasce vuota (nessun figlio pre-creato,
 * `columns`/`gap` sono un default di comodo per quando arriveranno figli
 * via MOVE_NODE - vedi analisi Fase 8 su MOVE_NODE) - finché è vuota si
 * comporta come un box qualunque (ramo "foglia" di `computeLayout`, non
 * legge affatto `columns`/`gap`).
 *
 * Fase 9 — aggiunti "h1"/"h2"/"h3" (distinzione heading, analisi Punto 1 -
 * Opzione B: un `type` per livello, non `type:"heading"`+`level`, per
 * coerenza con `layoutMode` - già un piccolo insieme chiuso di stringhe,
 * non un tipo+parametro numerico - e perché il sito reale usa solo 3
 * livelli, mai h4-h6), "paragraph" (stessa forma di "text", solo tag
 * diverso in uscita) e "link" (`props.href`, Punto 3 - nessuna evidenza
 * reale di un link-contenitore, resta un leaf come "text"). Seguono TUTTI
 * la regola di collocamento standard di "testo"/"contenitore"/"griglia"
 * (`resolveNewElementParent`), non quella fissa di "scene".
 *
 * Default: nessun valore nuovo inventato per renderli visibili - x/y/
 * width/height/text/fontSize sono ESATTAMENTE quelli già usati da "text"
 * (stessa natura di elemento foglia testuale; differenziare le dimensioni
 * per livello di heading sarebbe una decisione di scala tipografica non
 * ancora presa - la stessa lasciata esplicitamente aperta in D-023 per
 * S2). L'unico valore genuinamente nuovo, `href` per "link" (nessun
 * precedente nel codice/roadmap lo determinava), è stato segnalato e
 * deciso esplicitamente dal proprietario del prodotto prima di scrivere
 * questo file: stringa vuota `""`.
 */
export type ElementType = "text" | "container" | "scene" | "griglia" | "h1" | "h2" | "h3" | "paragraph" | "link";

/**
 * Valori di default approvati esplicitamente (versione uniforme, non
 * condizionale sul parent - vedi turno di decisione). Il contenitore nasce
 * "libero": è l'unica modalità che questo stesso giro rende utilizzabile
 * come bersaglio di annidamento (vedi `resolveNewElementParent` - un
 * contenitore a pila non può mai ricevere un nuovo elemento tramite questa
 * funzione), non per comodità implementativa (DECISIONS.md, D-015).
 */
const ELEMENT_DEFAULTS: Record<ElementType, { readonly nodeType: string; readonly idBase: string; readonly props: Readonly<Record<string, unknown>> }> = {
  // Fase 10 — `fontSize` come stringa CSS `clamp()` letterale, opaca per
  // l'Engine (stesso trattamento di `text`/`color` - nessuna validazione,
  // nessuna interpretazione qui: solo il Renderer la assegna a
  // `style.fontSize`, vedi Canvas.tsx/Preview.tsx). Valore di esempio, non
  // vincolante - dimostra il meccanismo, non una scala tipografica del
  // prodotto (analisi Fase 10, Punto 1 - Opzione A).
  text: {
    nodeType: "text",
    idBase: "testo",
    props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" },
  },
  container: { nodeType: "box", idBase: "contenitore", props: { x: 20, y: 20, width: 200, height: 120, layoutMode: "libero" } },
  // x/y/width/height tutti espliciti: una scena è sempre figlia diretta
  // della radice pagina (vedi ElementPalette.tsx), ma la radice PUÒ essere
  // in modalità "libero" (es. il documento demo di App.tsx) oppure "pila"
  // (default per una pagina nuova) - non si può assumere quale delle due.
  // In modalità "pila" del genitore, `x`/`y`/`width` qui sono ignorati
  // (widthFromParent vince sempre, vedi layout/computeLayout.ts) e solo
  // `height` conta. In modalità "libero" del genitore, invece, un figlio
  // senza figli propri (una scena appena creata lo è) DEVE avere `width`
  // esplicito - nessun default (Decisione 3, D-014/D-015) - o
  // `computeLayout` lancia. Bug trovato verificando in browser (documento
  // demo, radice "libero") con solo `height` impostata: non coperto dai
  // test unitari esistenti, che non creano mai un elemento sotto una
  // radice "libero".
  scene: { nodeType: "scene", idBase: "scena", props: { x: 0, y: 0, width: 800, height: 400 } },
  // x/y/width/height espliciti per lo stesso motivo di "scene" (Punto sopra:
  // il genitore selezionato/la radice pagina possono essere in modalità
  // "libero"). `columns`/`gap` sono un default [Proposta, non vincolante] -
  // ignorati finché la griglia è vuota (ramo "foglia" di computeLayout).
  griglia: {
    nodeType: "box",
    idBase: "griglia",
    props: { x: 20, y: 20, width: 600, height: 200, layoutMode: "griglia", columns: 3, gap: 16 },
  },
  // h1/h2/h3/paragraph: stessi x/y/width/height/text/fontSize di "text" -
  // nessun valore nuovo, solo `nodeType` diverso (mappato a un tag HTML
  // diverso nel Renderer, vedi Canvas.tsx/Preview.tsx).
  h1: { nodeType: "h1", idBase: "h1", props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" } },
  h2: { nodeType: "h2", idBase: "h2", props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" } },
  h3: { nodeType: "h3", idBase: "h3", props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" } },
  paragraph: {
    nodeType: "paragraph",
    idBase: "paragrafo",
    props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", fontSize: "clamp(16px, 2vw, 24px)" },
  },
  // Stesso x/y/width/height/text/fontSize di "text" + `href` (deciso
  // esplicitamente dal proprietario del prodotto: stringa vuota, nessun
  // precedente lo determinava).
  link: {
    nodeType: "link",
    idBase: "link",
    props: { x: 20, y: 20, width: 160, height: 40, text: "Testo", href: "", fontSize: "clamp(16px, 2vw, 24px)" },
  },
};

export function elementIdBase(elementType: ElementType): string {
  return ELEMENT_DEFAULTS[elementType].idBase;
}

function isLiberoContainer(document: Document, nodeId: NodeId, activeBreakpoint: BreakpointName): boolean {
  const node = getNode(document, nodeId);
  if (!node) return false;
  return resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps.layoutMode === "libero";
}

/**
 * Collocamento (paletto dato): dentro il contenitore selezionato se è in
 * modalità libera - risolta alla vista attiva, non solo il prop base, così
 * un override responsive di `layoutMode` viene rispettato; altrimenti la
 * radice della pagina attiva, ANCHE se il contenitore selezionato è a
 * pila (non si forza mai libero dentro pila).
 */
export function resolveNewElementParent(
  document: Document,
  pageRootNodeId: NodeId,
  selection: NodeId | null,
  activeBreakpoint: BreakpointName,
): NodeId {
  if (selection !== null && isLiberoContainer(document, selection, activeBreakpoint)) {
    return selection;
  }
  return pageRootNodeId;
}

export function buildCreateElementCommand(elementType: ElementType, nodeId: NodeId, parentId: NodeId): CreateNodeCommand {
  const { nodeType, props } = ELEMENT_DEFAULTS[elementType];
  return { type: "CREATE_NODE", nodeId, nodeType, parentId, props: { ...props } };
}
