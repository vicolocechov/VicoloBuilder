import { useEffect, useState } from "react";
import { applyCommand, createDocument, getBreakpoint } from "@vicolobuilder/engine";
import type { Document, NodeId, PageId } from "@vicolobuilder/engine";
import { ReactiveHistory } from "./history/ReactiveHistory.js";
import { useActiveBreakpoint, useCanRedo, useCanUndo, useDocument, useSelection } from "./history/useHistoryStore.js";
import { Canvas } from "./canvas/Canvas.js";
import { PropertyPanel } from "./panel/PropertyPanel.js";
import { PageManager } from "./pages/PageManager.js";
import { Outline } from "./outline/Outline.js";
import { ElementPalette } from "./elements/ElementPalette.js";
import { Preview } from "./preview/Preview.js";
import { TIER_NAMES, describeBreakpoint } from "./breakpoints.js";
import { FontManager } from "./fonts/FontManager.js";
import { useRegisteredFonts } from "./fonts/useRegisteredFonts.js";
import { readRegisteredFonts } from "@vicolobuilder/render-conventions";
import { SiteSeoManager } from "./seo/SiteSeoManager.js";
import { loadDocumentFromLocalStorage, saveDocumentToLocalStorage } from "./persistence/localDocumentStorage.js";

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
 * Blocco 7 (audit Builder UI/UX, Punto 4): documento REALMENTE vuoto - una
 * sola pagina, nessun nodo oltre alla radice (`createDocument()` di default
 * produce esattamente questo: una Page + una radice "page-root" senza
 * figli, già invariant-valid). Unica aggiunta rispetto al default
 * dell'Engine: `layoutMode: "libero"` sulla radice, per coerenza con "+
 * Pagina" (PageManager.tsx, stessa identica UPDATE_PROPS - Blocco 1.2,
 * D-046) - senza questa aggiunta, la radice di un documento nuovo si
 * comporterebbe diversamente da quella di una pagina nuova creata dentro un
 * documento esistente, un'incoerenza non richiesta da nessuno.
 */
function buildBlankDocument(): Document {
  let doc = createDocument();
  doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "node-root", props: { layoutMode: "libero" } });
  return doc;
}

/**
 * B3 (cancellazione elementi da UI) — stesso principio già usato in
 * `Canvas.tsx` per nascondere la maniglia di trascinamento (Blocco 3, ex
 * "Sposta dentro…") sulla radice pagina (`entry.parentBox !== null`), qui
 * riscritto alla granularità disponibile
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
  // Blocco 1 (audit Builder UI/UX, Punto 2): `store` non è più fisso per
  // tutta la vita del componente (`useMemo` con dipendenze vuote) - "Apri"
  // deve poter sostituire l'intero Document caricato con un nuovo
  // `ReactiveHistory`. `History` (Engine) non espone un modo di rimpiazzare
  // il Document di un'istanza esistente (execute/undo/redo sono le uniche
  // vie, e caricare un documento salvato non è un comando) - creare una
  // nuova istanza qui, invece di aggiungere un metodo `load` all'Engine, è
  // la scelta a minor impatto: nessuna modifica a un package già stabile
  // (Engine), e concettualmente coerente con "caricare un documento salvato
  // inizia una nuova sessione di editing" (undo/redo/selezione ripartono
  // vuoti, che è anche il comportamento desiderato qui).
  const [store, setStore] = useState<ReactiveHistory>(() => new ReactiveHistory(buildDemoDocument()));
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

  // Blocco 1, Punto 2 (persistenza minima): messaggio di esito transitorio,
  // stesso pattern di `moveError` in Canvas.tsx/`error` in PageManager.tsx -
  // stato locale, non History, azzerato dal prossimo tentativo.
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Blocco 6 (rifinitura UI/UX, Punto 7 dell'audit): nessun indicatore di
  // "modifiche non salvate" esisteva finora - `saveStatus` è solo un
  // messaggio TRANSITORIO ("Documento salvato.") che scompare al click su
  // "OK", non uno stato persistente. `lastSavedDocument` tiene il
  // riferimento ESATTO del Document all'ultimo salvataggio/caricamento:
  // `Document` è immutabile per costruzione (Engine) - un nuovo comando
  // produce sempre un nuovo riferimento, `undo`/`redo` restituiscono lo
  // STESSO riferimento quando non c'è nulla da annullare/ripetere (già
  // garantito da `History`, sfruttato anche da `useSyncExternalStore` in
  // useHistoryStore.ts) - quindi un confronto per riferimento (non un hash)
  // basta ed è corretto anche dopo un ciclo undo/redo che torna esattamente
  // allo stato salvato. `null` all'avvio: il documento demo non è mai stato
  // salvato in questa sessione, "non salvato" è l'informazione corretta.
  const [lastSavedDocument, setLastSavedDocument] = useState<Document | null>(null);
  const hasUnsavedChanges = document !== lastSavedDocument;

  function handleSave(): void {
    saveDocumentToLocalStorage(store.getDocument());
    setLastSavedDocument(store.getDocument());
    setSaveStatus("Documento salvato.");
  }

  function handleLoad(): void {
    try {
      const loaded = loadDocumentFromLocalStorage();
      setStore(new ReactiveHistory(loaded));
      // Stato di sessione dell'editor (pagina/anteprima) riparte da un
      // default (decisione esplicita del proprietario del prodotto per
      // questo blocco) - solo il Document deve sopravvivere intatto.
      setActivePageId(loaded.rootPageId);
      setPreviewOpen(false);
      setLastSavedDocument(loaded);
      setSaveStatus("Documento caricato.");
    } catch (e) {
      setSaveStatus(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Blocco 7 (audit Builder UI/UX, Punto 4): il documento demo (Card 1/
   * Card 2) non è mai stato un residuo di localStorage - è semplicemente il
   * punto di partenza fisso di `useState(() => new ReactiveHistory(...))`,
   * usato ad ogni montaggio. Non toccato qui (resterebbe come demo alla
   * primissima apertura, comportamento invariato): questo bottone dà solo
   * un modo ESPLICITO di ripartire da un documento vuoto in qualunque
   * momento, senza passare da "Apri" (che richiede un salvataggio
   * precedente) né toccarne il comportamento. Stesso schema di
   * `handleLoad` (nuova `ReactiveHistory`, stato di sessione dell'editor
   * riportato a un default) - NESSUNA lettura di `localStorage` qui: un
   * salvataggio precedente resta raggiungibile solo tramite "Apri",
   * esplicitamente, mai caricato automaticamente da questo bottone.
   * Nessuna conferma richiesta: stessa scelta già in vigore per "Apri"
   * (anch'esso sostituisce l'intero documento in memoria senza chiedere
   * conferma) - l'indicatore "Modifiche non salvate" (Blocco 6) resta
   * comunque visibile prima di cliccare, stesso avviso ambientale già
   * presente per "Apri".
   */
  function handleNewDocument(): void {
    const blank = buildBlankDocument();
    setStore(new ReactiveHistory(blank));
    setActivePageId(blank.rootPageId);
    setPreviewOpen(false);
    setLastSavedDocument(null);
    setSaveStatus("Nuovo documento creato.");
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
        <Outline store={store} activePageId={activePageId} />
        <FontManager store={store} />
        <SiteSeoManager store={store} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#f3f4f6" }}>
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {TIER_NAMES.map((tier) => (
            <button
              key={tier}
              onClick={() => store.setActiveBreakpoint(tier)}
              title={describeBreakpoint(getBreakpoint(tier))}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.3 }}
            >
              <span style={{ fontWeight: tier === activeBreakpoint ? "bold" : "normal" }}>{tier}</span>
              {/* Blocco 6, Punto 6: fascia reale sempre visibile (non solo
                  al passaggio del mouse) - è il controllo primario della
                  toolbar, usato di continuo, non un dettaglio secondario da
                  scoprire con un tooltip. */}
              <span style={{ fontSize: 9, fontWeight: "normal", opacity: 0.6 }}>{describeBreakpoint(getBreakpoint(tier))}</span>
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
          <button onClick={handleSave}>Salva</button>
          <button onClick={handleLoad}>Apri</button>
          <button onClick={handleNewDocument} title="Crea un documento vuoto (una pagina, nessun contenuto) - non tocca alcun salvataggio esistente">
            Nuovo documento
          </button>
          {/* Blocco 6, Punto 7: dove va "Salva" e se il documento corrente è
              aggiornato rispetto all'ultimo salvataggio - nessuna delle due
              informazioni esisteva prima (verificato nell'audit). */}
          <span style={{ fontSize: 11, opacity: 0.6 }} title="Il documento è salvato in questo browser, non condiviso tra dispositivi.">
            (salvato in questo browser)
          </span>
          {hasUnsavedChanges ? (
            <span style={{ fontSize: 11, color: "#b45309" }}>● Modifiche non salvate</span>
          ) : (
            <span style={{ fontSize: 11, opacity: 0.5 }}>✓ Salvato</span>
          )}
          {saveStatus ? (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {saveStatus} <button onClick={() => setSaveStatus(null)}>OK</button>
            </span>
          ) : null}
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
