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
import { computeAlignmentSnap, SNAP_THRESHOLD_PX, type AxisGuide } from "./alignmentGuides.js";
import { computeDropTarget, EDGE_ZONE_MAX_PX, type DropTarget } from "./dropTarget.js";
import { buildStructuralMoveCommand } from "./buildStructuralMoveCommand.js";
import {
  computeResizedGeometry,
  cornerScaleFactor,
  isCornerEdges,
  resizeHandles,
  type ResizeEdges,
  type ResizeStart,
} from "./resizeGeometry.js";
import { screenDeltaToDocument, screenLengthToDocument, screenPointToDocument } from "./zoomCoordinates.js";
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

/**
 * Blocco Z1 (Fit-to-screen/Zoom, fondamenta visive - analisi approvata):
 * confini dello zoom manuale (+/-). "Adatta allo schermo" può comunque
 * produrre un valore intermedio non allineato a questo passo (arrotondato
 * al punto percentuale più vicino, non a un multiplo di ZOOM_STEP) - i due
 * meccanismi sono indipendenti, nessuno dei due vincola l'altro.
 */
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;

function roundZoom(z: number): number {
  return Math.round(z * 100) / 100;
}

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
  // Richiesta di prodotto ("scala l'elemento, non solo la scatola"): il
  // valore RISOLTO (getComputedStyle) di `fontSize` all'AVVIO del gesto
  // (pointerdown), catturato UNA SOLA VOLTA - mai riletto durante
  // `pointermove`/`pointerup`. Vincolo esplicito del proprietario del
  // prodotto: il calcolo dev'essere sempre "font iniziale × fattore di
  // scala corrente rispetto al punto di partenza", mai "font già
  // modificato × nuovo incremento" (altrimenti lo scaling diventa
  // cumulativo) - catturarlo qui, in uno stato immutabile per la durata
  // del gesto, è ciò che garantisce questa proprietà per costruzione,
  // stesso principio già usato da `startLocal` per width/height/x/y.
  // `null` quando non applicabile (maniglia di lato singolo, o nodo non
  // text-bearing) - nessuno scaling del contenuto in quei casi (deciso
  // esplicitamente, vedi `isCornerEdges`/`isTextBearingType` nel punto di
  // cattura).
  readonly initialFontSizePx: number | null;
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

  // Blocco Z1 (Fit-to-screen/Zoom, fondamenta visive - analisi approvata,
  // "Fit-to-screen / Device Preview"): SOLO una trasformazione di VISTA -
  // mai letta da `computeLayout`/`resolveDocument`, mai passata a
  // `buildUpdatePropsCommand`/`store.execute`. 1 = 100% (nessuna
  // trasformazione, identico al comportamento precedente a questo blocco).
  // Locale al Canvas (non sollevato in App.tsx): nessun altro componente ha
  // bisogno di conoscere lo zoom in questo blocco.
  const [zoom, setZoom] = useState(1);
  // Misura lo spazio ORIZZONTALE realmente disponibile per "Adatta allo
  // schermo" - attaccato all'elemento PIÙ ESTERNO restituito da questo
  // componente (mai esso stesso trasformato/scalato), quindi il suo
  // `clientWidth` riflette sempre lo spazio della colonna centrale
  // (App.tsx), indipendente dallo zoom corrente o da quanto il contenuto
  // scalato eventualmente eccede quello spazio.
  const canvasOuterRef = useRef<HTMLDivElement | null>(null);

  // Blocco 6 (rifinitura UI/UX, Punto 2 dell'audit): un tentativo di
  // trascinamento su un elemento con `!caps.canMoveXY` (il genitore non è
  // "libero") non deve produrre alcun comando - stato separato da
  // `moveDrag` (che parte solo quando `canMoveXY` è vero): registra il
  // tentativo al pointerdown, ma mostra il messaggio solo se il puntatore
  // si muove oltre `DRAG_THRESHOLD_PX` prima del rilascio - un semplice
  // click di selezione (l'azione più comune) non deve mostrare un avviso
  // che nessuno ha chiesto. Blocco Z1 aveva generalizzato questo stato con
  // una `reason` discriminata per aggiungere un secondo motivo ("zoom≠100%
  // blocca il gesto") - Blocco Z3 converte anche l'ultimo gesto a delta
  // (spostamento) rendendolo utilizzabile a qualunque zoom: quel secondo
  // motivo è ora IRRAGGIUNGIBILE (nessun chiamante lo produce più),
  // rimosso qui invece di lasciarlo come stato morto - stessa disciplina
  // già applicata alla maniglia strutturale nel Blocco Z2.
  const [blockedDragAttempt, setBlockedDragAttempt] = useState<{
    readonly startClientX: number;
    readonly startClientY: number;
    readonly parentModeLabel: string;
  } | null>(null);

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
  // Richiesta di prodotto: l'altezza della RADICE della pagina ha un
  // pavimento stabile pari all'altezza della fascia responsive attiva -
  // mai "schiacciata" a `DEFAULT_LEAF_HEIGHT` (40px, il ramo "nodo senza
  // figli" di computeLayout) quando è vuota, mai ricalcolata in modo
  // confuso mentre si spostano elementi al suo interno (prima di questa
  // modifica, il bersaglio "centro scena" dell'aggancio - `container` in
  // snappedPosition sotto - seguiva l'altezza GREZZA/auto-calcolata della
  // radice, spostandosi ad ogni gesto). `canvasHeight` esisteva già (sotto,
  // per dimensionare il contenitore CSS del Canvas) ma non influenzava mai
  // la geometria vera della radice stessa: qui una copia locale del Box
  // (`stableBox`) applica lo stesso pavimento al campo `height` PRIMA di
  // appiattire l'albero - sicuro perché l'altezza di un nodo non influenza
  // mai il posizionamento dei propri figli (che dipende solo dall'ancora
  // x/y del genitore, invariata), quindi sostituirla qui non altera alcuna
  // coordinata dei discendenti. Applicato SOLO qui in Canvas.tsx (mai
  // nell'Engine/computeLayout, mai in Preview.tsx/Exporter): è
  // un'affordance esclusiva dell'EDITOR (uno spazio di lavoro sempre
  // disponibile anche a pagina vuota), non una proprietà della pagina
  // reale - una pagina esportata/in anteprima deve continuare ad avere
  // l'altezza REALE del proprio contenuto, come un sito vero.
  const canvasHeight = Math.max(box.height, previewSize.height);
  const stableBox = useMemo(() => (box.height === canvasHeight ? box : { ...box, height: canvasHeight }), [box, canvasHeight]);
  const entries = useMemo(() => flattenBoxes(stableBox), [stableBox]);

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
      // Blocco Z4 (Fit-to-screen/Zoom): la soglia di aggancio resta
      // costante in spazio SCHERMO (decisione già presa all'approvazione
      // dell'analisi) - convertita qui, all'ingresso in Canvas.tsx, mai
      // dentro alignmentGuides.ts (che resta ignaro dello zoom, riceve solo
      // un numero già in spazio documento, come i delta di Z3).
      return computeAlignmentSnap(dragged, siblings, container, screenLengthToDocument(SNAP_THRESHOLD_PX, zoom));
    }

    // Blocco Z3 (Fit-to-screen/Zoom): `screenDeltaToDocument` converte SOLO
    // qui, all'ingresso in Canvas.tsx - `snappedPosition`/
    // `computeAlignmentSnap` (alignmentGuides.ts) ricevono sempre un delta
    // già in spazio DOCUMENTO, esattamente come prima di questo blocco -
    // il modulo puro non viene mai toccato né reso consapevole dello zoom
    // (vincolo esplicito). La soglia (`DRAG_THRESHOLD_PX`) resta invece
    // valutata sul delta SCHERMO grezzo, non convertito - decisione
    // esplicita del proprietario del prodotto: un gesto fisico deliberato,
    // non una soglia di precisione sul documento (altrimenti lo stesso
    // micro-movimento del polso scriverebbe un comando a zoom alto e non a
    // zoom basso, un'incoerenza percepita, non voluta).
    function onMove(e: PointerEvent): void {
      const rawScreenDx = e.clientX - moveDrag!.startClientX;
      const rawScreenDy = e.clientY - moveDrag!.startClientY;
      const rawDoc = screenDeltaToDocument(rawScreenDx, rawScreenDy, zoom);
      const snapped = snappedPosition(rawDoc.dx, rawDoc.dy);
      const anchorX = draggedEntry?.box.x ?? 0;
      const anchorY = draggedEntry?.box.y ?? 0;
      setMoveDelta({ dx: snapped.x - anchorX, dy: snapped.y - anchorY });
      setGuides({ x: snapped.guideX, y: snapped.guideY });
    }
    function onUp(e: PointerEvent): void {
      const rawScreenDx = e.clientX - moveDrag!.startClientX;
      const rawScreenDy = e.clientY - moveDrag!.startClientY;
      const rawDoc = screenDeltaToDocument(rawScreenDx, rawScreenDy, zoom);
      const snapped = snappedPosition(rawDoc.dx, rawDoc.dy);
      const anchorX = draggedEntry?.box.x ?? 0;
      const anchorY = draggedEntry?.box.y ?? 0;
      const dx = snapped.x - anchorX;
      const dy = snapped.y - anchorY;
      if (Math.abs(rawScreenDx) >= DRAG_THRESHOLD_PX || Math.abs(rawScreenDy) >= DRAG_THRESHOLD_PX) {
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
  }, [moveDrag, store, entries, zoom]);

  // Blocco 6, Punto 2: stessa struttura dell'effect di moveDrag sopra
  // (listener globali, ricalcolo da zero al pointerup) - qui però non
  // scrive mai un comando, mostra solo `moveError` se il gesto supera la
  // soglia di un vero trascinamento (altrimenti si azzera in silenzio: era
  // solo un click).
  useEffect(() => {
    if (!blockedDragAttempt) return;
    function onMove(e: PointerEvent): void {
      const dx = e.clientX - blockedDragAttempt!.startClientX;
      const dy = e.clientY - blockedDragAttempt!.startClientY;
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        setMoveError(
          `questo elemento segue la disposizione automatica del contenitore (modalità "${blockedDragAttempt!.parentModeLabel}"). Per spostarlo liberamente, seleziona il contenitore e imposta la sua modalità su "Libero".`,
        );
        setBlockedDragAttempt(null);
      }
    }
    function onUp(): void {
      setBlockedDragAttempt(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [blockedDragAttempt]);

  useEffect(() => {
    if (!resizeDrag) return;
    // Blocco Z3: stesso principio dell'effect di `moveDrag` sopra -
    // `computeResizedGeometry` (resizeGeometry.ts) riceve sempre un delta
    // già in spazio DOCUMENTO (convertito qui, mai al suo interno), la
    // soglia resta valutata sul delta SCHERMO grezzo.
    function onMove(e: PointerEvent): void {
      const doc = screenDeltaToDocument(e.clientX - resizeDrag!.startClientX, e.clientY - resizeDrag!.startClientY, zoom);
      setResizeDelta({ dx: doc.dx, dy: doc.dy });
    }
    function onUp(e: PointerEvent): void {
      const rawScreenDx = e.clientX - resizeDrag!.startClientX;
      const rawScreenDy = e.clientY - resizeDrag!.startClientY;
      const doc = screenDeltaToDocument(rawScreenDx, rawScreenDy, zoom);
      const { edges, startLocal, initialFontSizePx } = resizeDrag!;
      // Ogni asse è verificato contro la soglia INDIPENDENTEMENTE (come
      // prima di questo blocco): un ridimensionamento verticale sotto
      // soglia non deve impedire un cambiamento orizzontale sopra soglia,
      // e viceversa. `horizontal`/`vertical` sono calcolati SEMPRE (non solo
      // quando la rispettiva soglia è superata): per una maniglia d'angolo
      // servono entrambi per il fattore di scala del contenuto sotto, anche
      // quando un solo asse ha effettivamente superato la propria soglia.
      const horizontal = computeResizedGeometry(startLocal, edges, doc.dx, 0);
      const vertical = computeResizedGeometry(startLocal, edges, 0, doc.dy);
      const widthChanged = (edges.east || edges.west) && Math.abs(rawScreenDx) >= DRAG_THRESHOLD_PX;
      const heightChanged = (edges.north || edges.south) && Math.abs(rawScreenDy) >= DRAG_THRESHOLD_PX;
      const changed: Record<string, unknown> = {};
      if (widthChanged) {
        changed.width = horizontal.width;
        if (horizontal.x !== undefined) changed.x = horizontal.x;
      }
      if (heightChanged) {
        changed.height = vertical.height;
        if (vertical.y !== undefined) changed.y = vertical.y;
      }
      if (Object.keys(changed).length > 0) {
        // Richiesta di prodotto ("scala l'elemento, non solo la scatola"):
        // solo maniglie D'ANGOLO (`isCornerEdges`), solo se un `fontSize`
        // iniziale è stato catturato al pointerdown (nodo text-bearing).
        // Un asse che non ha superato la propria soglia contribuisce un
        // rapporto di 1 (invariato) al fattore di scala - coerente con "il
        // contenuto non cresce mai più di quanto l'asse tirato di meno
        // giustifichi" (decisione esplicita): un trascinamento praticamente
        // solo orizzontale non deve far crescere il font per una frazione
        // di pixel verticale sotto soglia. Il fattore usa SEMPRE
        // `startLocal` (catturato al pointerdown) come base, mai un valore
        // già scalato in un giro precedente - stessa garanzia "nessuna
        // crescita cumulativa" già rispettata da `width`/`height` sopra.
        if (isCornerEdges(edges) && initialFontSizePx !== null) {
          const resizedWidth = widthChanged ? (horizontal.width ?? startLocal.width) : startLocal.width;
          const resizedHeight = heightChanged ? (vertical.height ?? startLocal.height) : startLocal.height;
          const factor = cornerScaleFactor(startLocal.width, startLocal.height, resizedWidth, resizedHeight);
          changed.fontSize = `${initialFontSizePx * factor}px`;
        }
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
  }, [resizeDrag, store, zoom]);

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
    // Blocco Z2 (Fit-to-screen/Zoom): `rect` è già il bounding box
    // RENDERIZZATO (quindi già scalato dal `transform:scale(zoom)` di
    // Canvas.tsx) - `screenPointToDocument` divide per `zoom` DOPO aver
    // sottratto l'origine, riportando il punto in coordinate DOCUMENTO
    // (le stesse di `entries[i].box.x/y/width/height`, lette da
    // `computeDropTarget` sotto). Unico punto di conversione per questo
    // gesto (identificato nell'analisi "Fit-to-screen / Device Preview"
    // come l'unico consumatore basato su `rect`, non su delta).
    function localPoint(e: PointerEvent): { x: number; y: number } | null {
      const rect = canvasRootRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return screenPointToDocument(e.clientX, e.clientY, rect, zoom);
    }
    // Blocco Z4 (Fit-to-screen/Zoom): la fascia di bordo "prima/dopo" vs
    // "dentro" resta costante in spazio SCHERMO (16px, come da decisione
    // già presa) - convertita qui, mai dentro dropTarget.ts (che resta
    // ignaro dello zoom, stesso principio di SNAP_THRESHOLD_PX sopra).
    const edgeZoneMaxPxDoc = screenLengthToDocument(EDGE_ZONE_MAX_PX, zoom);
    function onMove(e: PointerEvent): void {
      setCursorClient({ x: e.clientX, y: e.clientY });
      const local = localPoint(e);
      setDropTarget(local ? computeDropTarget(entries, excluded, canReceiveChildren, local.x, local.y, edgeZoneMaxPxDoc) : null);
    }
    function onUp(e: PointerEvent): void {
      // Non si legge lo stato `dropTarget` (potenzialmente stantio in
      // questa chiusura, mai aggiornato dall'ultimo pointermove nella
      // stessa closure dell'effect): si ricalcola da zero sull'evento di
      // rilascio, stesso principio già usato da onUp di moveDrag/resizeDrag
      // (che ricalcolano dx/dy invece di leggere lo stato React).
      const local = localPoint(e);
      const target = local ? computeDropTarget(entries, excluded, canReceiveChildren, local.x, local.y, edgeZoneMaxPxDoc) : null;
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
  }, [structuralDrag, store, entries, document, model, zoom]);

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
    let fontSize: string | number = typeof resolvedNode.resolvedProps.fontSize === "string" ? resolvedNode.resolvedProps.fontSize : 12;
    // Richiesta di prodotto ("scala l'elemento, non solo la scatola"):
    // anteprima dal vivo dello scaling del font durante un trascinamento
    // d'angolo - riusa `width`/`height` GIÀ scalati dal blocco sopra (mai
    // ricalcolati qui), confrontati con `entry.box.width`/`height` (la
    // geometria di PARTENZA, il Document non cambia durante il gesto):
    // stessa fonte di verità del comando finale in `onUp` (l'effect sopra),
    // nessuna soglia qui - coerente con `width`/`height`, che già si
    // muovono dal vivo senza soglia durante il trascinamento (la soglia
    // vale solo per decidere COSA committare al rilascio, mai per
    // l'anteprima).
    if (resizeDrag && resizeDrag.nodeId === entry.box.nodeId && resizeDrag.initialFontSizePx !== null && isCornerEdges(resizeDrag.edges)) {
      const factor = cornerScaleFactor(entry.box.width, entry.box.height, width, height);
      fontSize = `${resizeDrag.initialFontSizePx * factor}px`;
    }
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
    } else {
      // Richiesta di prodotto (dopo Blocco Z4): l'indicatore SEMPRE VISIBILE
      // per un contenitore senza stile (bordo tratteggiato + sfondo celeste
      // tenue, introdotto nel Blocco 1, attenuato nel Blocco 7) è stato
      // RIMOSSO DEL TUTTO, non solo attenuato - un contenitore/la radice
      // della pagina senza colore scelto dall'autore appaiono come spazio
      // vuoto/trasparente, mai come un rettangolo colorato che "segue"
      // l'autore nel Canvas. Selezione (sopra) e hover (sopra, invariato)
      // restano l'unico feedback visivo dei bordi di un contenitore - a
      // riposo (non selezionato, non in hover) non c'è più alcun indicatore
      // permanente.
      border = "none";
    }
    const background = backgroundColor ?? "transparent";
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
            // Richiesta di prodotto (dopo l'altezza stabile della radice,
            // sopra): la radice della pagina è sempre alta quanto l'intera
            // fascia attiva, quindi copre l'INTERA area cliccabile del
            // Canvas - un click su un punto "vuoto" (nessun altro elemento
            // sotto) ricade sempre sulla radice stessa, mai su un'area
            // realmente priva di elementi. `entry.parentBox === null`
            // identifica la radice (stesso segnale già usato altrove in
            // questo file, es. la visibilità della maniglia ⠿) - un click lì
            // deve DESELEZIONARE tutto (esattamente come cliccare "sul
            // vuoto" ha sempre fatto), mai selezionare la radice come fosse
            // un contenitore qualunque. La radice resta selezionabile SOLO
            // dal pannello "Struttura" (Outline), non da un click nel Canvas.
            if (entry.parentBox === null) {
              store.deselect();
            } else {
              store.select(entry.box.nodeId);
            }
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
            // Blocco Z3 (Fit-to-screen/Zoom): il gate "zoom≠100% blocca
            // questo gesto" del Blocco Z1 è stato RIMOSSO - lo spostamento
            // è il gesto convertito in questo blocco (vedi l'effect di
            // `moveDrag` sopra, che ora converte il delta con
            // `screenDeltaToDocument`), funziona correttamente a qualunque
            // zoom. Resta SOLO il gate preesistente (Blocco 6).
            if (!caps.canMoveXY) {
              // Blocco 6, Punto 2: nessuno `stopPropagation()` qui - un
              // semplice click (senza superare la soglia) deve continuare a
              // comportarsi esattamente come prima (selezione via `onClick`
              // dello stesso Tag, invariata).
              const parentNode = entry.parentBox ? model.nodes.get(entry.parentBox.nodeId) : undefined;
              const parentModeLabel = parentNode?.resolvedProps.layoutMode === "griglia" ? "Griglia" : "Pila";
              setBlockedDragAttempt({ startClientX: e.clientX, startClientY: e.clientY, parentModeLabel });
              return;
            }
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
              // Blocco Z2 (Fit-to-screen/Zoom): il gate "zoom≠100% blocca
              // questo gesto" del Blocco Z1 è stato RIMOSSO qui - questo è
              // esattamente il gesto convertito in questo blocco
              // (`localPoint()`, sopra, divide ora per `zoom`), funziona
              // correttamente a qualunque livello di zoom.
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
              // Blocco Z4 (Fit-to-screen/Zoom): contro-scala - la maniglia
              // eredita `transform:scale(zoom)` dall'antenato (canvasRootRef),
              // quindi a zoom ridotto apparirebbe troppo piccola per essere
              // presa comodamente. `scale(1/zoom)` sulla maniglia stessa
              // annulla la scala ereditata SOLO per la sua dimensione
              // visiva, mantenendo fisso il proprio centro geometrico
              // (`transformOrigin` di default, "50% 50%" del proprio box
              // documento) - il gesto che avvia (`onPointerDown`) legge
              // `e.clientX/clientY`, indipendenti da qualunque trasformazione
              // CSS sull'elemento target, quindi nessuna modifica alla
              // matematica del gesto è necessaria qui.
              transform: `scale(${1 / zoom})`,
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
                      // Blocco Z3: il gate "zoom≠100% blocca questo gesto"
                      // del Blocco Z1 è stato RIMOSSO - il resize è
                      // convertito in questo blocco, funziona a qualunque
                      // zoom.
                      // Richiesta di prodotto ("scala l'elemento, non solo
                      // la scatola"): il valore RISOLTO di `fontSize`
                      // (getComputedStyle, già risolve sia un px fisso sia
                      // un clamp() in un numero concreto) viene letto QUI,
                      // UNA SOLA VOLTA all'avvio del gesto - mai più tardi
                      // (vedi il commento su `initialFontSizePx` in
                      // `ResizeDrag` sopra). Solo su maniglie D'ANGOLO
                      // (`isCornerEdges`) e solo su nodi text-bearing -
                      // `null` altrimenti, nessuno scaling del contenuto in
                      // quei casi (deciso esplicitamente: container/
                      // griglia/scena restano fuori perimetro).
                      const initialFontSizePx =
                        isCornerEdges(h.edges) && isTextBearing
                          ? (() => {
                              const el = canvasRootRef.current?.querySelector<HTMLElement>(
                                `[data-node-id="${entry.box.nodeId}"]`,
                              );
                              return el ? (asFiniteNumber(parseFloat(getComputedStyle(el).fontSize)) ?? null) : null;
                            })()
                          : null;
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
                        initialFontSizePx,
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
                      // Blocco Z4: stessa contro-scala della maniglia ⠿
                      // sopra - dimensione visiva costante indipendente
                      // dallo zoom, ancorata al proprio centro geometrico
                      // (`left`/`top` invariati).
                      transform: `scale(${1 / zoom})`,
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

  // Blocco Z1: `canvasHeight` (calcolato sopra, insieme a `stableBox`) è
  // l'altezza REALE del Canvas in coordinate DOCUMENTO. `scaledWidth`/
  // `scaledHeight` sono SOLO dimensioni CSS del contenitore di
  // dimensionamento (vedi sotto, mai lette da `computeLayout`/passate a un
  // comando) - la distinzione tra "quanto è grande la pagina"
  // (canvasHeight, documento) e "quanto spazio occupa sullo schermo"
  // (scaledWidth/Height, vista) è esattamente il confine che questo blocco
  // introduce.
  const scaledWidth = viewportWidth * zoom;
  const scaledHeight = canvasHeight * zoom;

  function handleZoomOut(): void {
    setZoom((z) => Math.max(ZOOM_MIN, roundZoom(z - ZOOM_STEP)));
  }
  function handleZoomIn(): void {
    setZoom((z) => Math.min(ZOOM_MAX, roundZoom(z + ZOOM_STEP)));
  }
  function handleZoomReset(): void {
    setZoom(1);
  }
  // Blocco Z1: calcolo "one-shot" (un click = una misura), non una modalità
  // continuamente aggiornata - se la finestra viene ridimensionata dopo,
  // serve un nuovo click. Scelta deliberata per restare nel perimetro
  // "fondamenta visive" (nessun ResizeObserver/listener di resize in questo
  // blocco). Non ingrandisce mai oltre il 100% (solo `Math.min(1, ...)`):
  // l'obiettivo è far entrare un Canvas più largo dello spazio disponibile,
  // non ingrandire automaticamente uno già più piccolo - un ingrandimento
  // automatico non è stato richiesto, decisione di scope minimo.
  function handleFitToScreen(): void {
    const available = canvasOuterRef.current?.clientWidth;
    if (!available) return;
    setZoom(roundZoom(Math.min(1, available / viewportWidth)));
  }

  return (
    <div ref={canvasOuterRef}>
      {moveError ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: "#b91c1c", display: "flex", gap: 8, alignItems: "center" }}>
          <span>Spostamento non riuscito: {moveError}</span>
          <button onClick={() => setMoveError(null)}>OK</button>
        </div>
      ) : null}
      {/* Blocco Z1 (Fit-to-screen/Zoom, fondamenta visive): controlli SOLO
          di vista - nessuno di questi bottoni esegue mai un comando su
          `store`. */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
        <span style={{ opacity: 0.7 }}>Zoom</span>
        <button onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="Riduci zoom">
          −
        </button>
        <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="Aumenta zoom">
          +
        </button>
        <button onClick={handleZoomReset} disabled={zoom === 1}>
          100%
        </button>
        <button onClick={handleFitToScreen}>Adatta allo schermo</button>
        {/* Blocco Z3: l'avviso "editing temporaneamente disattivato"
            (Blocco Z1, ridotto nel Blocco Z2) è stato RIMOSSO - con la
            conversione dell'ultimo gesto a delta (spostamento/resize),
            nessuna interazione del Canvas resta più disattivata a
            qualunque livello di zoom. */}
      </div>
      {/* Blocco Z1: contenitore di dimensionamento - "prenota" nel flusso
          normale esattamente lo spazio VISIVO che il Canvas scalato occupa
          (`scaledWidth`/`scaledHeight`), altrimenti una `transform:scale()`
          da sola non ridurrebbe mai lo spazio riservato dal genitore
          (`overflow:auto` continuerebbe a "vedere" le dimensioni piene non
          scalate, vanificando "Adatta allo schermo"). */}
      <div style={{ width: scaledWidth, height: scaledHeight }}>
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
          // Blocco Z1: width/height restano ESATTAMENTE le stesse coordinate
          // DOCUMENTO di prima di questo blocco (nessun *zoom qui) - la
          // scala è applicata SOLO da `transform`, che non tocca la
          // geometria che il resto del componente (renderBox, guide,
          // indicatori di drop) continua a calcolare/leggere in coordinate
          // documento, invariata.
          width: viewportWidth,
          height: canvasHeight,
          background: "#ffffff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
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
      </div>
      {/* Blocco 3: etichetta "ghost" che segue il cursore durante il
          trascinamento strutturale - `position:fixed` in coordinate di
          VIEWPORT (cursorClient, non le coordinate locali del Canvas usate
          per il resto), fuori dal contenitore relativo del Canvas per
          restare visibile anche se il puntatore esce dai suoi bordi. Resta
          FUORI dal contenitore di dimensionamento scalato (Blocco Z1) per
          lo stesso motivo per cui resta in coordinate viewport - non deve
          mai essere influenzata dallo zoom. */}
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
    </div>
  );
}
