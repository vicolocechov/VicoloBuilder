import { useEffect, useMemo, useState } from "react";
import { computeLayout, resolveDocument } from "@vicolobuilder/engine";
import type { NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { dragCapabilities, flattenBoxes, type FlatBoxEntry } from "./flattenBoxes.js";
import { computeAlignmentSnap, type AxisGuide } from "./alignmentGuides.js";
import { buildUpdatePropsCommand } from "../write/buildUpdatePropsCommand.js";
import { asFiniteNumber } from "../asFiniteNumber.js";
import { PREVIEW_SIZE } from "../previewSize.js";

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
  const [guides, setGuides] = useState<{ x: AxisGuide | null; y: AxisGuide | null }>({ x: null, y: null });
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null);
  const [resizeDelta, setResizeDelta] = useState({ dx: 0, dy: 0 });

  // Fase 8 (analisi MOVE_NODE, Punto 6 - Opzione B, azione esplicita
  // minima): "Sposta dentro" è un'azione a due click, non un
  // drag-and-drop - seleziona la sorgente, poi clicca il contenitore di
  // destinazione. Stato locale del Canvas, come gli altri gesti di
  // editing (moveDrag/resizeDrag): non è stato di sessione al livello di
  // selection/activeBreakpoint, è transitorio a un singolo gesto utente.
  const [moveSourceId, setMoveSourceId] = useState<NodeId | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const model = useMemo(() => resolveDocument(document, { breakpoint: activeBreakpoint }), [document, activeBreakpoint]);
  const previewSize = PREVIEW_SIZE[activeBreakpoint] ?? { width: 1600, height: 900 };
  const viewportWidth = previewSize.width;
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
  //
  // Guide di allineamento (solo allo spostamento, come da paletto dato):
  // `entries` è stabile per tutta la durata del gesto (il Document non
  // cambia finché non si esegue il comando al pointerup), quindi calcolare
  // qui una volta sola l'entry trascinata/i fratelli/il contenitore è
  // corretto anche se l'effect non viene ricreato a ogni pointermove.
  useEffect(() => {
    if (!moveDrag) return;
    const draggedEntry = entries.find((e) => e.box.nodeId === moveDrag.nodeId) ?? null;
    const container = draggedEntry?.parentBox ?? null;
    const siblings =
      draggedEntry && container
        ? entries.filter((e) => e.parentBox === container && e.box.nodeId !== draggedEntry.box.nodeId).map((e) => e.box)
        : [];

    function snappedPosition(rawDx: number, rawDy: number) {
      if (!draggedEntry || !container) {
        return { x: rawDx, y: rawDy, guideX: null as AxisGuide | null, guideY: null as AxisGuide | null };
      }
      const dragged = {
        x: draggedEntry.box.x + rawDx,
        y: draggedEntry.box.y + rawDy,
        width: draggedEntry.box.width,
        height: draggedEntry.box.height,
      };
      return computeAlignmentSnap(dragged, siblings, container);
    }

    function onMove(e: PointerEvent): void {
      const rawDx = e.clientX - moveDrag!.startClientX;
      const rawDy = e.clientY - moveDrag!.startClientY;
      const snapped = snappedPosition(rawDx, rawDy);
      const anchorX = draggedEntry?.box.x ?? 0;
      const anchorY = draggedEntry?.box.y ?? 0;
      setMoveDelta({ dx: snapped.x - anchorX, dy: snapped.y - anchorY });
      setGuides({ x: snapped.guideX, y: snapped.guideY });
    }
    function onUp(e: PointerEvent): void {
      const rawDx = e.clientX - moveDrag!.startClientX;
      const rawDy = e.clientY - moveDrag!.startClientY;
      const snapped = snappedPosition(rawDx, rawDy);
      const anchorX = draggedEntry?.box.x ?? 0;
      const anchorY = draggedEntry?.box.y ?? 0;
      const dx = snapped.x - anchorX;
      const dy = snapped.y - anchorY;
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        const command = buildUpdatePropsCommand(store.getDocument(), moveDrag!.nodeId, store.getActiveBreakpoint(), {
          x: moveDrag!.startLocalX + dx,
          y: moveDrag!.startLocalY + dy,
        });
        store.execute(command);
      }
      setMoveDrag(null);
      setMoveDelta({ dx: 0, dy: 0 });
      setGuides({ x: null, y: null });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveDrag, store, entries]);

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
    // Fase 10: stringa CSS opaca (es. "clamp(16px, 2vw, 24px)") - nessuna
    // interpretazione qui, solo passata a `style.fontSize` così com'è
    // (stesso trattamento di `color`). Fallback al valore fisso preesistente
    // se il nodo non ha il prop (documenti creati prima di questa fase).
    const fontSize = typeof resolvedNode.resolvedProps.fontSize === "string" ? resolvedNode.resolvedProps.fontSize : 12;

    return (
      <div
        key={entry.box.nodeId}
        data-node-id={entry.box.nodeId}
        onClick={(e) => {
          e.stopPropagation();
          if (moveSourceId !== null) {
            // Un secondo click sulla sorgente stessa annulla (oltre al
            // pulsante "Annulla" della barra di stato) - scorciatoia, non
            // l'unico modo di uscire dalla modalità.
            if (moveSourceId === entry.box.nodeId) {
              setMoveSourceId(null);
              return;
            }
            try {
              store.execute({ type: "MOVE_NODE", nodeId: moveSourceId, newParentId: entry.box.nodeId });
              setMoveError(null);
            } catch (err) {
              // Fase 8 (analisi MOVE_NODE, Punto 2): un tentativo non valido
              // (es. il bersaglio è un discendente della sorgente) è
              // respinto da CommandError - qui va solo mostrato, non
              // rilanciato (a differenza del resto del Canvas, che oggi non
              // intercetta mai gli errori di store.execute - qui serve,
              // perché il bersaglio è scelto dall'utente via click e un
              // errore è un esito plausibile, non un bug).
              setMoveError(err instanceof Error ? err.message : String(err));
            }
            setMoveSourceId(null);
            return;
          }
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
          fontSize,
          padding: 4,
        }}
      >
        {text}
        {isSelected && moveSourceId === null && entry.parentBox !== null ? (
          // `entry.parentBox !== null` esclude la radice della pagina: non
          // spostabile (Engine: MOVE_NODE rifiuta un nodo con parentId
          // null), meglio non offrire l'azione che farla fallire.
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMoveSourceId(entry.box.nodeId);
              setMoveError(null);
            }}
            style={{
              position: "absolute",
              top: -22,
              left: 0,
              fontSize: 10,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            Sposta dentro…
          </button>
        ) : null}
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
    <>
      {moveSourceId !== null ? (
        <div style={{ marginBottom: 8, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            Sposto <code>{moveSourceId}</code>: clicca il contenitore di destinazione (clicca di nuovo l&apos;elemento
            per annullare).
          </span>
          <button onClick={() => setMoveSourceId(null)}>Annulla</button>
        </div>
      ) : null}
      {moveError ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: "#b91c1c", display: "flex", gap: 8, alignItems: "center" }}>
          <span>Spostamento non riuscito: {moveError}</span>
          <button onClick={() => setMoveError(null)}>OK</button>
        </div>
      ) : null}
      <div
        onClick={() => {
          if (moveSourceId !== null) {
            setMoveSourceId(null);
            return;
          }
          store.deselect();
        }}
        style={{
          position: "relative",
          width: viewportWidth,
          height: Math.max(box.height, previewSize.height),
          background: "#ffffff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        }}
      >
        {entries.map(renderBox)}
        {/* Linee guida: attraversano l'intero Canvas per semplicità di
            rendering - lo snap che le genera resta comunque limitato a
            fratelli + centro del contenitore libero immediato (vedi
            alignmentGuides.ts), solo l'estensione visiva della linea è
            semplificata. */}
        {guides.x ? (
          <div
            style={{
              position: "absolute",
              left: guides.x.position,
              top: 0,
              width: 1,
              height: "100%",
              background: "#ec4899",
              pointerEvents: "none",
            }}
          />
        ) : null}
        {guides.y ? (
          <div
            style={{
              position: "absolute",
              top: guides.y.position,
              left: 0,
              height: 1,
              width: "100%",
              background: "#ec4899",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    </>
  );
}
