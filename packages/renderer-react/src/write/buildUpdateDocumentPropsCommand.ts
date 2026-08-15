import type { Document, UpdateDocumentPropsCommand } from "@vicolobuilder/engine";
import { readRegisteredFonts, type FontRegistration } from "../fonts/fontRegistration.js";

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
