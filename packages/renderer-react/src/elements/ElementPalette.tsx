import { useState } from "react";
import { getNode, getPage } from "@vicolobuilder/engine";
import type { PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { uniqueId } from "../pages/pageIds.js";
import {
  applyCreationOffset,
  buildCreateElementCommand,
  elementIdBase,
  resolveNewElementParent,
  type ElementType,
} from "./createElementCommand.js";
import { isContainerLikeType } from "./textBearingTypes.js";

// Blocco 6 (rifinitura UI/UX, Punto 5 dell'audit): raggruppamento visivo
// nella STESSA riga (nessun pannello/livello aggiuntivo, fuori perimetro) -
// un separatore sottile distingue "strutturali" (possono contenere altri
// elementi) da "testo" (H1/H2/H3 compresi) da "media/interattivi". Non
// rinomina i bottoni H1/H2/H3: restano intestazioni HTML reali, rilevanti
// per la SEO (`SiteSeoManager.tsx` esiste già nel prodotto) - un titolo
// esplicativo va nel tooltip, non al posto del nome.
const GROUP_DIVIDER_STYLE = { width: 1, alignSelf: "stretch" as const, background: "#e5e7eb" };

export function ElementPalette({ store, activePageId }: { readonly store: ReactiveHistory; readonly activePageId: PageId }): JSX.Element {
  const document = useDocument(store);
  const activeBreakpoint = useActiveBreakpoint(store);
  const selection = useSelection(store);
  // Blocco 6, Punto 8 (caso "creazione redirect"): stesso meccanismo di
  // `moveError` in Canvas.tsx (messaggio transitorio dismissibile, mostrato
  // esattamente al momento dell'azione che lo motiva) - stato locale
  // separato perché ElementPalette e Canvas sono componenti fratelli in
  // App.tsx, non annidati: non c'è un unico stato React da condividere
  // senza sollevarlo, e farlo qui tocca solo questo file. Stile neutro
  // (non rosso/errore, a differenza di `moveError`): la creazione è
  // RIUSCITA, solo non dove ci si poteva aspettare - non è un fallimento.
  const [notice, setNotice] = useState<string | null>(null);

  function handleAdd(elementType: ElementType): void {
    const page = getPage(document, activePageId);
    if (!page) return;

    // Fase 7: una "scena" (Punto 1, Opzione B) va sempre figlia diretta
    // della radice pagina - il motore di navigazione (preview/scenes.ts)
    // legge solo `childrenIds` della radice, mai annidamenti più profondi.
    // A differenza di "testo"/"contenitore", ignora quindi la selezione
    // corrente invece di passare da `resolveNewElementParent`.
    const parentId =
      elementType === "scene" ? page.rootNodeId : resolveNewElementParent(document, page.rootNodeId, selection, activeBreakpoint);

    // Blocco 6, Punto 8 (audit Builder UI/UX): se una selezione CONTENITORE
    // esisteva ma il nuovo elemento non è finito dentro di essa, è perché
    // quel contenitore non è (più) in modalità "libero" - senza questo
    // avviso l'utente vede l'elemento comparire altrove senza spiegazione
    // (trovato verificando in browser: cambiare layoutMode di un
    // contenitore selezionato a "pila" reindirizza silenziosamente i nuovi
    // elementi alla radice pagina). Ristretto ai casi in cui la selezione
    // era un CONTENITORE (isContainerLikeType): su una foglia (testo/
    // immagine) annidare non è mai stato possibile con nessun layoutMode,
    // quindi non c'è alcuna aspettativa violata da spiegare.
    if (elementType !== "scene" && selection !== null && parentId !== selection) {
      const selectedNode = getNode(document, selection);
      setNotice(
        selectedNode && isContainerLikeType(selectedNode.type)
          ? `Il nuovo elemento non è stato creato dentro "${selection}": quel contenitore non è in modalità "Libero", quindi non può ricevere elementi da qui. È stato creato nella radice della pagina.`
          : null,
      );
    } else {
      setNotice(null);
    }

    const nodeId = uniqueId(elementIdBase(elementType), new Set(document.nodes.keys()));
    const command = applyCreationOffset(document, parentId, activeBreakpoint, buildCreateElementCommand(elementType, nodeId, parentId));
    store.execute(command);
    // Approvato: il nuovo elemento diventa la selezione attiva, stesso
    // pattern già usato per una pagina appena creata (PageManager.tsx).
    store.select(nodeId);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <button onClick={() => handleAdd("container")} title="Un riquadro che può contenere altri elementi">
          + Contenitore
        </button>
        <button onClick={() => handleAdd("scene")}>+ Scena</button>
        <button onClick={() => handleAdd("griglia")} title="Un contenitore che dispone i propri figli in colonne">
          + Griglia
        </button>
        <div style={GROUP_DIVIDER_STYLE} />
        <button onClick={() => handleAdd("text")}>+ Testo</button>
        <button onClick={() => handleAdd("h1")} title="Titolo principale della pagina (intestazione HTML H1, rilevante per la SEO)">
          + H1
        </button>
        <button onClick={() => handleAdd("h2")} title="Titolo di sezione (intestazione HTML H2, rilevante per la SEO)">
          + H2
        </button>
        <button onClick={() => handleAdd("h3")} title="Sottotitolo di sezione (intestazione HTML H3, rilevante per la SEO)">
          + H3
        </button>
        <button onClick={() => handleAdd("paragraph")}>+ Paragrafo</button>
        <div style={GROUP_DIVIDER_STYLE} />
        <button onClick={() => handleAdd("link")}>+ Link</button>
        <button onClick={() => handleAdd("image")}>+ Immagine</button>
      </div>
      {notice ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}>OK</button>
        </div>
      ) : null}
    </div>
  );
}
