import { useEffect, useMemo, useState } from "react";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document, NodeId, PageId } from "@vicolobuilder/engine";
import { ReactiveHistory } from "./history/ReactiveHistory.js";
import { useActiveBreakpoint, useCanRedo, useCanUndo, useDocument, useSelection } from "./history/useHistoryStore.js";
import { Canvas } from "./canvas/Canvas.js";
import { PropertyPanel } from "./panel/PropertyPanel.js";
import { PageManager } from "./pages/PageManager.js";
import { ElementPalette } from "./elements/ElementPalette.js";
import { Preview } from "./preview/Preview.js";
import { TIER_NAMES } from "./breakpoints.js";
import { FontManager } from "./fonts/FontManager.js";
import { useRegisteredFonts } from "./fonts/useRegisteredFonts.js";
import { readRegisteredFonts } from "./fonts/fontRegistration.js";
import { SiteSeoManager } from "./seo/SiteSeoManager.js";

/** Documento dimostrativo: una radice in modalità "libero" con due card, per avere subito qualcosa da selezionare/trascinare/ridimensionare. */
function buildDemoDocument(): Document {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card-1",
    nodeType: "box",
    parentId: "root",
    props: { x: 40, y: 40, width: 160, height: 80, color: "#dbeafe", text: "Card 1" },
  });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card-2",
    nodeType: "box",
    parentId: "root",
    props: { x: 240, y: 120, width: 160, height: 80, color: "#fde68a", text: "Card 2" },
  });
  return doc;
}

/**
 * B3 (cancellazione elementi da UI) — stesso principio già usato in
 * `Canvas.tsx` per nascondere "Sposta dentro…" sulla radice pagina
 * (`entry.parentBox !== null`), qui riscritto alla granularità disponibile
 * in `App.tsx` (nessun `FlatBoxEntry` qui): controlla su TUTTE le pagine,
 * non solo quella attiva, stesso giro già fatto da `applyDeleteNode`
 * (`packages/engine/src/runtime/commands.ts`) - copre anche il caso limite
 * di una selezione rimasta da una pagina diversa da quella attiva.
 */
function isPageRoot(document: Document, nodeId: NodeId): boolean {
  for (const page of document.pages.values()) {
    if (page.rootNodeId === nodeId) return true;
  }
  return false;
}

/**
 * B3 — la scorciatoia da tastiera non deve attivarsi mentre l'autore sta
 * scrivendo in un campo del `PropertyPanel`/`PageManager`/`FontManager`
 * (decisione esplicita del proprietario del prodotto): controlla
 * l'elemento a fuoco nel DOM, non un flag di stato dedicato - non serve,
 * il fuoco della tastiera è già l'informazione che serve.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function App(): JSX.Element {
  const store = useMemo(() => new ReactiveHistory(buildDemoDocument()), []);
  const document = useDocument(store);
  const activeBreakpoint = useActiveBreakpoint(store);
  const canUndo = useCanUndo(store);
  const canRedo = useCanRedo(store);
  const selection = useSelection(store);

  // Fase 5, Blocco E: quale pagina sta guardando/modificando il Canvas -
  // stato locale di App, non di History (vedi commento in PageManager.tsx).
  const [activePageId, setActivePageId] = useState<PageId>(document.rootPageId);

  // Fase 7, Punto 3/6: come `activePageId`, stato locale (non History) -
  // la Preview sostituisce il Canvas quando attiva, non gira in parallelo.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fase 16: un solo punto di chiamata basta - `document.fonts` (il
  // registro del browser) è globale alla pagina, Canvas e Preview ne
  // beneficiano entrambi senza registrare nulla per conto proprio.
  useRegisteredFonts(readRegisteredFonts(document));

  // B3 (cancellazione elementi da UI, punto di ingresso B - toolbar
  // globale, stesso pattern di Undo/Redo - analisi approvata): nessuna
  // conferma (coerente con l'unico precedente diretto, `DELETE_PAGE` in
  // `PageManager.tsx`), radice pagina esclusa (`isPageRoot`), selezione
  // deselezionata esplicitamente dopo il comando (non lasciata "pendente" -
  // quel messaggio resta per i casi inattesi, es. Undo di una CREATE_NODE,
  // non per un delete voluto).
  const canDeleteSelection = selection !== null && !isPageRoot(document, selection);

  function handleDeleteSelected(): void {
    if (!canDeleteSelection || selection === null) return;
    store.execute({ type: "DELETE_NODE", nodeId: selection });
    store.deselect();
  }

  // B3 (scorciatoia da tastiera, complementare non sostitutiva - analisi
  // approvata): "Delete" principale, "Backspace" secondario. Non si attiva
  // quando il fuoco è su un campo editabile (`isEditableTarget`) - senza
  // questo controllo, Backspace cancellerebbe l'elemento selezionato mentre
  // si sta scrivendo in un campo del pannello, non un carattere. Disattiva
  // anche mentre la Preview è aperta: `Preview.tsx` ha già un proprio
  // `onKeyDown` scoped (frecce/Esc per la navigazione) - un listener
  // globale attivo in parallelo lì rischierebbe una cancellazione
  // accidentale durante la sola navigazione, senza alcun indizio visivo
  // (la Preview non mostra selezione) che un nodo resti comunque
  // cancellabile.
  useEffect(() => {
    if (previewOpen || !canDeleteSelection || selection === null) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isEditableTarget(e.target)) return;
      if (selection === null) return;
      e.preventDefault();
      store.execute({ type: "DELETE_NODE", nodeId: selection });
      store.deselect();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen, canDeleteSelection, selection, store]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ width: 260, borderRight: "1px solid #e5e7eb", overflow: "auto" }}>
        <PageManager store={store} activePageId={activePageId} onActivePageChange={setActivePageId} />
        <FontManager store={store} />
        <SiteSeoManager store={store} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#f3f4f6" }}>
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {TIER_NAMES.map((tier) => (
            <button
              key={tier}
              onClick={() => store.setActiveBreakpoint(tier)}
              style={{ fontWeight: tier === activeBreakpoint ? "bold" : "normal" }}
            >
              {tier}
            </button>
          ))}
          <button onClick={() => store.undo()} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={() => store.redo()} disabled={!canRedo}>
            Redo
          </button>
          <button onClick={handleDeleteSelected} disabled={!canDeleteSelection} title="Canc / Backspace">
            Elimina
          </button>
          <button onClick={() => setPreviewOpen(true)} disabled={previewOpen}>
            Anteprima
          </button>
        </div>
        {previewOpen ? (
          <Preview store={store} initialPageId={activePageId} onClose={() => setPreviewOpen(false)} />
        ) : (
          <>
            <ElementPalette store={store} activePageId={activePageId} />
            <Canvas store={store} pageId={activePageId} />
          </>
        )}
      </div>
      <div style={{ width: 260, borderLeft: "1px solid #e5e7eb", overflow: "auto" }}>
        <PropertyPanel store={store} />
      </div>
    </div>
  );
}
