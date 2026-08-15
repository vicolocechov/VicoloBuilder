import { getPage } from "@vicolobuilder/engine";
import type { PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { uniqueId } from "../pages/pageIds.js";
import { buildCreateElementCommand, elementIdBase, resolveNewElementParent, type ElementType } from "./createElementCommand.js";

export function ElementPalette({ store, activePageId }: { readonly store: ReactiveHistory; readonly activePageId: PageId }): JSX.Element {
  const document = useDocument(store);
  const activeBreakpoint = useActiveBreakpoint(store);
  const selection = useSelection(store);

  function handleAdd(elementType: ElementType): void {
    const page = getPage(document, activePageId);
    if (!page) return;

    // Fase 7: una "scena" (Punto 1, Opzione B) va sempre figlia diretta
    // della radice pagina - il motore di navigazione (preview/scenes.ts)
    // legge solo `childrenIds` della radice, mai annidamenti più profondi.
    // A differenza di "testo"/"contenitore", ignora quindi la selezione
    // corrente invece di passare da `resolveNewElementParent`.
    const parentId =
      elementType === "scene" ? page.rootNodeId : resolveNewElementParent(document, page.rootNodeId, selection, activeBreakpoint);
    const nodeId = uniqueId(elementIdBase(elementType), new Set(document.nodes.keys()));
    store.execute(buildCreateElementCommand(elementType, nodeId, parentId));
    // Approvato: il nuovo elemento diventa la selezione attiva, stesso
    // pattern già usato per una pagina appena creata (PageManager.tsx).
    store.select(nodeId);
  }

  return (
    <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
      <button onClick={() => handleAdd("text")}>+ Testo</button>
      <button onClick={() => handleAdd("container")}>+ Contenitore</button>
      <button onClick={() => handleAdd("scene")}>+ Scena</button>
      <button onClick={() => handleAdd("griglia")}>+ Griglia</button>
      <button onClick={() => handleAdd("h1")}>+ H1</button>
      <button onClick={() => handleAdd("h2")}>+ H2</button>
      <button onClick={() => handleAdd("h3")}>+ H3</button>
      <button onClick={() => handleAdd("paragraph")}>+ Paragrafo</button>
      <button onClick={() => handleAdd("link")}>+ Link</button>
      <button onClick={() => handleAdd("image")}>+ Immagine</button>
    </div>
  );
}
