import { useEffect, useRef, useState } from "react";
import { getNode, resolveNode } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { buildUpdatePropsCommand, type ContentKey, type GeometryKey, type StyleKey } from "../write/buildUpdatePropsCommand.js";
import { frozenFieldState } from "./frozenFieldState.js";
import { asFiniteNumber } from "../asFiniteNumber.js";
import { isTextBearingType } from "../elements/textBearingTypes.js";

/**
 * Fase 5, Blocco D (Decisione D7): ambito minimo — solo i campi già
 * significativi per il Layout Engine (x/y/width/height) più due campi di
 * contenuto (text/color). Nessuno schema di proprietà generale in questo
 * blocco.
 *
 * Fase S1 — primo caso di visibilità CONDIZIONALE: `columns`/`gap` compaiono
 * solo quando `resolvedProps.layoutMode === "griglia"` (decisione esplicita
 * del proprietario del prodotto: questo diventa il pattern standard per
 * campi specifici-per-tipo, non un'eccezione una tantum - es. `href` di
 * Fase 9 lo seguirà quando arriverà in questo pannello).
 *
 * Fase S2 — `fontSize` segue lo stesso pattern: visibile solo per i tipi
 * che portano testo (`isTextBearingType`, `elements/textBearingTypes.ts`).
 * A differenza di `columns`/`gap`, la condizione guarda `node.type`
 * DIRETTO, non un valore risolto - `type` non ha mai un override per
 * fascia (nessun comando lo modifica dopo `CREATE_NODE`), quindi non c'è
 * nulla da risolvere.
 *
 * Fase 15 (Elemento immagine) — `src`/`alt`/`objectFit` seguono lo stesso
 * pattern di condizione diretta su `node.type === "image"` (stessa natura
 * di `isTextBearingType`: `type` non varia mai per fascia). `src`/`alt`
 * sono CONTENT_KEYS (nessun badge, come `text`/`color`); `objectFit` è
 * STYLE_KEYS (badge ereditato/overridden-here, come `fontSize`).
 *
 * Fase 16 (Font custom) — `fontFamily`/`fontWeight` visibili sugli stessi
 * tipi di `fontSize` (`isTextBearingType`), STYLE_KEYS (Punto 3/4), stesso
 * badge di congelamento.
 */

function NumberField({
  label,
  value,
  badge,
  onCommit,
}: {
  readonly label: string;
  readonly value: number | undefined;
  readonly badge?: string;
  readonly onCommit: (value: number) => void;
}): JSX.Element {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const focused = useRef(false);

  // Il valore risolto può cambiare per una via diversa da questo stesso
  // campo (es. un trascinamento sul Canvas sullo stesso nodo/fascia già
  // selezionati - la `key` sui campi copre solo il cambio di nodo/fascia,
  // non un cambio di valore a parità di nodo/fascia). Non risincronizzare
  // mentre l'utente sta scrivendo dentro il campo (altrimenti un evento
  // esterno cancellerebbe la digitazione in corso).
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? "" : String(value));
  }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        {label} {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <input
        type="number"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          const n = Number(text);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  badge,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly badge?: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        {label} {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
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

export function PropertyPanel({ store }: { store: ReactiveHistory }): JSX.Element {
  const document = useDocument(store);
  const selection = useSelection(store);
  const activeBreakpoint = useActiveBreakpoint(store);

  if (selection === null) {
    return <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>Nessuna selezione.</div>;
  }

  const node = getNode(document, selection);
  if (!node) {
    // Selezione "pendente" (Blocco C): il nodo selezionato non esiste più
    // nel Document corrente (es. cancellato, o annullato con undo la
    // CREATE_NODE che lo aveva creato).
    return (
      <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>
        Il nodo selezionato ("{selection}") non esiste più nel Document.
      </div>
    );
  }

  const resolved = resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps;
  const fieldKeyPrefix = `${node.id}:${activeBreakpoint}`;

  function commitGeometry(key: GeometryKey, value: unknown): void {
    store.execute(buildUpdatePropsCommand(document, node!.id, activeBreakpoint, { [key]: value }));
  }

  function commitContent(key: ContentKey, value: unknown): void {
    store.execute(buildUpdatePropsCommand(document, node!.id, activeBreakpoint, { [key]: value }));
  }

  function commitStyle(key: StyleKey, value: unknown): void {
    store.execute(buildUpdatePropsCommand(document, node!.id, activeBreakpoint, { [key]: value }));
  }

  // Fase S1: visibile solo per un nodo la cui modalità RISOLTA (alla fascia
  // attiva, non solo il prop base) è "griglia" - stesso trattamento già
  // usato per il collocamento di un nuovo elemento (isLiberoContainer,
  // createElementCommand.ts): un override responsive di layoutMode va
  // rispettato, non solo il valore base.
  const isGrid = resolved.layoutMode === "griglia";
  const isTextBearing = isTextBearingType(node.type);
  const isImage = node.type === "image";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
      <div>
        <strong>{node.id}</strong> <span style={{ opacity: 0.6 }}>({node.type})</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Vista: {activeBreakpoint}</div>

      <NumberField
        key={`${fieldKeyPrefix}:x`}
        label="x"
        value={asFiniteNumber(resolved.x)}
        badge={frozenFieldState(node, activeBreakpoint, "x")}
        onCommit={(n) => commitGeometry("x", n)}
      />
      <NumberField
        key={`${fieldKeyPrefix}:y`}
        label="y"
        value={asFiniteNumber(resolved.y)}
        badge={frozenFieldState(node, activeBreakpoint, "y")}
        onCommit={(n) => commitGeometry("y", n)}
      />
      <NumberField
        key={`${fieldKeyPrefix}:width`}
        label="width"
        value={asFiniteNumber(resolved.width)}
        badge={frozenFieldState(node, activeBreakpoint, "width")}
        onCommit={(n) => commitGeometry("width", n)}
      />
      <NumberField
        key={`${fieldKeyPrefix}:height`}
        label="height"
        value={asFiniteNumber(resolved.height)}
        badge={frozenFieldState(node, activeBreakpoint, "height")}
        onCommit={(n) => commitGeometry("height", n)}
      />

      {isGrid ? (
        <NumberField
          key={`${fieldKeyPrefix}:columns`}
          label="columns"
          value={asFiniteNumber(resolved.columns)}
          badge={frozenFieldState(node, activeBreakpoint, "columns")}
          onCommit={(n) => commitStyle("columns", n)}
        />
      ) : null}
      {isGrid ? (
        <NumberField
          key={`${fieldKeyPrefix}:gap`}
          label="gap"
          value={asFiniteNumber(resolved.gap)}
          badge={frozenFieldState(node, activeBreakpoint, "gap")}
          onCommit={(n) => commitStyle("gap", n)}
        />
      ) : null}

      {isTextBearing ? (
        <TextField
          key={`${fieldKeyPrefix}:fontSize`}
          label="fontSize"
          value={typeof resolved.fontSize === "string" ? resolved.fontSize : ""}
          badge={frozenFieldState(node, activeBreakpoint, "fontSize")}
          onCommit={(s) => commitStyle("fontSize", s)}
        />
      ) : null}
      {isTextBearing ? (
        <TextField
          key={`${fieldKeyPrefix}:fontFamily`}
          label="fontFamily"
          value={typeof resolved.fontFamily === "string" ? resolved.fontFamily : ""}
          badge={frozenFieldState(node, activeBreakpoint, "fontFamily")}
          onCommit={(s) => commitStyle("fontFamily", s)}
        />
      ) : null}
      {isTextBearing ? (
        <TextField
          key={`${fieldKeyPrefix}:fontWeight`}
          label="fontWeight"
          value={typeof resolved.fontWeight === "string" ? resolved.fontWeight : ""}
          badge={frozenFieldState(node, activeBreakpoint, "fontWeight")}
          onCommit={(s) => commitStyle("fontWeight", s)}
        />
      ) : null}

      {isImage ? (
        <TextField
          key={`${fieldKeyPrefix}:src`}
          label="src"
          value={typeof resolved.src === "string" ? resolved.src : ""}
          onCommit={(s) => commitContent("src", s)}
        />
      ) : null}
      {isImage ? (
        <TextField
          key={`${fieldKeyPrefix}:alt`}
          label="alt"
          value={typeof resolved.alt === "string" ? resolved.alt : ""}
          onCommit={(s) => commitContent("alt", s)}
        />
      ) : null}
      {isImage ? (
        <TextField
          key={`${fieldKeyPrefix}:objectFit`}
          label="objectFit"
          value={typeof resolved.objectFit === "string" ? resolved.objectFit : ""}
          badge={frozenFieldState(node, activeBreakpoint, "objectFit")}
          onCommit={(s) => commitStyle("objectFit", s)}
        />
      ) : null}

      <TextField
        key={`${fieldKeyPrefix}:text`}
        label="text"
        value={typeof resolved.text === "string" ? resolved.text : ""}
        onCommit={(s) => commitContent("text", s)}
      />
      <TextField
        key={`${fieldKeyPrefix}:color`}
        label="color"
        value={typeof resolved.color === "string" ? resolved.color : ""}
        onCommit={(s) => commitContent("color", s)}
      />
    </div>
  );
}
