import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { computeLayout, resolveDocument } from "@vicolobuilder/engine";
import type { Box, PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument } from "../history/useHistoryStore.js";
import { flattenBoxes } from "../canvas/flattenBoxes.js";
import { PREVIEW_SIZE } from "../previewSize.js";
import { sceneNodeIds } from "./scenes.js";
import { initialPosition, navigatePage, navigateScene, type PreviewPosition } from "./navigation.js";

/**
 * Fase 7, Punto 4: transizione con `transition` CSS nativa, non il motore
 * rAF/easing custom del sito reale (che esiste lì solo per sincronizzare
 * `aggiornaColoreHeader()` frame-per-frame con lo scroll - funzionalità
 * fuori scope qui, rimandata a B/S7/Fase 13). Durata indicativa, non
 * vincolante.
 */
const TRANSITION_MS = 400;

/**
 * Fase 7, Punto 6: la Preview sostituisce il Canvas, nessuna interazione di
 * editing mentre è attiva - qui non c'è drag/resize/selezione, solo un
 * rendering statico dell'albero (riusa `flattenBoxes`, non `Canvas.tsx`,
 * che è denso di stato di editing estraneo a questa vista - analisi Fase 7,
 * Punto 2).
 */
function renderStaticBox(box: Box, resolvedProps: (nodeId: string) => Record<string, unknown> | undefined): JSX.Element[] {
  return flattenBoxes(box).map((entry) => {
    const props = resolvedProps(entry.box.nodeId) ?? {};
    const backgroundColor = typeof props.color === "string" ? props.color : undefined;
    const text = typeof props.text === "string" ? props.text : null;
    // Fase 10: stesso trattamento di Canvas.tsx - stringa CSS opaca (es.
    // "clamp(...)"), fallback al valore fisso preesistente se assente.
    const fontSize = typeof props.fontSize === "string" ? props.fontSize : 12;
    return (
      <div
        key={entry.box.nodeId}
        style={{
          position: "absolute",
          left: entry.box.x,
          top: entry.box.y,
          width: entry.box.width,
          height: entry.box.height,
          boxSizing: "border-box",
          background: backgroundColor ?? "transparent",
          fontSize,
          padding: 4,
        }}
      >
        {text}
      </div>
    );
  });
}

export function Preview({
  store,
  initialPageId,
  onClose,
}: {
  readonly store: ReactiveHistory;
  readonly initialPageId: PageId;
  readonly onClose: () => void;
}): JSX.Element {
  const document = useDocument(store);
  const activeBreakpoint = useActiveBreakpoint(store);
  const previewSize = PREVIEW_SIZE[activeBreakpoint] ?? { width: 1600, height: 900 };

  const [position, setPosition] = useState<PreviewPosition>(() => initialPosition(initialPageId));
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const model = useMemo(() => resolveDocument(document, { breakpoint: activeBreakpoint }), [document, activeBreakpoint]);
  const box = useMemo(
    () => computeLayout(model, { pageId: position.pageId, viewportWidth: previewSize.width }),
    [model, position.pageId, previewSize.width],
  );
  const scenes = useMemo(() => sceneNodeIds(document, position.pageId), [document, position.pageId]);
  const currentSceneBox = scenes.length > 0 ? box.children.find((child) => child.nodeId === scenes[position.sceneIndex]) : undefined;
  const scrollY = currentSceneBox?.y ?? 0;

  function resolvedPropsFor(nodeId: string): Record<string, unknown> | undefined {
    return model.nodes.get(nodeId)?.resolvedProps;
  }

  /**
   * Fase 7, Punto 9: un unico lock per entrambi gli assi, ignora nuovi
   * comandi di navigazione finché la transizione in corso non è finita -
   * evita che il key-repeat del sistema operativo su una freccia tenuta
   * premuta accodi più transizioni.
   */
  function handleScene(delta: -1 | 1): void {
    if (isTransitioning) return;
    const next = navigateScene(document, position, delta);
    if (next === position) return;
    setIsTransitioning(true);
    setPosition(next);
    window.setTimeout(() => setIsTransitioning(false), TRANSITION_MS);
  }

  /**
   * Cambio pagina: a differenza del cambio scena (stesso albero, un solo
   * valore di `transform` che la `transition` CSS anima da sola), qui
   * l'intero albero risolto cambia - un dissolvenza a due fasi (opacità a
   * 0, sostituzione del contenuto, opacità a 1) evita di dover tenere
   * montati due alberi di pagina contemporaneamente per un semplice
   * scorrimento orizzontale, che l'analisi (Punto 4) non richiedeva nel
   * dettaglio. Resta una `transition` CSS nativa, nessun rAF.
   */
  function handlePage(delta: -1 | 1): void {
    if (isTransitioning) return;
    const next = navigatePage(document, position, delta);
    if (next === position) return;
    setIsTransitioning(true);
    setFadeOpacity(0);
    window.setTimeout(() => {
      setPosition(next);
      // Il nuovo contenuto monta a opacità 0 (stato invariato dal fade-out
      // sopra). Un doppio rAF assicura che il browser abbia dipinto quel
      // frame a opacità 0 prima di cambiarla a 1: solo così la `transition`
      // CSS anima la comparsa invece di renderla istantanea al mount
      // (una transizione non parte su un valore di stile già presente al
      // primo render dell'elemento). Sequenziamento di due stati, non un
      // loop di easing per-frame: resta coerente col Punto 4.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadeOpacity(1));
      });
      window.setTimeout(() => setIsTransitioning(false), TRANSITION_MS);
    }, TRANSITION_MS);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        handleScene(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        handleScene(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        handlePage(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        handlePage(1);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={onClose}>Torna all&apos;editing</button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Frecce sinistra/destra: pagina · Frecce su/giù: scena · Esc: chiudi
        </span>
      </div>
      <div
        ref={rootRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          position: "relative",
          width: previewSize.width,
          height: previewSize.height,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#fff",
          outline: "none",
        }}
      >
        <div
          key={position.pageId}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: box.width,
            transform: `translateY(${-scrollY}px)`,
            transition: `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease`,
            opacity: fadeOpacity,
          }}
        >
          {renderStaticBox(box, resolvedPropsFor)}
        </div>
      </div>
    </div>
  );
}
