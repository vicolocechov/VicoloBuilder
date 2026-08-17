import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  ElementType,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { collectSubtreeIds, computeLayout, resolveDocument } from "@vicolobuilder/engine";
import type { NodeId, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { dragCapabilities, flattenBoxes, type FlatBoxEntry } from "./flattenBoxes.js";
import { computeAlignmentSnap, type AxisGuide } from "./alignmentGuides.js";
import { computeDropTarget, type DropTarget } from "./dropTarget.js";
import { buildStructuralMoveCommand } from "./buildStructuralMoveCommand.js";
import { computeResizedGeometry, resizeHandles, type ResizeEdges, type ResizeStart } from "./resizeGeometry.js";
import { buildUpdatePropsCommand } from "../write/buildUpdatePropsCommand.js";
import { asFiniteNumber } from "../asFiniteNumber.js";
import { PREVIEW_SIZE, htmlTagFor } from "@vicolobuilder/render-conventions";
import { isContainerLikeType, isTextBearingType } from "../elements/textBearingTypes.js";

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
  // Blocco 4 (maniglie su più lati/angoli): geometria LOCALE (le props
  // x/y/width/height del nodo, non le coordinate assolute del Box) - serve
  // al comando finale (`buildUpdatePropsCommand` scrive props locali).
  readonly startLocal: ResizeStart;
  readonly edges: ResizeEdges;
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

  // Blocco 3 (drag-and-drop reale per riparent/riordino, sostituisce il
  // vecchio "Sposta dentro..." a due click, Fase 8): `structuralDrag` è il
  // gesto (avviato dalla maniglia dedicata sull'elemento selezionato),
  // `dropTarget` il bersaglio corrente ricalcolato ad ogni pointermove
  // (mai letto dentro l'effect che lo aggiorna - stessa cautela già
  // presente in `moveDrag`/`resizeDrag`: si ricalcola da zero anche al
  // pointerup, non si legge lo stato React per evitare una chiusura
  // stantia), `cursorClient` la posizione del puntatore in coordinate di
  // VIEWPORT (non locali al Canvas) per la piccola etichetta "ghost" che
  // segue il cursore durante il trascinamento. `moveError` riusato dal
  // vecchio flusso: stessa natura, "un tentativo di spostamento è fallito".
  const [structuralDrag, setStructuralDrag] = useState<{ nodeId: NodeId } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [cursorClient, setCursorClient] = useState<{ x: number; y: number } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const canvasRootRef = useRef<HTMLDivElement | null>(null);

  // Blocco 4 ("rifinitura visiva", editing testo diretto): quale nodo è
  // attualmente in modifica diretta (doppio click), al più uno per volta -
  // stessa natura locale/transitoria di `moveDrag`/`resizeDrag`/
  // `structuralDrag`. `cancelEditRef` distingue "Escape" (annulla, non
  // scrive nulla) da un blur normale (committa) senza dover tenere due
  // stati separati solo per quel flag booleano di un singolo gesto.
  const [editingId, setEditingId] = useState<NodeId | null>(null);
  const cancelEditRef = useRef(false);

  // Porta il fuoco/il cursore di testo sul nodo appena entrato in modifica -
  // necessario perché `contentEditable` diventa vero solo al PROSSIMO
  // render (lo stesso click che ha innescato il doppio click non basta a
  // renderlo già editabile e focalizzato nello stesso gesto). Cursore alla
  // fine del testo (non selezione totale): un editing rapido, non una
  // sostituzione integrale per forza.
  useEffect(() => {
    if (!editingId) return;
    const el = canvasRootRef.current?.querySelector<HTMLElement>(`[data-node-id="${editingId}"]`);
    if (!el) return;
    el.focus();
    const range = window.document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingId]);

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
      const { edges, startLocal } = resizeDrag!;
      // Ogni asse è verificato contro la soglia INDIPENDENTEMENTE (come
      // prima di questo blocco): un ridimensionamento verticale sotto
      // soglia non deve impedire un cambiamento orizzontale sopra soglia,
      // e viceversa - passare 0 sull'asse "spento" a `computeResizedGeometry`
      // isola i due calcoli senza duplicarne la logica.
      const changed: Record<string, unknown> = {};
      if ((edges.east || edges.west) && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
        const horizontal = computeResizedGeometry(startLocal, edges, dx, 0);
        changed.width = horizontal.width;
        if (horizontal.x !== undefined) changed.x = horizontal.x;
      }
      if ((edges.north || edges.south) && Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        const vertical = computeResizedGeometry(startLocal, edges, 0, dy);
        changed.height = vertical.height;
        if (vertical.y !== undefined) changed.y = vertical.y;
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

  // Blocco 3: il gesto di drag-and-drop strutturale. `entries`/`document`/
  // `model` sono stabili per tutta la durata del gesto (il Document non
  // cambia finché non si esegue il comando al pointerup, stesso principio
  // già sfruttato dall'effect di moveDrag) - calcolare qui una volta sola
  // l'insieme escluso (il nodo trascinato + i suoi discendenti, mai un
  // bersaglio valido: eviterebbe un ciclo) è corretto anche se l'effect non
  // viene ricreato ad ogni pointermove.
  useEffect(() => {
    if (!structuralDrag) return;
    const excluded = new Set(collectSubtreeIds(document, structuralDrag.nodeId));
    function canReceiveChildren(nodeId: NodeId): boolean {
      const resolvedNode = model.nodes.get(nodeId);
      return resolvedNode ? isContainerLikeType(resolvedNode.type) : false;
    }
    function localPoint(e: PointerEvent): { x: number; y: number } | null {
      const rect = canvasRootRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMove(e: PointerEvent): void {
      setCursorClient({ x: e.clientX, y: e.clientY });
      const local = localPoint(e);
      setDropTarget(local ? computeDropTarget(entries, excluded, canReceiveChildren, local.x, local.y) : null);
    }
    function onUp(e: PointerEvent): void {
      // Non si legge lo stato `dropTarget` (potenzialmente stantio in
      // questa chiusura, mai aggiornato dall'ultimo pointermove nella
      // stessa closure dell'effect): si ricalcola da zero sull'evento di
      // rilascio, stesso principio già usato da onUp di moveDrag/resizeDrag
      // (che ricalcolano dx/dy invece di leggere lo stato React).
      const local = localPoint(e);
      const target = local ? computeDropTarget(entries, excluded, canReceiveChildren, local.x, local.y) : null;
      if (target) {
        try {
          store.execute(buildStructuralMoveCommand(document, structuralDrag!.nodeId, target));
          setMoveError(null);
        } catch (err) {
          // Un bersaglio geometricamente valido può comunque essere
          // rifiutato dall'Engine (es. MULTIPLE_PARENTS impossibile per
          // costruzione qui, ma un ciclo residuo o un altro invariante) -
          // stesso trattamento del vecchio "Sposta dentro...": mostrato,
          // non rilanciato.
          setMoveError(err instanceof Error ? err.message : String(err));
        }
      }
      setStructuralDrag(null);
      setDropTarget(null);
      setCursorClient(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [structuralDrag, store, entries, document, model]);

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
      // Anteprima dal vivo in coordinate ASSOLUTE: `entry.box` qui è
      // ancora la geometria di PARTENZA (il Document non cambia finché il
      // comando non viene eseguito al rilascio) - stessa funzione pura del
      // comando finale, coordinate diverse (assolute invece che locali),
      // la formula è identica (una traslazione è lineare).
      const resized = computeResizedGeometry(entry.box, resizeDrag.edges, resizeDelta.dx, resizeDelta.dy);
      if (resized.width !== undefined) width = resized.width;
      if (resized.height !== undefined) height = resized.height;
      if (resized.x !== undefined) x = resized.x;
      if (resized.y !== undefined) y = resized.y;
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
    // Blocco 2: stesso trattamento di fontFamily/fontWeight - stringa CSS
    // opaca, nessun fallback fisso (l'assenza lascia il browser libero di
    // usare il proprio default, "left" in LTR).
    const textAlign = typeof resolvedNode.resolvedProps.textAlign === "string" ? resolvedNode.resolvedProps.textAlign : undefined;
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
    const isContainerLike = isContainerLikeType(resolvedNode.type);
    const isHovered = hoveredId === entry.box.nodeId;

    // Blocco 4 (audit Builder UI/UX, "rifinitura visiva"): bordo scelto
    // dall'autore (tre proprietà, non una stringa CSS opaca - coerente con
    // la direzione presa nel Blocco 2). A riposo (non selezionato, non in
    // hover) il bordo dell'autore, se impostato, PREVALE sul bordo di
    // editing del Blocco 1 (tratteggio del contenitore vuoto/nessun bordo
    // sul testo) - selezione e hover restano invece SEMPRE gli stessi
    // dell'editor, indipendentemente dal bordo dell'autore: sono affordance
    // dell'editor, non contenuto, e devono restare riconoscibili allo
    // stesso modo su ogni elemento.
    const authorBorderWidth = asFiniteNumber(resolvedNode.resolvedProps.borderWidth);
    const authorBorderColor =
      typeof resolvedNode.resolvedProps.borderColor === "string" ? resolvedNode.resolvedProps.borderColor : undefined;
    const authorBorderStyle =
      typeof resolvedNode.resolvedProps.borderStyle === "string" ? resolvedNode.resolvedProps.borderStyle : undefined;
    const hasAuthorBorder = authorBorderWidth !== undefined && authorBorderWidth > 0;

    let border: string;
    if (isSelected) {
      border = "2px solid #2563eb";
    } else if (isHovered) {
      border = isContainerLike ? "1px dashed rgba(37,99,235,0.7)" : "1px solid rgba(37,99,235,0.4)";
    } else if (hasAuthorBorder) {
      border = `${authorBorderWidth}px ${authorBorderStyle ?? "solid"} ${authorBorderColor ?? "#000000"}`;
    } else if (isContainerLike) {
      border = "1px dashed rgba(0,0,0,0.2)";
    } else {
      border = "none";
    }
    const background = backgroundColor ?? (isContainerLike ? "rgba(37,99,235,0.03)" : "transparent");
    // Proprietà visive pure (Blocco 4): non toccano geometria/posizione,
    // solo pittura dentro il box già calcolato dall'Engine - stesso
    // principio già rispettato dal bordo di editing sopra.
    const borderRadius = asFiniteNumber(resolvedNode.resolvedProps.borderRadius) ?? 0;
    const opacity = asFiniteNumber(resolvedNode.resolvedProps.opacity) ?? 1;
    // Sostituisce il valore fisso 4px preesistente (Fase 5/9/15): stesso
    // fallback quando l'autore non ha ancora impostato nulla, nessun
    // cambio visivo per i documenti già esistenti.
    const padding = asFiniteNumber(resolvedNode.resolvedProps.padding) ?? 4;

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
            store.select(entry.box.nodeId);
          }}
          onDoubleClick={(e: MouseEvent<HTMLElement>) => {
            // Blocco 4: editing testo diretto - solo sui tipi che portano
            // testo (stessa condizione già usata per fontSize/fontFamily/
            // textAlign nel PropertyPanel). Un contenitore/un'immagine non
            // hanno un "testo proprio" da modificare qui.
            if (!isTextBearing) return;
            e.preventDefault();
            e.stopPropagation();
            setEditingId(entry.box.nodeId);
          }}
          contentEditable={editingId === entry.box.nodeId}
          suppressContentEditableWarning={editingId === entry.box.nodeId}
          onBlur={(e: FocusEvent<HTMLElement>) => {
            if (editingId !== entry.box.nodeId) return;
            const cancelled = cancelEditRef.current;
            cancelEditRef.current = false;
            setEditingId(null);
            if (cancelled) return;
            const newText = e.currentTarget.textContent ?? "";
            if (newText === text) return;
            store.execute(
              buildUpdatePropsCommand(store.getDocument(), entry.box.nodeId, store.getActiveBreakpoint(), { text: newText }),
            );
          }}
          onKeyDown={(e: ReactKeyboardEvent<HTMLElement>) => {
            if (editingId !== entry.box.nodeId) return;
            // Non deve MAI raggiungere la scorciatoia globale
            // Canc/Backspace di App.tsx (cancella l'elemento selezionato) -
            // `isEditableTarget` lì controlla già `target.isContentEditable`
            // (garanzia B3, verificata esplicitamente in questo blocco, non
            // solo assunta), quindi un carattere cancellato qui non
            // propaga oltre come cancellazione dell'elemento. "Invio"
            // committa (senza inserire un a-capo, i nodi di testo di
            // questo nucleo sono monolinea); "Esc" annulla, ripristinando
            // il testo originale.
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEditRef.current = true;
              e.currentTarget.blur();
            }
          }}
          onMouseEnter={() => setHoveredId(entry.box.nodeId)}
          onMouseLeave={() => setHoveredId((current) => (current === entry.box.nodeId ? null : current))}
          onPointerDown={(e: ReactPointerEvent<HTMLElement>) => {
            // In modifica: il testo gestisce da sé il posizionamento del
            // cursore/la selezione nativa - un trascinamento avviato qui
            // sposterebbe l'elemento invece di posizionare il cursore.
            if (editingId === entry.box.nodeId) return;
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
            textAlign,
            padding,
            objectFit,
            borderRadius,
            opacity,
          }}
        >
          {Tag === "img" ? null : text}
        </Tag>
        {isSelected && structuralDrag === null && entry.parentBox !== null ? (
          // Blocco 3: sostituisce il vecchio bottone "Sposta dentro..." a
          // due click con una vera maniglia di trascinamento - stessa
          // condizione di visibilità di prima (`entry.parentBox !== null`
          // esclude la radice della pagina: MOVE_NODE rifiuta un nodo con
          // parentId null, meglio non offrire un'azione che fallirebbe
          // sempre). Nessuna soglia di trascinamento (come la maniglia di
          // ridimensionamento sotto): è un controllo dedicato, non l'intero
          // elemento - non c'è un "click semplice" da distinguere qui.
          <div
            key={`${entry.box.nodeId}:drag-handle`}
            data-drag-handle={entry.box.nodeId}
            title="Trascina per spostare (riparent/riordino)"
            onPointerDown={(e) => {
              e.stopPropagation();
              setStructuralDrag({ nodeId: entry.box.nodeId });
              setMoveError(null);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: x,
              top: y - 20,
              width: 18,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2563eb",
              color: "#fff",
              fontSize: 10,
              lineHeight: 1,
              cursor: "grab",
              userSelect: "none",
            }}
          >
            ⠿
          </div>
        ) : null}
        {isSelected
          ? resizeHandles(caps)
              .filter((h) => h.visible)
              .map((h) => {
                // Blocco 4 (maniglie su più lati/angoli): posizione dello
                // "spigolo" di riferimento della maniglia in base alle
                // direzioni attive - stessa logica ripetuta 3 volte
                // (orizzontale/verticale/entrambe) invece di una formula
                // unica: più leggibile per 8 casi concreti che per
                // un'astrazione generica su 2 assi.
                const left = h.edges.west ? x : h.edges.east ? x + width : x + width / 2;
                const top = h.edges.north ? y : h.edges.south ? y + height : y + height / 2;
                return (
                  <div
                    key={`${entry.box.nodeId}:resize-handle:${h.key}`}
                    data-resize-handle={`${entry.box.nodeId}:${h.key}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizeDrag({
                        nodeId: entry.box.nodeId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startLocal: {
                          x: asFiniteNumber(resolvedNode.resolvedProps.x) ?? 0,
                          y: asFiniteNumber(resolvedNode.resolvedProps.y) ?? 0,
                          width: asFiniteNumber(resolvedNode.resolvedProps.width) ?? entry.box.width,
                          height: asFiniteNumber(resolvedNode.resolvedProps.height) ?? entry.box.height,
                        },
                        edges: h.edges,
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
                      left: left - 4,
                      top: top - 4,
                      width: 8,
                      height: 8,
                      background: "#2563eb",
                      border: "1px solid #fff",
                      boxSizing: "border-box",
                      cursor: h.cursor,
                    }}
                  />
                );
              })
          : null}
      </Fragment>
    );
  }

  // Blocco 3: il box del bersaglio corrente (per il feedback visivo sotto) -
  // cercato in `entries`, non ricostruito: stesse coordinate assolute già
  // usate per il rendering di quell'entry.
  const dropTargetEntry = dropTarget ? entries.find((e) => e.box.nodeId === dropTarget.targetNodeId) : undefined;

  return (
    <>
      {moveError ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: "#b91c1c", display: "flex", gap: 8, alignItems: "center" }}>
          <span>Spostamento non riuscito: {moveError}</span>
          <button onClick={() => setMoveError(null)}>OK</button>
        </div>
      ) : null}
      <div
        ref={canvasRootRef}
        onClick={() => {
          // Blocco 4 (editing testo diretto): durante l'editing, un gesto
          // di selezione del testo (click+trascinamento per selezionare
          // parole) che esce anche di poco dai bordi del piccolo elemento
          // in modifica finisce sullo sfondo del Canvas - senza questa
          // guardia, il "click" sintetico che ne risulta deselezionava il
          // nodo mentre l'autore stava ancora scrivendoci dentro (bug
          // trovato verificando in browser reale un trascinamento di
          // selezione testo che usciva dai bordi, non dai test unitari).
          // L'editing stesso non dipende da `selection` (dipende da
          // `editingId`, stato separato) - bloccare qui il deselect basta,
          // nessun'altra conseguenza.
          if (editingId !== null) return;
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
        {structuralDrag !== null ? (
          // Testo d'aiuto durante il trascinamento strutturale -
          // `position:absolute` DENTRO la radice del Canvas (già
          // `position:relative`), non un elemento a flusso normale PRIMA
          // di essa: un blocco a flusso normale che appare/scompare
          // spostava la radice del Canvas verso il basso ogni volta che il
          // trascinamento iniziava, un vero difetto (il puntatore restava
          // fermo mentre il Canvas si spostava sotto di lui) trovato
          // verificando in browser reale, non dai test.
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              fontSize: 11,
              background: "rgba(255,255,255,0.9)",
              padding: "2px 6px",
              border: "1px solid #e5e7eb",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            Rilascia al centro di un contenitore per spostare dentro, sul bordo di un fratello per riordinare.
          </div>
        ) : null}
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
        {/* Blocco 3: feedback visivo del bersaglio PRIMA del rilascio -
            "into" evidenzia l'intero box del contenitore, "before"/"after"
            una linea di inserimento sottile sul suo bordo superiore/
            inferiore. Richiesto esplicitamente: non solo un cambio
            silenzioso al rilascio. */}
        {dropTarget && dropTargetEntry ? (
          dropTarget.kind === "into" ? (
            <div
              data-drop-indicator="into"
              data-drop-indicator-target={dropTarget.targetNodeId}
              style={{
                position: "absolute",
                left: dropTargetEntry.box.x,
                top: dropTargetEntry.box.y,
                width: dropTargetEntry.box.width,
                height: dropTargetEntry.box.height,
                border: "2px solid #2563eb",
                background: "rgba(37,99,235,0.15)",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div
              data-drop-indicator={dropTarget.kind}
              data-drop-indicator-target={dropTarget.targetNodeId}
              style={{
                position: "absolute",
                left: dropTargetEntry.box.x,
                top: dropTarget.kind === "before" ? dropTargetEntry.box.y - 2 : dropTargetEntry.box.y + dropTargetEntry.box.height - 1,
                width: dropTargetEntry.box.width,
                height: 3,
                background: "#2563eb",
                pointerEvents: "none",
              }}
            />
          )
        ) : null}
      </div>
      {/* Blocco 3: etichetta "ghost" che segue il cursore durante il
          trascinamento strutturale - `position:fixed` in coordinate di
          VIEWPORT (cursorClient, non le coordinate locali del Canvas usate
          per il resto), fuori dal contenitore relativo del Canvas per
          restare visibile anche se il puntatore esce dai suoi bordi. */}
      {structuralDrag && cursorClient ? (
        <div
          style={{
            position: "fixed",
            left: cursorClient.x + 12,
            top: cursorClient.y + 12,
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 3,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          {structuralDrag.nodeId}
        </div>
      ) : null}
    </>
  );
}
