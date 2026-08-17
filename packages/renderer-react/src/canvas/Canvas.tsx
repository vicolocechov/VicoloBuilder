import { Fragment, useEffect, useMemo, useState } from "react";
import type { ElementType, MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { computeLayout, resolveDocument } from "@vicolobuilder/engine";
import type { NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { dragCapabilities, flattenBoxes, type FlatBoxEntry } from "./flattenBoxes.js";
import { computeAlignmentSnap, type AxisGuide } from "./alignmentGuides.js";
import { buildUpdatePropsCommand } from "../write/buildUpdatePropsCommand.js";
import { asFiniteNumber } from "../asFiniteNumber.js";
import { PREVIEW_SIZE, htmlTagFor } from "@vicolobuilder/render-conventions";
import { isTextBearingType } from "../elements/textBearingTypes.js";

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

  // Blocco 1 (audit Builder UI/UX): il bordo 1px onnipresente su ogni
  // elemento non selezionato rendeva ogni tipo (testo, immagine, link...)
  // visivamente indistinguibile da un rettangolo generico. Sostituito da
  // un evidenziamento solo on-hover - stato locale del Canvas, stessa
  // natura di moveDrag/resizeDrag (transitorio a un singolo elemento sotto
  // il puntatore, mai in Document/History).
  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);

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
    // Fase 9, Punto 4: tag HTML reale in base a `type` (h1/h2/h3/p/a),
    // fallback a "div" per ogni altro tipo (comportamento invariato).
    // Fase 15: "image" -> "img", primo tag void di questo elenco.
    const Tag = htmlTagFor(resolvedNode.type) as ElementType;
    const href = typeof resolvedNode.resolvedProps.href === "string" ? resolvedNode.resolvedProps.href : undefined;
    const src = typeof resolvedNode.resolvedProps.src === "string" ? resolvedNode.resolvedProps.src : undefined;
    const alt = typeof resolvedNode.resolvedProps.alt === "string" ? resolvedNode.resolvedProps.alt : "";
    // Fase 15, Punto 4: stringa CSS opaca (es. "cover"/"contain"), stesso
    // trattamento di `fontSize` - fallback "cover" se il nodo non ha il
    // prop. Applicato incondizionatamente nello style: il browser lo
    // ignora sui tag che non sono "img", nessuna eccezione necessaria qui.
    const objectFit = typeof resolvedNode.resolvedProps.objectFit === "string" ? resolvedNode.resolvedProps.objectFit : "cover";
    // Fase 16: stesso trattamento di `fontSize` - stringa opaca passata a
    // `style.fontFamily`/`style.fontWeight`, nessun fallback fisso (a
    // differenza di `fontSize`/`objectFit`, l'assenza del prop deve
    // lasciare il browser libero di usare il proprio font di default, non
    // un valore inventato).
    const fontFamily = typeof resolvedNode.resolvedProps.fontFamily === "string" ? resolvedNode.resolvedProps.fontFamily : undefined;
    const fontWeight = typeof resolvedNode.resolvedProps.fontWeight === "string" ? resolvedNode.resolvedProps.fontWeight : undefined;
    // B2 (identificatore stabile per ancore interne, Opzione C): un vero
    // attributo HTML `id=`, separato da `data-node-id` (che resta lo
    // sganciamento interno usato dal drag/dall'overlay/da `useHoverStyles`
    // - non toccato). Applicato su QUALUNQUE tag (nessuna condizione di
    // tipo, coerente con l'ambito deciso in B2), solo quando l'autore ha
    // scelto un valore non vuoto - un `id=""` sarebbe un attributo HTML
    // presente ma privo di senso, peggio che ometterlo del tutto.
    const anchorId =
      typeof resolvedNode.resolvedProps.anchorId === "string" && resolvedNode.resolvedProps.anchorId !== ""
        ? resolvedNode.resolvedProps.anchorId
        : undefined;

    // Blocco 1 (audit Builder UI/UX, Punto 1): un elemento che porta testo
    // (isTextBearingType) o un'immagine non deve avere alcun bordo/sfondo
    // di editing di default - deve "sembrare" testo o un'immagine, non un
    // rettangolo. Un contenitore (tutto il resto: box/griglia/scena/radice
    // pagina) resta invece percepibile anche vuoto e senza sfondo esplicito
    // scelto dall'autore, altrimenti sarebbe invisibile nel Canvas.
    const isTextBearing = isTextBearingType(resolvedNode.type);
    const isImage = Tag === "img";
    const isContainerLike = !isTextBearing && !isImage;
    const isHovered = hoveredId === entry.box.nodeId;

    let border: string;
    if (isSelected) {
      border = "2px solid #2563eb";
    } else if (isContainerLike) {
      border = isHovered ? "1px dashed rgba(37,99,235,0.7)" : "1px dashed rgba(0,0,0,0.2)";
    } else {
      border = isHovered ? "1px solid rgba(37,99,235,0.4)" : "none";
    }
    const background = backgroundColor ?? (isContainerLike ? "rgba(37,99,235,0.03)" : "transparent");

    return (
      // Fase 15 (Punto 1, analisi - Opzione A): l'overlay di selezione
      // ("Sposta dentro…" + maniglia di ridimensionamento) è un FRATELLO
      // del tag renderizzato, non un figlio - un `Tag` può essere un void
      // element ("img"), che in React non può avere children. Prima di
      // questa fase l'overlay era annidato dentro `Tag` (che è esso
      // stesso `position:absolute`, quindi il contenitore di
      // posizionamento naturale per figli assoluti); come fratelli,
      // l'overlay usa le stesse coordinate locali `x`/`y`/`width`/`height`
      // già calcolate sopra, sommando manualmente l'offset che prima
      // veniva dal posizionamento relativo al genitore.
      <Fragment key={entry.box.nodeId}>
        <Tag
          data-node-id={entry.box.nodeId}
          id={anchorId}
          href={Tag === "a" ? href : undefined}
          src={Tag === "img" ? src : undefined}
          alt={Tag === "img" ? alt : undefined}
          // Fix dedicato (fuori da Fase 17, segnalato in D-030): `<a>` e
          // `<img>` sono nativamente trascinabili nel browser
          // (`element.draggable === true` di default) - un gesto di
          // trascinamento con puntatore su uno di questi tag innesca il
          // drag-and-drop nativo HTML5 (`dragstart`), che intercetta parte
          // della sequenza di eventi prima che il nostro `onPointerDown`/
          // `pointermove` la riceva per intero, troncando lo spostamento
          // (trovato verificando in browser un delta di 300px ridotto a
          // 38px). Applicato incondizionatamente: innocuo sui tag già non
          // trascinabili di default (div/h1/h2/h3/p), nessuna eccezione
          // per tipo necessaria.
          draggable={false}
          onClick={(e: MouseEvent<HTMLElement>) => {
            // Fase 9, Punto 5: un <a> nell'editor non deve mai navigare -
            // selezionarlo/spostarlo deve restare dentro l'editor. Innocuo per
            // ogni altro tag (nessun comportamento di default da prevenire).
            e.preventDefault();
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
          onMouseEnter={() => setHoveredId(entry.box.nodeId)}
          onMouseLeave={() => setHoveredId((current) => (current === entry.box.nodeId ? null : current))}
          onPointerDown={(e: ReactPointerEvent<HTMLElement>) => {
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
            border,
            background,
            cursor: caps.canMoveXY ? "move" : "default",
            userSelect: "none",
            fontSize,
            fontFamily,
            fontWeight,
            padding: 4,
            objectFit,
          }}
        >
          {Tag === "img" ? null : text}
        </Tag>
        {isSelected && moveSourceId === null && entry.parentBox !== null ? (
          // `entry.parentBox !== null` esclude la radice della pagina: non
          // spostabile (Engine: MOVE_NODE rifiuta un nodo con parentId
          // null), meglio non offrire l'azione che farla fallire.
          <button
            key={`${entry.box.nodeId}:move-into`}
            onClick={(e) => {
              // A differenza di prima (bottone annidato dentro `Tag`), qui
              // non serve più prevenire la navigazione nativa di un `Tag`
              // antenato (Fase 9, Punto 5) - il bottone non è più
              // discendente di `Tag`. `stopPropagation` resta necessario:
              // il contenitore del Canvas (sotto) deseleziona al click.
              e.preventDefault();
              e.stopPropagation();
              setMoveSourceId(entry.box.nodeId);
              setMoveError(null);
            }}
            style={{
              position: "absolute",
              left: x,
              top: y - 22,
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
            key={`${entry.box.nodeId}:resize-handle`}
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
            // Fase 15 (Punto 1): prima della ristrutturazione a fratelli, un
            // click su questa maniglia (mousedown+mouseup senza spostamento,
            // o l'evento "click" sintetico dopo un trascinamento) risaliva
            // comunque attraverso `Tag` - che lo assorbiva riselezionando
            // innocuamente lo stesso nodo (`onClick` di `Tag`, sopra). Come
            // fratello, `Tag` non è più un antenato: senza questo
            // `stopPropagation` il click risalirebbe fino al contenitore del
            // Canvas e deselezionerebbe il nodo subito dopo ogni
            // ridimensionamento (bug trovato verificando in browser durante
            // Fase 15, non dai test unitari - nessuno copre `Canvas.tsx`).
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: x + width - 4,
              top: y + height - 4,
              width: 8,
              height: 8,
              background: "#2563eb",
              cursor: "nwse-resize",
            }}
          />
        ) : null}
      </Fragment>
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
