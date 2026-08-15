import { useEffect, useRef, useState } from "react";
import type { PageId } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useDocument } from "../history/useHistoryStore.js";
import { slugify, uniqueId } from "./pageIds.js";
import { movePageOrder } from "./movePageOrder.js";
import { buildUpdatePagePropsCommand, type PageSeoKey } from "../write/buildUpdatePagePropsCommand.js";

/**
 * Fase 5, Blocco E: livello sottile sopra CREATE_PAGE/DELETE_PAGE/REORDER_PAGES
 * (Blocco A) e ReactiveHistory (Blocco D), riusati così come sono - nessuna
 * modifica ai comandi né al write-adapter/Canvas del Blocco D.
 *
 * "Vista pagina attiva" (`activePageId`/`onActivePageChange`): a differenza
 * di selection/activeBreakpoint (Blocco C/D), NON aggiunta a History in
 * questo blocco - tenuta come stato locale del chiamante (App). Scelta
 * conservativa per rispettare "livello sottile, non reinterpretare quanto
 * già stabilito": estendere ancora History non era parte del vincolo dato,
 * quindi non l'ho fatto senza chiederlo. Segnalata, non decisa da sola.
 *
 * Fase 14 (SEO per pagina, Punto 6 dell'analisi - decisione esplicita del
 * proprietario del prodotto): editing di title/description/canonical qui,
 * non nel PropertyPanel - un titolo SEO appartiene alla pagina nel suo
 * insieme, non a un nodo selezionato, e non varia per fascia (a differenza
 * dei campi del PropertyPanel non ha bisogno di `activeBreakpoint` né di
 * badge ereditato/overridden).
 */

function SeoTextField({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          onCommit(text);
        }}
      />
    </label>
  );
}

export function PageManager({
  store,
  activePageId,
  onActivePageChange,
}: {
  readonly store: ReactiveHistory;
  readonly activePageId: PageId;
  readonly onActivePageChange: (pageId: PageId) => void;
}): JSX.Element {
  const document = useDocument(store);
  const [newPageName, setNewPageName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate(): void {
    setError(null);
    const name = newPageName.trim();
    if (!name) return;

    const takenPageIds = new Set(document.pages.keys());
    const takenNodeIds = new Set(document.nodes.keys());
    const slug = slugify(name);
    const pageId = uniqueId(`page-${slug}`, takenPageIds);
    const rootNodeId = uniqueId(`root-${slug}`, takenNodeIds);

    try {
      store.execute({ type: "CREATE_PAGE", pageId, name, rootNodeId });
      setNewPageName("");
      onActivePageChange(pageId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDelete(pageId: PageId): void {
    setError(null);
    try {
      store.execute({ type: "DELETE_PAGE", pageId });
      if (activePageId === pageId) {
        const remaining = document.pageOrder.filter((id) => id !== pageId);
        onActivePageChange(remaining[0] ?? document.rootPageId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleMove(pageId: PageId, direction: -1 | 1): void {
    setError(null);
    const next = movePageOrder(document.pageOrder, pageId, direction);
    if (!next) return;
    try {
      store.execute({ type: "REORDER_PAGES", pageOrder: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function commitSeo(key: PageSeoKey, value: string): void {
    setError(null);
    try {
      store.execute(buildUpdatePagePropsCommand(activePageId, { [key]: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const activePage = document.pages.get(activePageId);

  return (
    <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
      <div style={{ fontWeight: "bold", marginBottom: 6 }}>Pagine</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {document.pageOrder.map((pageId, index) => {
          const page = document.pages.get(pageId);
          if (!page) return null;
          const isActive = pageId === activePageId;
          const isRootPage = pageId === document.rootPageId;

          return (
            <li key={pageId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => onActivePageChange(pageId)}
                style={{ fontWeight: isActive ? "bold" : "normal", flex: 1, textAlign: "left" }}
              >
                {page.name} {isRootPage ? "(iniziale)" : ""}
              </button>
              <button onClick={() => handleMove(pageId, -1)} disabled={index === 0} title="Sposta su">
                ↑
              </button>
              <button
                onClick={() => handleMove(pageId, 1)}
                disabled={index === document.pageOrder.length - 1}
                title="Sposta giù"
              >
                ↓
              </button>
              <button onClick={() => handleDelete(pageId)} title="Elimina">
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
        <input
          type="text"
          value={newPageName}
          onChange={(e) => setNewPageName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Nome nuova pagina"
          style={{ flex: 1 }}
        />
        <button onClick={handleCreate}>+ Pagina</button>
      </div>
      {activePage ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: "bold" }}>SEO — {activePage.name}</div>
          <SeoTextField
            key={`${activePageId}:title`}
            label="title"
            value={typeof activePage.props.title === "string" ? activePage.props.title : ""}
            onCommit={(s) => commitSeo("title", s)}
          />
          <SeoTextField
            key={`${activePageId}:description`}
            label="description"
            value={typeof activePage.props.description === "string" ? activePage.props.description : ""}
            onCommit={(s) => commitSeo("description", s)}
          />
          <SeoTextField
            key={`${activePageId}:canonical`}
            label="canonical"
            value={typeof activePage.props.canonical === "string" ? activePage.props.canonical : ""}
            onCommit={(s) => commitSeo("canonical", s)}
          />
        </div>
      ) : null}
      {error ? <div style={{ color: "#b91c1c", marginTop: 4 }}>{error}</div> : null}
    </div>
  );
}
