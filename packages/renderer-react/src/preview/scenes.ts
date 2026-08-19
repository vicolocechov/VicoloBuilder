import { getPage, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, Document, NodeId, PageId } from "@vicolobuilder/engine";
import { asFiniteNumber } from "../asFiniteNumber.js";

/**
 * Fase 7, Punto 1 (Opzione B - DECISIONS.md): una "scena" è un figlio
 * diretto della radice della pagina il cui `type` (campo già libero di
 * `DocumentNode`, invariato da Fase 1) vale "scene" - nessuno schema
 * dedicato nel Document Model, solo una convenzione riconosciuta qui.
 *
 * Ordine: quello di `childrenIds` del nodo radice (ordine di inserimento -
 * non esiste un comando di riordino dei nodi figli, solo REORDER_PAGES per
 * l'ordine delle pagine).
 */
export function sceneNodeIds(document: Document, pageId: PageId): readonly NodeId[] {
  const page = getPage(document, pageId);
  if (!page) return [];
  const root = document.nodes.get(page.rootNodeId);
  if (!root) return [];
  return root.childrenIds.filter((childId) => document.nodes.get(childId)?.type === "scene");
}

/**
 * Fallback difensivo per un figlio SENZA `height` valido in `resolvedProps`
 * - raggiunto raramente in pratica (ogni tipo di elemento foglia ha sempre
 * un `height` esplicito nei propri default, `createElementCommand.ts`), ma
 * possibile per un contenitore/griglia in modalità "libero" SENZA `height`
 * esplicito: la sua altezza reale è calcolata dall'Engine dal riquadro dei
 * figli, mai scritta indietro nei props, quindi `resolvedProps.height`
 * resta `undefined` per quel nodo. Limite noto e accettato di questa
 * funzione (non esegue `computeLayout`, legge solo i props già risolti) -
 * un valore "ragionevole ma approssimato" invece di richiedere l'intero
 * albero di layout qui solo per questo calcolo.
 */
const FALLBACK_CHILD_HEIGHT = 400;

/**
 * Bug segnalato (diagnosi precedente): la versione originale sommava SOLO
 * le altezze delle altre SCENE esistenti (`sceneNodeIds`), ignorando
 * qualunque elemento non-scena che le precedesse alla radice pagina - una
 * nuova scena poteva sovrapporsi a un testo/contenitore già presente.
 * Corretto (Opzione B, decisione esplicita del proprietario del prodotto):
 * la Y della prossima scena è la somma delle altezze RISOLTE (alla fascia
 * attiva, non solo il prop base) di TUTTI i figli diretti della radice
 * pagina, nell'ordine di `childrenIds` - scena o no. Dato che una nuova
 * scena nasce sempre come ULTIMO figlio (nessun comando di inserimento a
 * metà lista), "tutti i figli attuali" coincide esattamente con "tutti i
 * figli che la precederanno" - nessun filtro per tipo necessario qui, a
 * differenza della versione precedente: gestisce per costruzione sia un
 * elemento non-scena PRIMA della prima scena sia elementi non-scena
 * INTERCALATI tra scene esistenti, senza bisogno di un caso speciale per
 * l'uno o per l'altro. `sceneNodeIds` resta invariata e ancora usata altrove
 * (motore di navigazione) - non più da questa funzione, che ora non ha
 * bisogno di sapere "cos'è una scena" per il proprio calcolo.
 */
export function nextSceneOrigin(
  document: Document,
  pageId: PageId,
  activeBreakpoint: BreakpointName,
): { readonly x: number; readonly y: number } {
  const page = getPage(document, pageId);
  if (!page) return { x: 0, y: 0 };
  const root = document.nodes.get(page.rootNodeId);
  if (!root) return { x: 0, y: 0 };

  let y = 0;
  for (const nodeId of root.childrenIds) {
    const node = document.nodes.get(nodeId);
    if (!node) continue;
    const resolvedHeight = resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps.height;
    y += asFiniteNumber(resolvedHeight) ?? FALLBACK_CHILD_HEIGHT;
  }
  return { x: 0, y };
}
