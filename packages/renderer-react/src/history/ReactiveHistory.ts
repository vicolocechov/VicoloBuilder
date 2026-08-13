import { History } from "@vicolobuilder/engine";
import type { BreakpointName, Command, Document, NodeId } from "@vicolobuilder/engine";

type Listener = () => void;

/**
 * Fase 5, Blocco D (Decisione D5): `History` (packages/engine) resta una
 * classe pura, senza dipendenze React - coerente con la disciplina "zero UI
 * dependencies" del package Engine. Questo wrapper vive SOLO in
 * renderer-react: incapsula una `History` e notifica un elenco di
 * subscriber dopo ogni chiamata che può cambiare stato osservabile
 * (document, selection, activeBreakpoint, canUndo/canRedo) - il ponte con
 * `useSyncExternalStore` (vedi history/useHistoryStore.ts) sta tutto qui,
 * non dentro l'Engine.
 *
 * I metodi passati come callback bare a `useSyncExternalStore` (subscribe,
 * i vari getX) sono campi arrow-function per restare legati a `this` anche
 * quando React li invoca come riferimenti a funzione, non come chiamate
 * `store.metodo()`.
 */
export class ReactiveHistory {
  #history: History;
  #listeners = new Set<Listener>();

  constructor(initialDocument: Document) {
    this.#history = new History(initialDocument);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getDocument = (): Document => this.#history.document;
  getSelection = (): NodeId | null => this.#history.selection;
  getActiveBreakpoint = (): BreakpointName => this.#history.activeBreakpoint;
  getCanUndo = (): boolean => this.#history.canUndo;
  getCanRedo = (): boolean => this.#history.canRedo;

  execute(command: Command): void {
    this.#history.execute(command);
    this.#notify();
  }

  undo(): void {
    this.#history.undo();
    this.#notify();
  }

  redo(): void {
    this.#history.redo();
    this.#notify();
  }

  select(nodeId: NodeId): void {
    this.#history.select(nodeId);
    this.#notify();
  }

  deselect(): void {
    this.#history.deselect();
    this.#notify();
  }

  setActiveBreakpoint(breakpoint: BreakpointName): void {
    this.#history.setActiveBreakpoint(breakpoint);
    this.#notify();
  }
}
