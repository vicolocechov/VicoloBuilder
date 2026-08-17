import { useEffect, useRef, useState } from "react";
import { getNode, resolveNode } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useActiveBreakpoint, useDocument, useSelection } from "../history/useHistoryStore.js";
import { buildUpdatePropsCommand, type ContentKey, type GeometryKey, type StyleKey } from "../write/buildUpdatePropsCommand.js";
import { buildUpdateHoverPropsCommand } from "../write/buildUpdateHoverPropsCommand.js";
import { frozenFieldState } from "./frozenFieldState.js";
import { asFiniteNumber } from "../asFiniteNumber.js";
import { isTextBearingType } from "../elements/textBearingTypes.js";
import { readRegisteredFonts } from "@vicolobuilder/render-conventions";
import { FileUploadButton } from "../fileUpload/FileUploadButton.js";
import type { HoverKey } from "@vicolobuilder/render-conventions";

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
 * Fase 17 (Transizioni CSS di base) — `transition` (STYLE_KEYS) e i quattro
 * campi di `props.hover` (`color`/`background`/`transform`/`borderColor`,
 * nessun badge: `props.hover` è un bag separato, mai congelato per
 * fascia, Punto 2 dell'analisi) visibili SOLO su `node.type === "link"`
 * (decisione esplicita del proprietario del prodotto, valutata a
 * confronto con "nessuna restrizione"/"anche i contenitori": nel sito di
 * riferimento OGNI target di una regola `:hover` è un `<a>` diretto - 30
 * casi su 31 - o il suo contenitore immediato che incapsula un `<a>` - 1
 * caso, `.porta` - mai un testo/immagine/contenitore generico senza
 * link. Restringere a "link" copre il caso univoco (pulsanti/CTA);
 * l'effetto di sollevamento del contenitore-carta resta fuori dal nucleo,
 * segnalato, rimandato a un eventuale futuro tipo "card" - stessa logica
 * di rimando già usata per `og:*`, D-027).
 *
 * Fase 16 (Font custom) — `fontFamily`/`fontWeight` visibili sugli stessi
 * tipi di `fontSize` (`isTextBearingType`), STYLE_KEYS (Punto 3/4), stesso
 * badge di congelamento.
 *
 * B1 (href modificabile, analisi pre-Exporter) — `href` in CONTENT_KEYS
 * (nessun badge, come `text`/`color`/`src`/`alt`), visibile solo su
 * `node.type === "link"` (stesso ambito già stabilito per hover/transition
 * in Fase 17, qui ancora meno ambiguo: `href` non ha senso su alcun altro
 * tipo). Nessuna validazione di schema (Opzione A dell'analisi, approvata)
 * - vedi DECISIONS.md D-032 per l'obbligo, vincolante ma rimandato
 * all'Exporter, di sanificare `href` in output.
 *
 * B2 (identificatore stabile per ancore interne, Opzione C approvata) —
 * `anchorId` in CONTENT_KEYS, campo "ancora" SEMPRE visibile (nessuna
 * condizione di tipo, a differenza di ogni altro campo condizionale di
 * questo pannello): i bersagli reali di un'ancora nel sito di riferimento
 * non condividono un ruolo strutturale comune, mai un "link" - nessuna
 * restrizione di tipo pulita è supportata dai dati. Nessuna validazione
 * di unicità (stesso trattamento di `href`) - vedi DECISIONS.md D-033.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

// Blocco 1 (audit Builder UI/UX): `layoutMode` non aveva finora alcun campo
// nel pannello (era leggibile solo indirettamente, es. spostando un
// elemento in un contenitore libero) - qui esposto con un <select> invece
// di un TextField libero, perché l'insieme dei valori validi è chiuso e
// noto ("pila"/"libero"/"griglia": stesso insieme validato da
// resolver/breakpoints.ts) - un campo di testo libero permetterebbe refusi
// silenziosi (es. "Libero" con maiuscola) che non produrrebbero errore
// finché non si prova a trascinare.
const LAYOUT_MODES = ["pila", "libero", "griglia"] as const;

function LayoutModeField({
  value,
  badge,
  onCommit,
}: {
  readonly value: string;
  readonly badge?: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        layoutMode {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <select value={value} onChange={(e) => onCommit(e.target.value)}>
        {LAYOUT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {mode}
          </option>
        ))}
      </select>
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

/**
 * Blocco 2 (audit Builder UI/UX, "controlli visivi"): un vero selettore
 * colore interattivo (`<input type="color">`, nativo del browser - palette/
 * gradiente reali), non un campo HEX travestito. Il valore memorizzato può
 * però essere una stringa CSS che il picker nativo non sa rappresentare
 * (es. "transparent", "rgba(...)", un nome colore) - `<input type="color">`
 * accetta SOLO "#rrggbb". Il campo di testo accanto non è un travestimento
 * del picker (che resta il controllo primario e sempre presente): è
 * l'unico modo di vedere/scrivere un valore che il picker non può
 * rappresentare, senza perderlo silenziosamente al primo tocco del picker
 * stesso (che scrive SOLO quando l'autore lo usa davvero, `onChange` del
 * colore, mai in automatico dalla sola lettura del valore corrente).
 */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function ColorField({
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
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type="color"
          value={isHexColor(text) ? text : "#000000"}
          title="Scegli un colore"
          onChange={(e) => {
            setText(e.target.value);
            onCommit(e.target.value);
          }}
          style={{ width: 32, height: 24, padding: 0, border: "1px solid #d1d5db", cursor: "pointer" }}
        />
        <input
          type="text"
          value={text}
          placeholder="hex, rgba(), transparent…"
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            focused.current = false;
            onCommit(text);
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
    </label>
  );
}

/**
 * Blocco 2: elenco a tendina dei font EFFETTIVAMENTE registrati
 * (`Document.props.fonts`, stessa lettura di `App.tsx`/`FontManager.tsx`
 * tramite `readRegisteredFonts` - nessuna lista inventata qui). Una
 * famiglia può avere più pesi registrati (FontManager.tsx) - deduplicata
 * per famiglia: il peso si sceglie a parte nel campo `fontWeight` già
 * esistente. Se non c'è ancora nessun font registrato, un messaggio
 * esplicito sostituisce il menu (decisione esplicita del proprietario del
 * prodotto: mai un dropdown vuoto silenzioso).
 */
function FontFamilyField({
  value,
  badge,
  families,
  onCommit,
}: {
  readonly value: string;
  readonly badge?: string;
  readonly families: readonly string[];
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  if (families.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
        <span>
          fontFamily {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
        </span>
        <span style={{ opacity: 0.7, fontStyle: "italic" }}>
          Nessun font registrato — aggiungilo dal pannello "Font" a sinistra.
        </span>
      </div>
    );
  }
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        fontFamily {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <select value={families.includes(value) ? value : ""} onChange={(e) => onCommit(e.target.value)}>
        <option value="">(predefinito del browser)</option>
        {families.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </select>
    </label>
  );
}

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Sinistra" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Destra" },
] as const;

/** Tre righe orizzontali, allineate/centrate/allineate a destra dentro l'icona - la lunghezza decrescente imita un blocco di testo reale, non tre barre identiche. */
function AlignIcon({ align }: { readonly align: "left" | "center" | "right" }): JSX.Element {
  const widths = [12, 8, 10];
  function lineX(w: number): number {
    if (align === "left") return 2;
    if (align === "center") return (16 - w) / 2;
    return 14 - w;
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {widths.map((w, i) => (
        <rect key={i} x={lineX(w)} y={3 + i * 4} width={w} height={1.6} rx={0.8} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Icon-button (Blocco 2, "controlli visivi"): stato attivo mostrato con bordo/sfondo/colore, non solo un valore di testo selezionato in un <select>. */
function TextAlignField({
  value,
  badge,
  onCommit,
}: {
  readonly value: string;
  readonly badge?: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        textAlign {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        {TEXT_ALIGN_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => onCommit(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 24,
                padding: 0,
                border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: active ? "#dbeafe" : "#fff",
                color: active ? "#2563eb" : "#374151",
                cursor: "pointer",
              }}
            >
              <AlignIcon align={opt.value} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Blocco 4 ("rifinitura visiva"): stesso insieme chiuso e noto di
// `LayoutModeField` - un <select>, non un TextField libero (i valori CSS
// validi per `border-style` sono un insieme fisso, un refuso qui
// produrrebbe un bordo silenziosamente invisibile, non un errore).
const BORDER_STYLES = ["solid", "dashed", "dotted"] as const;

function BorderStyleField({
  value,
  badge,
  onCommit,
}: {
  readonly value: string;
  readonly badge?: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        borderStyle {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <select value={value} onChange={(e) => onCommit(e.target.value)}>
        {BORDER_STYLES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Blocco 4: uno slider reale (0-100%), non un campo numerico libero -
 * `opacity` è per natura un intervallo chiuso [0,1], un cursore lo rende
 * visivamente ovvio senza dover ricordare l'intervallo valido. Commit solo
 * al rilascio (`onPointerUp`/`onBlur`), non ad ogni variazione durante il
 * trascinamento del cursore: altrimenti ogni micro-spostamento
 * scriverebbe una voce di undo, come già evitato per gli altri campi con
 * la soglia di trascinamento del Canvas.
 */
function OpacityField({
  value,
  badge,
  onCommit,
}: {
  readonly value: number;
  readonly badge?: string;
  readonly onCommit: (value: number) => void;
}): JSX.Element {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>
        opacity {badge ? <em style={{ opacity: 0.6 }}>({badge})</em> : null}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={local}
          onChange={(e) => setLocal(Number(e.target.value))}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => {
            dragging.current = false;
            onCommit(local);
          }}
          onBlur={() => {
            dragging.current = false;
            onCommit(local);
          }}
          style={{ flex: 1 }}
        />
        <span style={{ width: 32, textAlign: "right" }}>{Math.round(local * 100)}%</span>
      </div>
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

  function commitHover(key: HoverKey, value: string): void {
    store.execute(buildUpdateHoverPropsCommand(document, node!.id, { [key]: value }));
  }

  // Fase S1: visibile solo per un nodo la cui modalità RISOLTA (alla fascia
  // attiva, non solo il prop base) è "griglia" - stesso trattamento già
  // usato per il collocamento di un nuovo elemento (isLiberoContainer,
  // createElementCommand.ts): un override responsive di layoutMode va
  // rispettato, non solo il valore base.
  const isGrid = resolved.layoutMode === "griglia";
  const isTextBearing = isTextBearingType(node.type);
  const isImage = node.type === "image";
  // Fase 17: ristretto a "link" (decisione esplicita, vedi commento sopra
  // sul PropertyPanel) - a differenza di isGrid, non serve un valore
  // RISOLTO: `type` non ha mai un override per fascia.
  const isInteractive = node.type === "link";
  const hover = isPlainObject(resolved.hover) ? resolved.hover : {};

  // Blocco 2: famiglie deduplicate (una famiglia può avere più pesi
  // registrati, FontManager.tsx) - stesso ordine di registrazione, nessun
  // riordino alfabetico non richiesto.
  const registeredFontFamilies: readonly string[] = Array.from(
    new Set(readRegisteredFonts(document).map((f) => f.family)),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
      <div>
        <strong>{node.id}</strong> <span style={{ opacity: 0.6 }}>({node.type})</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Vista: {activeBreakpoint}</div>

      <TextField
        key={`${fieldKeyPrefix}:anchorId`}
        label="ancora"
        value={typeof resolved.anchorId === "string" ? resolved.anchorId : ""}
        onCommit={(s) => commitContent("anchorId", s)}
      />

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
      <LayoutModeField
        key={`${fieldKeyPrefix}:layoutMode`}
        value={typeof resolved.layoutMode === "string" ? resolved.layoutMode : "pila"}
        badge={frozenFieldState(node, activeBreakpoint, "layoutMode")}
        onCommit={(s) => commitGeometry("layoutMode", s)}
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
        <FontFamilyField
          key={`${fieldKeyPrefix}:fontFamily`}
          value={typeof resolved.fontFamily === "string" ? resolved.fontFamily : ""}
          badge={frozenFieldState(node, activeBreakpoint, "fontFamily")}
          families={registeredFontFamilies}
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
      {isTextBearing ? (
        <TextAlignField
          key={`${fieldKeyPrefix}:textAlign`}
          value={typeof resolved.textAlign === "string" ? resolved.textAlign : "left"}
          badge={frozenFieldState(node, activeBreakpoint, "textAlign")}
          onCommit={(s) => commitStyle("textAlign", s)}
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
        // Blocco 5: stesso valore di "src" sopra (una data-URI), solo un
        // modo più comodo di ottenerlo - non un campo separato, scrive
        // sullo stesso "src".
        <FileUploadButton key={`${fieldKeyPrefix}:src-upload`} accept="image/*" onLoaded={(dataUrl) => commitContent("src", dataUrl)} />
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

      {isInteractive ? (
        <TextField
          key={`${fieldKeyPrefix}:href`}
          label="href"
          value={typeof resolved.href === "string" ? resolved.href : ""}
          onCommit={(s) => commitContent("href", s)}
        />
      ) : null}
      {isInteractive ? (
        <TextField
          key={`${fieldKeyPrefix}:transition`}
          label="transition"
          value={typeof resolved.transition === "string" ? resolved.transition : ""}
          badge={frozenFieldState(node, activeBreakpoint, "transition")}
          onCommit={(s) => commitStyle("transition", s)}
        />
      ) : null}
      {isInteractive ? (
        <ColorField
          key={`${fieldKeyPrefix}:hover:color`}
          label="hover: color"
          value={typeof hover.color === "string" ? hover.color : ""}
          onCommit={(s) => commitHover("color", s)}
        />
      ) : null}
      {isInteractive ? (
        <ColorField
          key={`${fieldKeyPrefix}:hover:background`}
          label="hover: background"
          value={typeof hover.background === "string" ? hover.background : ""}
          onCommit={(s) => commitHover("background", s)}
        />
      ) : null}
      {isInteractive ? (
        <TextField
          key={`${fieldKeyPrefix}:hover:transform`}
          label="hover: transform"
          value={typeof hover.transform === "string" ? hover.transform : ""}
          onCommit={(s) => commitHover("transform", s)}
        />
      ) : null}
      {isInteractive ? (
        <ColorField
          key={`${fieldKeyPrefix}:hover:borderColor`}
          label="hover: borderColor"
          value={typeof hover.borderColor === "string" ? hover.borderColor : ""}
          onCommit={(s) => commitHover("borderColor", s)}
        />
      ) : null}

      {/* Blocco 4 ("rifinitura visiva"): bordo/border-radius/opacity/padding
          - sempre visibili, nessuna condizione di tipo (a differenza dei
          campi tipografici/immagine/link sopra): sono proprietà visive
          pure che hanno senso su qualunque elemento, stesso trattamento di
          x/y/width/height. */}
      <NumberField
        key={`${fieldKeyPrefix}:borderWidth`}
        label="borderWidth"
        value={asFiniteNumber(resolved.borderWidth)}
        badge={frozenFieldState(node, activeBreakpoint, "borderWidth")}
        onCommit={(n) => commitStyle("borderWidth", n)}
      />
      <ColorField
        key={`${fieldKeyPrefix}:borderColor`}
        label="borderColor"
        value={typeof resolved.borderColor === "string" ? resolved.borderColor : ""}
        badge={frozenFieldState(node, activeBreakpoint, "borderColor")}
        onCommit={(s) => commitStyle("borderColor", s)}
      />
      <BorderStyleField
        key={`${fieldKeyPrefix}:borderStyle`}
        value={typeof resolved.borderStyle === "string" ? resolved.borderStyle : "solid"}
        badge={frozenFieldState(node, activeBreakpoint, "borderStyle")}
        onCommit={(s) => commitStyle("borderStyle", s)}
      />
      <NumberField
        key={`${fieldKeyPrefix}:borderRadius`}
        label="borderRadius"
        value={asFiniteNumber(resolved.borderRadius)}
        badge={frozenFieldState(node, activeBreakpoint, "borderRadius")}
        onCommit={(n) => commitStyle("borderRadius", n)}
      />
      <OpacityField
        key={`${fieldKeyPrefix}:opacity`}
        value={asFiniteNumber(resolved.opacity) ?? 1}
        badge={frozenFieldState(node, activeBreakpoint, "opacity")}
        onCommit={(n) => commitStyle("opacity", n)}
      />
      <NumberField
        key={`${fieldKeyPrefix}:padding`}
        label="padding"
        value={asFiniteNumber(resolved.padding)}
        badge={frozenFieldState(node, activeBreakpoint, "padding")}
        onCommit={(n) => commitStyle("padding", n)}
      />

      <TextField
        key={`${fieldKeyPrefix}:text`}
        label="text"
        value={typeof resolved.text === "string" ? resolved.text : ""}
        onCommit={(s) => commitContent("text", s)}
      />
      <ColorField
        key={`${fieldKeyPrefix}:color`}
        label="color"
        value={typeof resolved.color === "string" ? resolved.color : ""}
        onCommit={(s) => commitContent("color", s)}
      />
    </div>
  );
}
