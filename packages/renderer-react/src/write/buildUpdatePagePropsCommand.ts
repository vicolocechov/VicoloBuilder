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
 */
export const PAGE_SEO_KEYS = ["title", "description", "canonical"] as const;
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
