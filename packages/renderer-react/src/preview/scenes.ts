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
 * Fallback difensivo, mai realmente raggiunto in pratica (ogni scena creata
 * da `buildCreateElementCommand`/`ELEMENT_DEFAULTS.scene`, in
 * createElementCommand.ts, ha sempre un `height` esplicito - stesso valore,
 * 400, usato qui) - serve solo a non produrre un salto a `NaN` se un
 * documento più vecchio o modificato a mano avesse un nodo "scene" senza
 * `height` valido in `resolvedProps`.
 */
const FALLBACK_SCENE_HEIGHT = 400;

/**
 * Richiesta di prodotto (dopo la diagnosi del bug "una nuova scena non si
 * impila sotto l'ultima"): le scene si comportano SEMPRE come impilate
 * verticalmente tra loro - stessa X (0, l'ancora comune), Y = somma delle
 * altezze RISOLTE (alla fascia attiva, non solo il prop base - un override
 * responsive va rispettato) di TUTTE le scene esistenti, nell'ordine già
 * stabilito da `sceneNodeIds` (riusato qui, non ridefinito: stessa identità
 * "cos'è una scena" di Fase 7) - GARANTITO indipendentemente dal
 * `layoutMode` della radice pagina (che può essere "libero" e contenere
 * anche altri elementi non-scena, la cui presenza/posizione è del tutto
 * irrilevante a questo calcolo: solo le scene contano). Non legge le
 * posizioni Y effettive delle scene esistenti (che potrebbero essere state
 * spostate manualmente) - solo la somma delle loro altezze, uno "slot
 * successivo ideale", più semplice e senza effetti a catena se una scena
 * viene ridimensionata dopo la creazione delle successive.
 */
export function nextSceneOrigin(
  document: Document,
  pageId: PageId,
  activeBreakpoint: BreakpointName,
): { readonly x: number; readonly y: number } {
  let y = 0;
  for (const nodeId of sceneNodeIds(document, pageId)) {
    const node = document.nodes.get(nodeId);
    if (!node) continue;
    const resolvedHeight = resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps.height;
    y += asFiniteNumber(resolvedHeight) ?? FALLBACK_SCENE_HEIGHT;
  }
  return { x: 0, y };
}
