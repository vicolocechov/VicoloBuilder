import { applyCommand, type Command } from "./commands.js";
import type { Document, NodeId } from "../document/types.js";

/**
 * Owns the single, canonical Document instance for a session plus its
 * undo/redo stacks. This is the "Workspace"-level state the RFC-000 §1
 * (No Hidden State) principle refers to: consumers (CLI, renderer-react,
 * ...) read/drive a History instance instead of keeping their own copies
 * of the Document.
 *
 * Possiede anche la selezione (Fase 5, Blocco C - Decisione "selezione vive
 * in History", Opzione C, e Decisione 5: singola per Fase 5). `#selection`
 * è deliberatamente SEPARATA da `#past`/`#present`/`#future`: non è uno
 * snapshot di Document, non entra mai nello stack di undo/redo, e
 * `select()`/`deselect()` non chiamano mai `applyCommand`. Conseguenza
 * esplicita e voluta di questo disaccoppiamento (non decisa altrove,
 * segnalata qui): la selezione NON viene convalidata contro il Document
 * corrente e NON viene toccata da execute()/undo()/redo() - se il nodo
 * selezionato scompare (es. DELETE_NODE, o undo di una CREATE_NODE), la
 * selezione resta "pendente" (punta a un nodeId che non esiste più) finché
 * qualcosa non chiama di nuovo select()/deselect(). Un consumer (Blocco D)
 * dovrà quindi trattare `selection` come potenzialmente non risolvibile.
 */
export class History {
  #past: Document[] = [];
  #present: Document;
  #future: Document[] = [];
  #selection: NodeId | null = null;

  constructor(initialDocument: Document) {
    this.#present = initialDocument;
  }

  get document(): Document {
    return this.#present;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Applies a command via the Command Bus and records the resulting state. */
  execute(command: Command): Document {
    const next = applyCommand(this.#present, command);
    this.#past.push(this.#present);
    this.#present = next;
    this.#future = [];
    return this.#present;
  }

  undo(): Document {
    const previous = this.#past.pop();
    if (previous === undefined) return this.#present;
    this.#future.unshift(this.#present);
    this.#present = previous;
    return this.#present;
  }

  redo(): Document {
    const next = this.#future.shift();
    if (next === undefined) return this.#present;
    this.#past.push(this.#present);
    this.#present = next;
    return this.#present;
  }

  get selection(): NodeId | null {
    return this.#selection;
  }

  /** Imposta la selezione. Non passa da applyCommand, non tocca il Document, non crea una voce di undo/redo. */
  select(nodeId: NodeId): void {
    this.#selection = nodeId;
  }

  /** Azzera la selezione. Stessa garanzia di select(): nessun effetto su Document/undo/redo. */
  deselect(): void {
    this.#selection = null;
  }
}
