import { applyCommand, type Command } from "./commands.js";
import type { Document } from "../document/types.js";

/**
 * Owns the single, canonical Document instance for a session plus its
 * undo/redo stacks. This is the "Workspace"-level state the RFC-000 §1
 * (No Hidden State) principle refers to: consumers (CLI, renderer-react,
 * ...) read/drive a History instance instead of keeping their own copies
 * of the Document.
 */
export class History {
  #past: Document[] = [];
  #present: Document;
  #future: Document[] = [];

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
}
