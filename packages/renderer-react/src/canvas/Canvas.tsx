import { useEffect, useMemo, useState } from "react";
import { computeLayout, resolveDocument } from "@vicolobuilder/engine";
import type { BreakpointName, NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { dragCapabilities, flattenBoxes, type FlatBoxEntry } from "./flattenBoxes.js";
import { buildUpdatePropsCommand } from "../write/buildUpdatePropsCommand.js";
import { asFiniteNumber } from "../asFiniteNumber.js";

/**
 * Larghezza di anteprima per fascia (Fase 5, Blocco D). Non è la stessa
 * cosa della "device preview" descritta in PRODUCT_DESIGN.md sez. 10 (che
 * resta un dato UI puro, non ancora costruito): qui è solo il numero che
 * serve a `computeLayout` per calcolare qualcosa di visibile per ciascuna
 * delle 3 fasce salvate. Costante locale, non una nuova decisione di
 * prodotto - segnalata come tale.
 */
const PREVIEW_WIDTH: Record<BreakpointName, number> = { mobile: 375, tablet: 834, desktop: 1280 };

/**
 * Un semplice click (pointerdown+pointerup nello stesso punto, per
 * selezionare) attraversa comunque `onPointerDown` quando il box è
 * trascinabile: senza questa soglia, ogni click produrrebbe un comando
 * UPDATE_PROPS a delta zero - un'entry di undo inutile e, se la vista
 * attiva non è la fascia base, anche una scrittura/congelamento
 * responsive indesiderati. Trovato testando l'app in un browser reale
 * (non dai test unitari, che non simulano il pointer), non dal piano.
 */
const DRAG_THRESHOLD_PX = 2;

interface MoveDrag {
  readonly nodeId: NodeId;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startLocalX: number;
  readonly startLocalY: number;
}

interface ResizeDrag {
  readonly nodeId: NodeId;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startWidth: number;
  readonly startHeight: number;
  readonly resizeWidth: boolean;
  readonly resizeHeight: boolean;
}

export function Canvas({ store, pageId }: { store: ReactiveHistory; pageId?: PageId }): JSX.Element {
  const document = useDocument(store);
  const activeBreakpoint = useActiveBreakpoint(store);
  const selection = useSelection(store);

  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null);
  const [moveDelta, setMoveDelta] = useState({ dx: 0, dy: 0 });
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null);
  const [resizeDelta, setResizeDelta] = useState({ dx: 0, dy: 0 });

  const model = useMemo(() => resolveDocument(document, { breakpoint: activeBreakpoint }), [document, activeBreakpoint]);
  const viewportWidth = PREVIEW_WIDTH[activeBreakpoint] ?? 1280;
  // Fase 5, Blocco E: `pageId` opzionale (già supportato da computeLayout,
  // non usato finora) - se assente, invariato rispetto al Blocco D
  // (computeLayout ricade sulla pagina radice del ResolvedModel).
  const box = useMemo(
    () => computeLayout(model, pageId !== undefined ? { pageId, viewportWidth } : { viewportWidth }),
    [model, pageId, viewportWidth],
  );
  const entries = useMemo(() => flattenBoxes(box), [box]);

  // Decisione D2: il gesto intero vive in stato locale del Canvas (mai in
  // Document/History) e produce un solo comando UPDATE_PROPS al rilascio
  // del puntatore (pointerup), non uno per pointermove.
  useEffect(() => {
    if (!moveDrag) return;
    function onMove(e: PointerEvent): void {
      setMoveDelta({ dx: e.clientX - moveDrag!.startClientX, dy: e.clientY - moveDrag!.startClientY });
    }
    function onUp(e: PointerEvent): void {
      const dx = e.clientX - moveDrag!.startClientX;
      const dy = e.clientY - moveDrag!.startClientY;
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        const command = buildUpdatePropsCommand(store.getDocument(), moveDrag!.nodeId, store.getActiveBreakpoint(), {
          x: moveDrag!.startLocalX + dx,
          y: moveDrag!.startLocalY + dy,
        });
        store.execute(command);
      }
      setMoveDrag(null);
      setMoveDelta({ dx: 0, dy: 0 });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveDrag, store]);

  useEffect(() => {
    if (!resizeDrag) return;
    function onMove(e: PointerEvent): void {
      setResizeDelta({ dx: e.clientX - resizeDrag!.startClientX, dy: e.clientY - resizeDrag!.startClientY });
    }
    function onUp(e: PointerEvent): void {
      const dx = e.clientX - resizeDrag!.startClientX;
      const dy = e.clientY - resizeDrag!.startClientY;
      const changed: Record<string, unknown> = {};
      if (resizeDrag!.resizeWidth && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
        changed.width = Math.max(1, resizeDrag!.startWidth + dx);
      }
      if (resizeDrag!.resizeHeight && Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        changed.height = Math.max(1, resizeDrag!.startHeight + dy);
      }
      if (Object.keys(changed).length > 0) {
        const command = buildUpdatePropsCommand(
          store.getDocument(),
          resizeDrag!.nodeId,
          store.getActiveBreakpoint(),
          changed,
        );
        store.execute(command);
      }
      setResizeDrag(null);
      setResizeDelta({ dx: 0, dy: 0 });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizeDrag, store]);

  function renderBox(entry: FlatBoxEntry): JSX.Element {
    const resolvedNode = model.nodes.get(entry.box.nodeId);
    if (!resolvedNode) throw new Error(`Canvas: nodo risolto non trovato: ${entry.box.nodeId}`);
    const isLeaf = resolvedNode.childrenIds.length === 0;
    const caps = dragCapabilities(entry, isLeaf);
    const isSelected = selection === entry.box.nodeId;

    let x = entry.box.x;
    let y = entry.box.y;
    let width = entry.box.width;
    let height = entry.box.height;

    if (moveDrag && moveDrag.nodeId === entry.box.nodeId) {
      x += moveDelta.dx;
      y += moveDelta.dy;
    }
    if (resizeDrag && resizeDrag.nodeId === entry.box.nodeId) {
      if (resizeDrag.resizeWidth) width = Math.max(1, resizeDrag.startWidth + resizeDelta.dx);
      if (resizeDrag.resizeHeight) height = Math.max(1, resizeDrag.startHeight + resizeDelta.dy);
    }

    const backgroundColor = typeof resolvedNode.resolvedProps.color === "string" ? resolvedNode.resolvedProps.color : undefined;
    const text = typeof resolvedNode.resolvedProps.text === "string" ? resolvedNode.resolvedProps.text : null;

    return (
      <div
        key={entry.box.nodeId}
        data-node-id={entry.box.nodeId}
        onClick={(e) => {
          e.stopPropagation();
          store.select(entry.box.nodeId);
        }}
        onPointerDown={(e) => {
          if (!caps.canMoveXY) return;
          e.stopPropagation();
          const startLocalX = asFiniteNumber(resolvedNode.resolvedProps.x) ?? 0;
          const startLocalY = asFiniteNumber(resolvedNode.resolvedProps.y) ?? 0;
          setMoveDrag({
            nodeId: entry.box.nodeId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startLocalX,
            startLocalY,
          });
        }}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          boxSizing: "border-box",
          border: isSelected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.15)",
          background: backgroundColor ?? "transparent",
          cursor: caps.canMoveXY ? "move" : "default",
          userSelect: "none",
          fontSize: 12,
          padding: 4,
        }}
      >
        {text}
        {isSelected && (caps.canResizeWidth || caps.canResizeHeight) ? (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              setResizeDrag({
                nodeId: entry.box.nodeId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startWidth: asFiniteNumber(resolvedNode.resolvedProps.width) ?? entry.box.width,
                startHeight: asFiniteNumber(resolvedNode.resolvedProps.height) ?? entry.box.height,
                resizeWidth: caps.canResizeWidth,
                resizeHeight: caps.canResizeHeight,
              });
            }}
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 8,
              height: 8,
              background: "#2563eb",
              cursor: "nwse-resize",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      onClick={() => store.deselect()}
      style={{
        position: "relative",
        width: viewportWidth,
        height: Math.max(box.height, 40),
        background: "#ffffff",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
      }}
    >
      {entries.map(renderBox)}
    </div>
  );
}
