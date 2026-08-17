export type NodeId = string;
export type PageId = string;

/**
 * Current schema version for the Document format. Bump on breaking layout changes.
 *
 * Fase 6 (D-019): bump 1 -> 2. L'insieme dei nomi di fascia validi è
 * cambiato (7 fasce nominate sostituiscono le 3 lineari, DECISIONS.md
 * D-019) - un Document serializzato con schemaVersion 1 che avesse
 * `props.responsive.mobile`/`.tablet`/`.desktop` non verrebbe corrotto
 * silenziosamente (quelle chiavi diventerebbero semplicemente inerti, mai
 * lette dal nuovo `cascadingBreakpoints`), ma è un cambiamento di
 * comportamento abbastanza significativo da meritare un rifiuto esplicito
 * in deserializzazione (DocumentParseError) piuttosto che un degrado
 * silenzioso - nessun dato reale esistente da migrare in questo repository
 * (solo fixture di test e il documento demo di renderer-react, aggiornati
 * insieme a questo bump).
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface DocumentNode {
  readonly id: NodeId;
  readonly type: string;
  readonly parentId: NodeId | null;
  readonly childrenIds: readonly NodeId[];
  readonly props: Readonly<Record<string, unknown>>;
}

export interface Page {
  readonly id: PageId;
  readonly name: string;
  readonly rootNodeId: NodeId;
  /**
   * Fase 14 (SEO per pagina) — bag libero, mirror di `DocumentNode.props`:
   * stesso meccanismo di estensione incrementale già usato 10 volte per i
   * nodi (mai un cambio di tipo), qui applicato per la prima volta a `Page`.
   * A differenza di `DocumentNode.props`, NON passa mai dal Resolver -
   * nessuna cascata per fascia (un titolo SEO non varia guardando la stessa
   * pagina a una larghezza diversa) - solo la rappresentazione (bag libero)
   * è condivisa con i nodi, non il comportamento di risoluzione. Nucleo
   * (Fase 14): solo la convenzione `title`/`description`/`canonical`
   * (`write/buildUpdatePagePropsCommand.ts`, renderer-react) - nessun
   * campo `og:*`, né per-pagina né per-documento, non richiesto dai dati
   * reali per questo nucleo.
   */
  readonly props: Readonly<Record<string, unknown>>;
}

/**
 * Decisione di immutabilità (RFC-000 §1/§3), registrata esplicitamente per
 * non doverla ridiscutere da zero: nessun `Object.freeze` a runtime per ora.
 * `readonly`/`ReadonlyMap` qui sono garanzie solo compile-time. Valutate 4
 * opzioni (nessuna / freeze solo dev / freeze completo / freeze solo test
 * harness): scelta "nessuna" perché nessun consumer esterno esiste ancora
 * (CLI = Fase 3, renderer-react = Fase 5) che possa violare l'invariante, e
 * un freeze completo naive misura +40% di costo per comando a 10.000 nodi
 * per proteggere un rischio oggi inesistente nel codice. Da rivalutare
 * esplicitamente all'inizio della Fase 3.
 */
export interface Document {
  readonly schemaVersion: number;
  readonly rootPageId: PageId;
  readonly nodes: ReadonlyMap<NodeId, DocumentNode>;
  readonly pages: ReadonlyMap<PageId, Page>;
  /**
   * Ordine esplicito delle pagine (Fase 5, Blocco A). Necessario perché
   * l'ordine di inserimento in `pages` non sopravvive alla serializzazione
   * (serializeDocument ordina alfabeticamente per id, di proposito, per il
   * determinismo dell'hash - vedi document/hash.ts) - stesso problema già
   * risolto per i figli di un nodo con `childrenIds`, stessa soluzione.
   * Sempre presente sugli oggetti Document in memoria; opzionale solo nel
   * formato JSON esterno (deserializeDocument calcola un fallback se assente).
   */
  readonly pageOrder: readonly PageId[];
  /**
   * Fase 16 (Font custom, Punto 1 - decisione esplicita del proprietario
   * del prodotto: Opzione B) - bag libero, mirror di `Page.props`
   * (Fase 14) un livello più in alto: stessa rappresentazione (nessuna
   * cascata per fascia, non passa dal Resolver), stessa scelta di NON
   * riusare `Page.props` per la registrazione dei font - un font
   * registrato è condiviso da tutto il documento, non da una singola
   * pagina (fatto verificato sul sito di riferimento: 5 font dichiarati
   * una sola volta, usati - o non usati, come "Oswald" - da elementi di
   * tutto il documento, mai ri-dichiarati per pagina).
   *
   * Nucleo (Fase 16, Punto 2 - decisione esplicita: Opzione A): un'unica
   * chiave, `fonts`, un array di `{family, weight, src}` annidato dentro
   * questo bag - nessun nuovo campo tipizzato su `Document` (la forma
   * `FontRegistration` vive in `@vicolobuilder/render-conventions` (Batch 6)
   * - l'Engine tratta `props` come opaco, esattamente come per
   * `DocumentNode.props`/`Page.props`).
   */
  readonly props: Readonly<Record<string, unknown>>;
}
