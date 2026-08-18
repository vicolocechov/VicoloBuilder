import type { FrozenFieldState } from "./frozenFieldState.js";

/**
 * Blocco 6 (rifinitura UI/UX, Punto 4 dell'audit): ogni etichetta di campo
 * nel PropertyPanel era finora il nome camelCase grezzo della proprietà
 * (x, y, borderWidth, layoutMode...) - gergo CSS/JS senza alcuna
 * spiegazione, verificato incomprensibile per chi non lo conosce già.
 * Mappatura di SOLA presentazione (stesso principio di `outlineLabel` in
 * Outline.tsx): non rinomina le chiavi vere lette/scritte da
 * `buildUpdatePropsCommand`/`frozenFieldState` (che restano `GeometryKey`/
 * `StyleKey`/`ContentKey`, usate anche nei test) - solo l'etichetta
 * mostrata qui.
 */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  ancora: "Ancora",
  anchorId: "Ancora",
  x: "Posizione orizzontale (X)",
  y: "Posizione verticale (Y)",
  width: "Larghezza",
  height: "Altezza",
  layoutMode: "Disposizione dei figli",
  columns: "Colonne",
  gap: "Spaziatura tra celle",
  fontSize: "Dimensione testo",
  fontFamily: "Famiglia carattere",
  fontWeight: "Peso testo",
  textAlign: "Allineamento testo",
  src: "Immagine (URL)",
  alt: "Testo alternativo",
  objectFit: "Adattamento immagine",
  href: "Collegamento (URL)",
  transition: "Transizione",
  "hover: color": "Al passaggio del mouse: colore testo",
  "hover: background": "Al passaggio del mouse: sfondo",
  "hover: transform": "Al passaggio del mouse: trasformazione",
  "hover: borderColor": "Al passaggio del mouse: colore bordo",
  borderWidth: "Spessore bordo",
  borderColor: "Colore bordo",
  borderStyle: "Stile bordo",
  borderRadius: "Raggio angoli",
  opacity: "Opacità",
  padding: "Margine interno",
  text: "Testo",
  color: "Colore",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * Descrizione breve, SOLO per i campi dove il nome tradotto da solo non
 * basta a capire l'effetto (audit, Punto 4) - non su ogni campo: un
 * nome come "Larghezza" non ha bisogno di ulteriore spiegazione, "Ancora"
 * o "Disposizione dei figli" sì.
 */
export const FIELD_DESCRIPTIONS: Readonly<Record<string, string>> = {
  anchorId: 'Un nome per creare collegamenti interni verso questo elemento (es. un link "Vai a...").',
  x: "Posizione orizzontale rispetto al contenitore che lo racchiude.",
  y: "Posizione verticale rispetto al contenitore che lo racchiude.",
  layoutMode:
    '"Libero": ogni figlio ha posizione e dimensioni proprie, spostabili liberamente. "Pila": i figli si impilano automaticamente uno sotto l\'altro, a tutta larghezza. "Griglia": i figli si dispongono in colonne, come "Pila" ma su più colonne.',
};

/**
 * Blocco 6, Punto 4: le uniche due parole inglesi non tradotte rimaste
 * nell'interfaccia (`frozenFieldState.ts`, valori interni STABILI - usati
 * anche nei test, non rinominati). Tradotte solo qui, al momento di
 * mostrarle come badge - stesso principio delle altre mappature di questo
 * file.
 */
const FROZEN_STATE_LABELS: Readonly<Record<FrozenFieldState, string>> = {
  inherited: "ereditato da una vista più larga",
  "overridden-here": "impostato per questa vista",
};

export function frozenStateLabel(state: FrozenFieldState): string {
  return FROZEN_STATE_LABELS[state];
}
