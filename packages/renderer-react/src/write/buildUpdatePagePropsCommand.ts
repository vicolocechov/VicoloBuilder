import type { PageId, UpdatePagePropsCommand } from "@vicolobuilder/engine";

/**
 * Fase 14 (SEO per pagina) — nucleo: solo `title`/`description`/`canonical`
 * (decisione esplicita del proprietario del prodotto, Punto 2 dell'analisi —
 * nessun campo `og:*` in questa fase). Elenco CHIUSO, stessa disciplina di
 * `GEOMETRY_KEYS`/`STYLE_KEYS`/`CONTENT_KEYS` in `buildUpdatePropsCommand.ts`:
 * nessun'altra chiave entra senza approvazione esplicita.
 *
 * A differenza di `buildUpdatePropsCommand`, NESSUN congelamento/cascata per
 * fascia (Punto 3 dell'analisi, approvato): `Page.props` non passa mai dal
 * Resolver, quindi questo builder non prende né `document` né
 * `activeBreakpoint` — scrive sempre e solo sui props base della pagina.
 *
 * B4 (SEO og:* e lang, Opzione B approvata) — `ogTitle`/`ogDescription`
 * entrano qui, non in `Document.props`: l'Open Graph li definisce per-URL
 * (ogni pagina condivisa sui social ha bisogno del proprio testo), stesso
 * livello di `title`/`description`. `og:url` NON è un campo - deriva
 * SEMPRE da `canonical` (già presente) nel punto in cui un futuro Exporter
 * lo genererà: nessun campo `ogUrl` è mai stato aggiunto a `PAGE_SEO_KEYS`,
 * verificato esplicitamente da un test dedicato
 * (`test/write/buildUpdatePagePropsCommand.test.ts`) - non lasciato
 * all'assenza silenziosa. Motivazione: un `og:url` scritto a mano
 * duplicherebbe un dato già presente (`canonical`) senza alcun controllo
 * che li tenga sincronizzati - primo caso nel prodotto di due campi che
 * dovrebbero sempre coincidere, evitato scrivendone uno solo.
 */
export const PAGE_SEO_KEYS = ["title", "description", "canonical", "ogTitle", "ogDescription"] as const;
export type PageSeoKey = (typeof PAGE_SEO_KEYS)[number];

const PAGE_SEO_KEY_SET: ReadonlySet<string> = new Set(PAGE_SEO_KEYS);

export function buildUpdatePagePropsCommand(
  pageId: PageId,
  changedProps: Readonly<Partial<Record<PageSeoKey, unknown>>>,
): UpdatePagePropsCommand {
  const keys = Object.keys(changedProps);
  if (keys.length === 0) {
    throw new Error("buildUpdatePagePropsCommand: changedProps è vuoto - nessuna modifica da scrivere.");
  }

  for (const key of keys) {
    if (!PAGE_SEO_KEY_SET.has(key)) {
      throw new Error(
        `buildUpdatePagePropsCommand: proprietà "${key}" non riconosciuta. Deve essere una fra ` +
          `${PAGE_SEO_KEYS.join(", ")} - elenco chiuso.`,
      );
    }
  }

  return { type: "UPDATE_PAGE_PROPS", pageId, props: { ...changedProps } };
}
