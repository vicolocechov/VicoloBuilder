import type { Document } from "@vicolobuilder/engine";
import { readRegisteredFonts } from "@vicolobuilder/render-conventions";
import { escapeCssText } from "./escape.js";

/**
 * Batch 6 dell'Exporter: dichiarazioni `@font-face` per ogni font
 * registrato in `document.props.fonts` (`readRegisteredFonts`,
 * `@vicolobuilder/render-conventions`, D-029/D-046) - stessa fonte dati già
 * usata da `FontManager.tsx`/`App.tsx` per registrare i font nell'editor,
 * non una copia.
 *
 * **Deviazione deliberata dal meccanismo dell'editor, non una nuova
 * decisione di prodotto**: l'editor (D-029) registra i font con la CSS
 * Font Loading API (`new FontFace(...)`, JavaScript) PROPRIO per evitare di
 * interpolare `family`/`weight`/`src` (campi di testo liberi dell'autore,
 * mai validati) dentro testo CSS grezzo - un vettore di CSS injection
 * esplicitamente identificato e evitato in D-029. L'Exporter non può usare
 * quella via: "zero JavaScript" è un vincolo già approvato dell'intero
 * output pubblicato (analisi Exporter §3.8), quindi qui l'UNICA via
 * possibile è proprio quella scartata dall'editor - un `<style>` con
 * `@font-face` costruito per interpolazione di stringa. Reso sicuro dalle
 * stesse utility di escaping già costruite per questo scopo generale
 * (`escapeCssText`, Batch 2) e già verificate in un contesto di valore CSS
 * non tra apici (Batch 5) - non una superficie nuova, la stessa disciplina
 * applicata al problema che D-029 non poteva ancora risolvere in quel modo
 * (quelle utility non esistevano ancora in Fase 16).
 *
 * `family`/`weight` come VALORI (dentro apici per `family`, che può
 * contenere spazi; `weight` è invece un identificatore CSS libero, es. "500"
 * o "400 700" per un range variabile - MAI tra apici, stesso motivo per cui
 * `font-weight` non è mai una stringa quotata in CSS). `src` come
 * `url("...")` - tra apici, stesso trattamento di `family` (un URL scelto
 * liberamente dall'autore, "campo di testo libero" per D-029, può
 * contenere qualunque carattere). Nessun hint di formato (`format(...)`) -
 * stesso identico contratto minimale già usato da `new FontFace(family,
 * \`url(${src})\`, {weight})` nell'editor, nessuna funzionalità aggiunta
 * qui non già presente lì.
 */
export function renderFontFaces(document: Document): string {
  const fonts = readRegisteredFonts(document);
  return fonts
    .map(
      (font) =>
        `@font-face{font-family:"${escapeCssText(font.family)}";font-weight:${escapeCssText(font.weight)};src:url("${escapeCssText(font.src)}");}`,
    )
    .join("");
}
