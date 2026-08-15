import type { Document } from "@vicolobuilder/engine";

/**
 * Fase 16 (Font custom, Punto 2 - decisione esplicita: Opzione A). Forma
 * dei dati di un font registrato - vive SOLO qui in renderer-react,
 * l'Engine tratta `document.props.fonts` come un valore opaco qualunque
 * (`Document.props`, stesso principio già rispettato per `Page.props`/
 * `DocumentNode.props`). Nessun nuovo campo tipizzato su `Document`: la
 * struttura è annidata dentro il bag esistente, stesso precedente di
 * `props.responsive` (struttura annidata dentro un bag opaco).
 *
 * `weight` obbligatorio (Punto 4 - il sito reale usa pesi diversi della
 * STESSA famiglia, es. Poppins 500/600, selezionati proprio tramite
 * `font-weight` sull'elemento che la usa - senza un peso esplicito la
 * seconda variante registrata resterebbe di fatto non selezionabile in
 * modo affidabile).
 */
export interface FontRegistration {
  readonly family: string;
  readonly weight: string;
  readonly src: string;
}

function isFontRegistration(value: unknown): value is FontRegistration {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).family === "string" &&
    typeof (value as Record<string, unknown>).weight === "string" &&
    typeof (value as Record<string, unknown>).src === "string"
  );
}

/**
 * Legge `document.props.fonts`, filtrando via ogni valore che non ha
 * esattamente la forma attesa - `props` è un bag libero non validato a
 * livello di tipo (stesso trattamento già dato a `text`/`color`/`fontSize`
 * ovunque nel Renderer: un `typeof === "string"` prima dell'uso, mai
 * un'eccezione per un valore inatteso).
 */
export function readRegisteredFonts(document: Document): readonly FontRegistration[] {
  const fonts = document.props.fonts;
  return Array.isArray(fonts) ? fonts.filter(isFontRegistration) : [];
}
