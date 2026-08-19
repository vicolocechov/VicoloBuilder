import { getPage, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, Document, NodeId, PageId } from "@vicolobuilder/engine";
import { asFiniteNumber } from "../asFiniteNumber.js";

/**
 * Fase 7, Punto 1 (Opzione B - DECISIONS.md): una "scena" è un figlio
 * diretto della radice della pagina il cui `type` (campo già libero di
 * `DocumentNode`, invariato da Fase 1) vale "scene" - nessuno schema
 * dedicato nel Document Model, solo una convenzione riconosciuta qui.
 *
 * Ordine: quello di `childrenIds` del nodo radice (ordine di inserimento -
 * non esiste un comando di riordino dei nodi figli, solo REORDER_PAGES per
 * l'ordine delle pagine).
 */
export function sceneNodeIds(document: Document, pageId: PageId): readonly NodeId[] {
  const page = getPage(document, pageId);
  if (!page) return [];
  const root = document.nodes.get(page.rootNodeId);
  if (!root) return [];
  return root.childrenIds.filter((childId) => document.nodes.get(childId)?.type === "scene");
}

/**
 * Fallback difensivo per un figlio SENZA `height` valido in `resolvedProps`
 * - raggiunto raramente in pratica (ogni tipo di elemento foglia ha sempre
 * un `height` esplicito nei propri default, `createElementCommand.ts`), ma
 * possibile per un contenitore/griglia in modalità "libero" SENZA `height`
 * esplicito: la sua altezza reale è calcolata dall'Engine dal riquadro dei
 * figli, mai scritta indietro nei props, quindi `resolvedProps.height`
 * resta `undefined` per quel nodo. Limite noto e accettato di questa
 * funzione (non esegue `computeLayout`, legge solo i props già risolti) -
 * un valore "ragionevole ma approssimato" invece di richiedere l'intero
 * albero di layout qui solo per questo calcolo.
 */
const FALLBACK_CHILD_HEIGHT = 400;

/**
 * Bug segnalato (primo giro): la versione originale sommava SOLO le
 * altezze delle altre SCENE esistenti, ignorando qualunque elemento
 * non-scena che le precedesse - corretto sommando le altezze di TUTTI i
 * figli diretti della radice (Opzione B, D-068).
 *
 * Bug segnalato (secondo giro, diagnosi + fix): `sum(height)` presuppone
 * implicitamente che i figli precedenti siano impilati in sequenza SENZA
 * sovrapposizioni né spazi vuoti - vero per le scene (impilate per
 * costruzione da questa stessa funzione), FALSO per elementi in modalità
 * "libero" (posizione Y propria e indipendente, possono sovrapporsi o
 * essere sparsi ovunque). Riprodotto: un testo (y:50,h:60) e un'immagine
 * (y:500,h:120, deliberatamente lontana) come unici figli - `sum` produceva
 * Y:180 per la scena successiva, sovrapposta interamente all'immagine (che
 * arriva fino a Y:620) - una sovrapposizione reale confermata sia
 * numericamente sia visivamente in browser.
 *
 * Corretto (decisione esplicita del proprietario del prodotto, verificata
 * empiricamente su tre scenari prima di implementare - vedi DECISIONS.md):
 * la Y della prossima scena è il MASSIMO tra i bordi inferiori (`y +
 * height`, RISOLTI alla fascia attiva) di TUTTI i figli diretti della
 * radice pagina, nell'ordine di `childrenIds` - stessa formula UNICA per
 * scena e non-scena, nessuna logica differenziata per tipo: `max` è la
 * generalizzazione corretta di `sum`, che ne è il caso degenere quando gli
 * elementi sono già impilati senza sovrapposizioni/vuoti (esattamente il
 * caso "scena dopo scena" - stesso risultato di prima, nessuna
 * regressione). Corregge anche un limite già noto (D-064/D-068): una
 * scena riposizionata manualmente dopo la creazione ora viene tracciata
 * correttamente (si legge la sua Y REALE, non solo la somma delle
 * altezze) - prima quel riposizionamento veniva ignorato dal calcolo.
 *
 * Per un figlio diretto della radice, `resolvedProps.y` coincide
 * esattamente con la Y assoluta (l'ancora della radice è sempre (0,0)) -
 * nessuna conversione necessaria. `sceneNodeIds` resta invariata e in uso
 * altrove (motore di navigazione) - non più da questa funzione.
 */
export function nextSceneOrigin(
  document: Document,
  pageId: PageId,
  activeBreakpoint: BreakpointName,
): { readonly x: number; readonly y: number } {
  const page = getPage(document, pageId);
  if (!page) return { x: 0, y: 0 };
  const root = document.nodes.get(page.rootNodeId);
  if (!root) return { x: 0, y: 0 };

  let y = 0;
  for (const nodeId of root.childrenIds) {
    const node = document.nodes.get(nodeId);
    if (!node) continue;
    const resolved = resolveNode(node, { breakpoint: activeBreakpoint }).resolvedProps;
    const childY = asFiniteNumber(resolved.y) ?? 0;
    const childHeight = asFiniteNumber(resolved.height) ?? FALLBACK_CHILD_HEIGHT;
    y = Math.max(y, childY + childHeight);
  }
  return { x: 0, y };
}
