import { requireNode, resolveNode, widerBreakpoints } from "@vicolobuilder/engine";
import type { BreakpointName, Document, NodeId, UpdatePropsCommand } from "@vicolobuilder/engine";
import { BASE_TIER } from "../breakpoints.js";

/**
 * Fase 5, Blocco D — regola Desktop-first di scrittura (PRODUCT_DESIGN.md,
 * sez. 6, Decisione 1) + separazione geometria/contenuto (decisione del
 * proprietario del prodotto, turno di approvazione dell'Opzione A).
 *
 * Fase S1 (analisi griglia responsive, Punto 1 - decisione esplicita del
 * proprietario del prodotto): terza categoria, `STYLE_KEYS` - stesso
 * comportamento di congelamento di `GEOMETRY_KEYS` (varia per fascia, un
 * edit su una fascia stretta congela le fasce più larghe prive di override
 * proprio), ma non è box-geometry in senso stretto - un nome proprio evita
 * di rendere fuorviante `GEOMETRY_KEYS`. Stessa decisione chiude anche la
 * domanda lasciata esplicitamente aperta in D-023 per `fontSize`: entra qui,
 * non in `GEOMETRY_KEYS`.
 *
 * Tre elenchi CHIUSI: nessun'altra chiave entra senza approvazione esplicita
 * (vedi `buildUpdatePropsCommand`, che lancia su qualunque chiave fuori da
 * questi tre elenchi).
 *
 * Fase 15 (Elemento immagine): `objectFit` entra in `STYLE_KEYS` (Punto 4,
 * decisione esplicita del proprietario del prodotto - stesso trattamento
 * di congelamento di `columns`/`gap`/`fontSize`, nessuna evidenza reale di
 * un valore diverso per fascia ma stessa natura "specifico-per-tipo,
 * variabile" delle altre voci di questa categoria). `src`/`alt` entrano in
 * `CONTENT_KEYS`: nessuna evidenza nel sito reale di un'immagine che
 * cambi sorgente per fascia responsive - stesso ragionamento già accettato
 * per `href` in Fase 9 (D-024), non una decisione aperta.
 *
 * Fase 16 (Font custom, Punto 3/4 - decisione esplicita): `fontFamily` e
 * `fontWeight` entrano in `STYLE_KEYS`, STESSA classificazione già data a
 * `fontSize` (D-025) - non per analogia decisa qui, ma perché il
 * proprietario del prodotto l'ha esplicitamente confermata (a differenza
 * di `href`/`src`/`alt`, la classificazione tipografica non era stata
 * considerata "non ambigua" nell'analisi: `fontSize` stesso fu lasciato
 * esplicitamente aperto in D-023).
 *
 * Fase 17 (Transizioni CSS di base, Punto 2 - decisione esplicita):
 * `transition` (la proprietà di TIMING - durata/easing) entra in
 * `STYLE_KEYS`, mirror esatto di `fontSize`: stringa CSS opaca, stesso
 * congelamento per fascia. A differenza di `props.hover` (Punto 2, un
 * bag separato NON integrato con `props.responsive` - vedi
 * `@vicolobuilder/render-conventions`), `transition` è un valore scalare sui
 * props BASE del nodo, mirror esatto del sito reale (`transition` è
 * sempre dichiarata sulla regola base, mai dentro `:hover`).
 *
 * B1 (href modificabile, analisi pre-Exporter): `href` entra in
 * `CONTENT_KEYS` - classificazione già decisa in D-024 (Fase 9), non
 * riaperta qui ("passo a basso rischio quando servirà l'editing da UI,
 * non una domanda aperta"): nessuna evidenza reale di un `href` diverso
 * per fascia responsive. Nessuna validazione di schema qui (Opzione A
 * dell'analisi B1, approvata) - coerente col principio, mai violato in
 * questo file, che il Command Bus valida CHIAVI, non VALORI. La gestione
 * sicura di `href` in output (schemi ammessi, blocco di `javascript:` e
 * simili) è un criterio di chiusura VINCOLANTE dell'Exporter, non di
 * questo punto - vedi DECISIONS.md D-032.
 *
 * B2 (identificatore stabile per ancore interne, Opzione C approvata):
 * `anchorId` entra in `CONTENT_KEYS` - un prop LIBERO scelto dall'autore,
 * separato e mai sincronizzato con `NodeId` (che resta un campo
 * strutturale del Document Model, mai toccato da `UPDATE_PROPS` né da
 * alcun comando). Nessuna cascata per fascia (stesso ragionamento di
 * `href`: nessuna evidenza reale di un'ancora diversa per fascia).
 * Nessuna validazione di unicità qui (stesso trattamento di `href`,
 * D-032) - la garanzia di `id=` HTML univoci nell'output è un criterio
 * di chiusura VINCOLANTE dell'Exporter - vedi DECISIONS.md D-033.
 * Disponibile su TUTTI i tipi di nodo (a differenza di `href`/hover,
 * ristretti a "link"): i 13 bersagli reali di ancora nel sito di
 * riferimento non condividono un ruolo strutturale comune, mai un
 * "link" - nessuna restrizione di tipo pulita emerge dai dati.
 *
 * Blocco 2 (audit Builder UI/UX, "controlli visivi") — `textAlign` entra in
 * `STYLE_KEYS`, stessa classificazione/congelamento di `fontFamily`/
 * `fontWeight` (D-046): una proprietà tipografica, non contenuto, nessuna
 * evidenza contraria a trattarla come le altre STYLE_KEYS. Applicato in
 * Canvas.tsx E Preview.tsx insieme (stesso schema seguito per ogni
 * STYLE_KEY precedente: fontSize/S2, fontFamily+fontWeight/Fase16,
 * objectFit/Fase15, transition/Fase17) - i due renderer dell'editor restano
 * allineati, evitando la stessa classe di disallineamento Preview/pubblicato
 * chiusa con D-050 per le scene. L'Exporter (pacchetto chiuso, D-050) NON è
 * toccato: fuori dal perimetro di questa fase (Builder UI/UX), non
 * dell'Exporter v1.
 *
 * Blocco 4 (audit Builder UI/UX, "rifinitura visiva") — `borderWidth`/
 * `borderColor`/`borderStyle`/`borderRadius`/`opacity`/`padding` entrano in
 * `STYLE_KEYS`, stessa classificazione/congelamento di `textAlign`/
 * `fontFamily` (nessuna evidenza che debbano comportarsi diversamente per
 * fascia responsive - stesso ragionamento già accettato per ogni voce
 * precedente di questa categoria). Bordo scomposto in tre proprietà
 * (larghezza/colore/stile) invece di un'unica stringa CSS opaca come
 * `transition`: coerente con la direzione presa nel Blocco 2 (controlli
 * REALI, non stringhe CSS travestite da campo di testo - `borderColor`
 * riusa lo stesso `ColorField` già introdotto lì). `margin` deliberatamente
 * ESCLUSO da questo elenco - segnalato al proprietario del prodotto come
 * potenzialmente ambiguo nel modello di posizionamento attuale, non ancora
 * deciso (vedi DECISIONS.md, turno di apertura del Blocco 4).
 */
export const GEOMETRY_KEYS = ["x", "y", "width", "height", "layoutMode"] as const;
export const STYLE_KEYS = [
  "columns",
  "gap",
  "fontSize",
  "objectFit",
  "fontFamily",
  "fontWeight",
  "transition",
  "textAlign",
  "borderWidth",
  "borderColor",
  "borderStyle",
  "borderRadius",
  "opacity",
  "padding",
] as const;
export const CONTENT_KEYS = ["text", "color", "src", "alt", "href", "anchorId"] as const;

export type GeometryKey = (typeof GEOMETRY_KEYS)[number];
export type StyleKey = (typeof STYLE_KEYS)[number];
export type ContentKey = (typeof CONTENT_KEYS)[number];
export type EditableKey = GeometryKey | StyleKey | ContentKey;

const GEOMETRY_KEY_SET: ReadonlySet<string> = new Set(GEOMETRY_KEYS);
const STYLE_KEY_SET: ReadonlySet<string> = new Set(STYLE_KEYS);
const CONTENT_KEY_SET: ReadonlySet<string> = new Set(CONTENT_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ricostruisce `props.responsive` per una scrittura di geometria E/O stile
 * (Fase S1: stesso comportamento di congelamento per entrambe le categorie,
 * vedi commento su `STYLE_KEYS` sopra) su una fascia diversa dalla base
 * (Opzione A, "congelamento"): scrive l'edit sulla fascia attiva, poi - per
 * ciascuna fascia in cui l'edit si propagherebbe
 * (`widerBreakpoints`, Fase 6/D-019) e per ciascuna chiave cambiata priva
 * già di un override proprio LÌ - congela il valore RISOLTO per quella
 * fascia (via `resolveNode`, non il valore di base), così l'edit non si
 * propaga oltre (rischio descritto in PRODUCT_DESIGN.md sez. 6, Decisione 1).
 *
 * Fase 6: `widerBreakpoints` restituisce solo i vicini DIRETTI (un passo),
 * non l'intera catena - e questo basta, non serve risalire oltre: una volta
 * che una fascia T ha un override esplicito (preesistente o appena
 * congelato), quell'override vince per costruzione ogni volta che T stessa
 * compare nella cascata di una fascia ancora più larga - quindi qualunque
 * fascia "a valle" di T riceve comunque il valore corretto quando viene
 * risolta, senza bisogno di congelarla esplicitamente qui.
 *
 * A differenza della Fase 5 (dove ogni fascia aveva AL PIÙ una fascia più
 * larga, una semplice catena), Fase 6 introduce fasce con PIÙ vicini diretti
 * indipendenti in linea di principio - per questo ogni fascia restituita da
 * `widerBreakpoints` viene congelata INDIPENDENTEMENTE con l'intero insieme
 * di chiavi cambiate (non un pool che si esaurisce dopo la prima fascia
 * processata, bug presente nella versione Fase 5 e mai emerso allora solo
 * perché nessuna fascia aveva più di un vicino diretto).
 */
function buildFrozenResponsive(
  document: Document,
  nodeId: NodeId,
  activeBreakpoint: BreakpointName,
  frozenChanges: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const node = requireNode(document, nodeId);
  const existingResponsive = isPlainObject(node.props.responsive) ? node.props.responsive : {};
  const nextResponsive: Record<string, unknown> = { ...existingResponsive };

  const existingActiveTier = isPlainObject(existingResponsive[activeBreakpoint])
    ? existingResponsive[activeBreakpoint]
    : {};
  nextResponsive[activeBreakpoint] = { ...existingActiveTier, ...frozenChanges };

  for (const tier of widerBreakpoints(activeBreakpoint)) {
    const tierExisting = isPlainObject(existingResponsive[tier]) ? existingResponsive[tier] : undefined;
    const toFreeze = Object.keys(frozenChanges).filter((key) => tierExisting?.[key] === undefined);

    if (toFreeze.length > 0) {
      const resolvedAtTier = resolveNode(node, { breakpoint: tier }).resolvedProps;
      const freeze: Record<string, unknown> = {};
      for (const key of toFreeze) freeze[key] = resolvedAtTier[key];
      nextResponsive[tier] = { ...(tierExisting ?? {}), ...freeze };
    }
  }

  return nextResponsive;
}

/**
 * Costruisce il comando `UPDATE_PROPS` per un singolo gesto di editing
 * (un trascinamento, un campo del pannello proprietà). Non esegue nulla:
 * il chiamante lo passa a `History.execute()`.
 *
 * - Chiavi di GEOMETRIA e di STILE (Fase S1): stesso trattamento - se la
 *   vista attiva è la fascia base (`desktop`), scrivono direttamente sui
 *   props del nodo (nessun congelamento necessario: non esiste una fascia
 *   più larga della base). Altrimenti passano da `buildFrozenResponsive`
 *   (Opzione A), insieme nella stessa chiamata (un solo `props.responsive`
 *   ricostruito, non uno per categoria).
 * - Chiavi di CONTENUTO: scrivono sempre sui props base, indipendentemente
 *   dalla vista attiva (nessuna variazione di contenuto per fascia sullo
 *   stesso nodo - decisione del proprietario del prodotto).
 * - Qualunque altra chiave: errore esplicito, non un default silenzioso.
 */
export function buildUpdatePropsCommand(
  document: Document,
  nodeId: NodeId,
  activeBreakpoint: BreakpointName,
  changedProps: Readonly<Partial<Record<EditableKey, unknown>>>,
): UpdatePropsCommand {
  const keys = Object.keys(changedProps);
  if (keys.length === 0) {
    throw new Error("buildUpdatePropsCommand: changedProps è vuoto - nessuna modifica da scrivere.");
  }

  const frozenChanges: Record<string, unknown> = {};
  const contentChanges: Record<string, unknown> = {};

  for (const key of keys) {
    if (GEOMETRY_KEY_SET.has(key) || STYLE_KEY_SET.has(key)) {
      frozenChanges[key] = changedProps[key as EditableKey];
    } else if (CONTENT_KEY_SET.has(key)) {
      contentChanges[key] = changedProps[key as EditableKey];
    } else {
      throw new Error(
        `buildUpdatePropsCommand: proprietà "${key}" non riconosciuta. Deve essere geometria ` +
          `(${GEOMETRY_KEYS.join(", ")}), stile (${STYLE_KEYS.join(", ")}) o contenuto ` +
          `(${CONTENT_KEYS.join(", ")}) - elenchi chiusi.`,
      );
    }
  }

  const props: Record<string, unknown> = { ...contentChanges };

  if (Object.keys(frozenChanges).length > 0) {
    if (activeBreakpoint === BASE_TIER) {
      Object.assign(props, frozenChanges);
    } else {
      props.responsive = buildFrozenResponsive(document, nodeId, activeBreakpoint, frozenChanges);
    }
  }

  return { type: "UPDATE_PROPS", nodeId, props };
}
