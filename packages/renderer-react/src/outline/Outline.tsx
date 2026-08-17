import { getNode, getPage } from "@vicolobuilder/engine";
import type { Document, NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useDocument, useSelection } from "../history/useHistoryStore.js";

/**
 * Blocco 3, Punto 3 (audit Builder UI/UX): outline MINIMO - solo struttura
 * ad albero per navigare/selezionare (click = `store.select`), nessuna
 * azione aggiuntiva (niente drag/duplica/elimina qui - quello resta nel
 * Canvas/nella toolbar globale già esistenti, decisione esplicita del
 * proprietario del prodotto: "non un pannello complesso con azioni
 * aggiuntive"). Sempre completamente espanso, nessun collassa/espandi: un
 * albero di una pagina reale non è mai abbastanza profondo da giustificare
 * quella complessità in più.
 */
function OutlineRow({
  document,
  nodeId,
  depth,
  selection,
  onSelect,
}: {
  readonly document: Document;
  readonly nodeId: NodeId;
  readonly depth: number;
  readonly selection: NodeId | null;
  readonly onSelect: (nodeId: NodeId) => void;
}): JSX.Element | null {
  const node = getNode(document, nodeId);
  if (!node) return null;
  const isSelected = selection === nodeId;

  return (
    <>
      <div
        onClick={() => onSelect(nodeId)}
        title={nodeId}
        data-outline-row={nodeId}
        style={{
          paddingLeft: 8 + depth * 12,
          paddingTop: 2,
          paddingBottom: 2,
          cursor: "pointer",
          background: isSelected ? "#dbeafe" : "transparent",
          fontWeight: isSelected ? "bold" : "normal",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.type} <span style={{ opacity: 0.6 }}>({nodeId})</span>
      </div>
      {node.childrenIds.map((childId) => (
        <OutlineRow
          key={childId}
          document={document}
          nodeId={childId}
          depth={depth + 1}
          selection={selection}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function Outline({
  store,
  activePageId,
}: {
  readonly store: ReactiveHistory;
  readonly activePageId: PageId;
}): JSX.Element {
  const document = useDocument(store);
  const selection = useSelection(store);
  const page = getPage(document, activePageId);

  return (
    <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
      <div style={{ fontWeight: "bold", marginBottom: 6 }}>Struttura</div>
      {page ? (
        <OutlineRow
          document={document}
          nodeId={page.rootNodeId}
          depth={0}
          selection={selection}
          onSelect={(nodeId) => store.select(nodeId)}
        />
      ) : (
        <span style={{ opacity: 0.6 }}>Nessuna pagina attiva.</span>
      )}
    </div>
  );
}
