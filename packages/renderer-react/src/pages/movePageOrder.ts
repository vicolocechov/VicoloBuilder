import type { PageId } from "@vicolobuilder/engine";

/**
 * Scambia `pageId` con il vicino nella direzione data. Non chiama
 * REORDER_PAGES: restituisce solo il nuovo array (o null se il movimento
 * non è possibile), il chiamante lo passa al comando così com'è - stesso
 * comando del Blocco A, nessuna reinterpretazione ("deve essere una
 * permutazione esatta delle pagine esistenti", REORDER_PAGES accetta
 * l'ordine intero, non uno spostamento incrementale).
 */
export function movePageOrder(
  order: readonly PageId[],
  pageId: PageId,
  direction: -1 | 1,
): readonly PageId[] | null {
  const index = order.indexOf(pageId);
  if (index === -1) return null;
  const target = index + direction;
  if (target < 0 || target >= order.length) return null;

  const next = [...order];
  const a = next[index]!;
  const b = next[target]!;
  next[index] = b;
  next[target] = a;
  return next;
}
