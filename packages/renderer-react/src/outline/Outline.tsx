import { getNode, getPage, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, Document, DocumentNode, NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";

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

/**
 * Blocco 6 (rifinitura UI/UX, Punto 3 dell'audit): l'outline mostrava
 * `node.type` grezzo del Document ("box", "text", "page-root"...), diverso
 * dall'etichetta che l'utente ha effettivamente cliccato nella palette
 * (`ElementPalette.tsx`) - es. "+ Contenitore" crea un nodo "box", ma
 * l'outline mostrava "box". Mappatura di SOLA presentazione: non tocca
 * `node.type` nel Document Model (resterebbe "box"/"text"/... per ogni
 * consumer esistente, Engine incluso) - solo l'etichetta mostrata qui.
 *
 * "box" da solo è ambiguo: sia "+ Contenitore" sia "+ Griglia" producono
 * `nodeType:"box"` (si distinguono solo da `layoutMode`, vedi
 * `createElementCommand.ts`) - serve risolvere il nodo alla fascia attiva
 * per disambiguare (un override responsive di layoutMode va rispettato,
 * stesso principio già usato da `resolveNewElementParent`/da `isGrid` nel
 * PropertyPanel).
 */
const NODE_TYPE_LABELS: Readonly<Record<string, string>> = {
  text: "Testo",
  h1: "H1",
  h2: "H2",
  h3: "H3",
  paragraph: "Paragrafo",
  link: "Link",
  image: "Immagine",
  scene: "Scena",
  // Nessun bottone della palette crea questo tipo (è la radice di ogni
  // pagina, creata da `PageManager.tsx`) - etichetta propria, non "box".
  "page-root": "Pagina",
};

function outlineLabel(node: DocumentNode, activeBreakpoint: BreakpointName): string {
  if (node.type === "box") {
    const resolvedMode = resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps.layoutMode;
    return resolvedMode === "griglia" ? "Griglia" : "Contenitore";
  }
  return NODE_TYPE_LABELS[node.type] ?? node.type;
}

function OutlineRow({
  document,
  nodeId,
  depth,
  selection,
  activeBreakpoint,
  onSelect,
}: {
  readonly document: Document;
  readonly nodeId: NodeId;
  readonly depth: number;
  readonly selection: NodeId | null;
  readonly activeBreakpoint: BreakpointName;
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
        {outlineLabel(node, activeBreakpoint)} <span style={{ opacity: 0.6 }}>({nodeId})</span>
      </div>
      {node.childrenIds.map((childId) => (
        <OutlineRow
          key={childId}
          document={document}
          nodeId={childId}
          depth={depth + 1}
          selection={selection}
          activeBreakpoint={activeBreakpoint}
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
  const activeBreakpoint = useActiveBreakpoint(store);
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
          activeBreakpoint={activeBreakpoint}
          onSelect={(nodeId) => store.select(nodeId)}
        />
      ) : (
        <span style={{ opacity: 0.6 }}>Nessuna pagina attiva.</span>
      )}
    </div>
  );
}
