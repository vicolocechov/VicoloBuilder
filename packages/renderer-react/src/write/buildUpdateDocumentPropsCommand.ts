import type { Document, UpdateDocumentPropsCommand } from "@vicolobuilder/engine";
import { readRegisteredFonts, type FontRegistration } from "@vicolobuilder/render-conventions";

/**
 * Fase 16 (Font custom, Punto 1 - decisione esplicita: Opzione B). Mirror
 * di `write/buildUpdatePagePropsCommand.ts` un livello più in alto
 * (`document.props`, non `document.pages`) - stessa assenza di
 * congelamento/cascata (nessun `activeBreakpoint`, `Document.props` non
 * passa mai dal Resolver).
 *
 * A differenza di `buildUpdatePagePropsCommand` (chiavi scalari
 * indipendenti: `title`/`description`/`canonical`), qui l'unica chiave del
 * nucleo (`fonts`, Punto 2) è un ARRAY - "registrare"/"rimuovere" un font
 * significa leggere l'array esistente e scriverne uno nuovo per intero
 * (`UPDATE_DOCUMENT_PROPS` fa uno shallow merge, non un merge di array) -
 * per questo, a differenza del write helper di Fase 14, questo prende
 * `document` in input (per leggere lo stato corrente prima di scrivere il
 * nuovo array), stesso bisogno già visto in `buildFrozenResponsive`.
 */

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`registrazione font: campo "${field}" non può essere vuoto.`);
  }
}

export function buildRegisterFontCommand(document: Document, font: FontRegistration): UpdateDocumentPropsCommand {
  assertNonEmpty(font.family, "family");
  assertNonEmpty(font.weight, "weight");
  assertNonEmpty(font.src, "src");

  const nextFonts: FontRegistration[] = [...readRegisteredFonts(document), font];
  return { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: nextFonts } };
}

export function buildUnregisterFontCommand(document: Document, family: string, weight: string): UpdateDocumentPropsCommand {
  const nextFonts = readRegisteredFonts(document).filter((f) => !(f.family === family && f.weight === weight));
  return { type: "UPDATE_DOCUMENT_PROPS", props: { fonts: nextFonts } };
}

/**
 * B4 (SEO og:* e lang, analisi pre-Exporter) — a differenza di `fonts`
 * (semantica ad ARRAY, "leggi tutto-scrivi tutto", vedi sopra), `lang`/
 * `ogSiteName`/`ogType`/`ogLocale` sono scalari indipendenti - stesso
 * pattern di `write/buildUpdatePagePropsCommand.ts` (elenco chiuso,
 * shallow merge diretto, nessun bisogno di leggere `document` prima di
 * scrivere). Collocati in `Document.props`, non `Page.props` (Opzione
 * scelta esplicitamente): un solo sito, un solo nome/lingua/tipo/locale,
 * mai per pagina - a differenza di `ogTitle`/`ogDescription`
 * (`buildUpdatePagePropsCommand.ts`), che l'Open Graph definisce per-URL.
 * Nessuna cascata per fascia (stesso principio di `fonts`/`Page.props`:
 * `Document.props` non passa mai dal Resolver).
 */
export const DOCUMENT_SEO_KEYS = ["lang", "ogSiteName", "ogType", "ogLocale"] as const;
export type DocumentSeoKey = (typeof DOCUMENT_SEO_KEYS)[number];

const DOCUMENT_SEO_KEY_SET: ReadonlySet<string> = new Set(DOCUMENT_SEO_KEYS);

export function buildUpdateDocumentSeoCommand(
  changedProps: Readonly<Partial<Record<DocumentSeoKey, unknown>>>,
): UpdateDocumentPropsCommand {
  const keys = Object.keys(changedProps);
  if (keys.length === 0) {
    throw new Error("buildUpdateDocumentSeoCommand: changedProps è vuoto - nessuna modifica da scrivere.");
  }

  for (const key of keys) {
    if (!DOCUMENT_SEO_KEY_SET.has(key)) {
      throw new Error(
        `buildUpdateDocumentSeoCommand: proprietà "${key}" non riconosciuta. Deve essere una fra ` +
          `${DOCUMENT_SEO_KEYS.join(", ")} - elenco chiuso.`,
      );
    }
  }

  return { type: "UPDATE_DOCUMENT_PROPS", props: { ...changedProps } };
}
