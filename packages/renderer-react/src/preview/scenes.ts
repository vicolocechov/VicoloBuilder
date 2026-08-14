import { getPage } from "@vicolobuilder/engine";
import type { Document, NodeId, PageId } from "@vicolobuilder/engine";

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
