import { describe, expect, it, vi } from "vitest";
import { createDocument } from "@vicolobuilder/engine";
import { ReactiveHistory } from "../../src/history/ReactiveHistory.js";

function newStore() {
  return new ReactiveHistory(createDocument({ rootPageId: "page-home", rootNodeId: "root" }));
}

describe("ReactiveHistory", () => {
  it("espone document/selection/activeBreakpoint/canUndo/canRedo iniziali", () => {
    const store = newStore();
    expect(store.getSelection()).toBeNull();
    expect(store.getActiveBreakpoint()).toBe("desktop");
    expect(store.getCanUndo()).toBe(false);
    expect(store.getCanRedo()).toBe(false);
  });

  it("execute() applica il comando e notifica i subscriber", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });

    expect(store.getDocument().nodes.has("a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("select()/deselect() notificano e aggiornano getSelection()", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.select("root");
    expect(store.getSelection()).toBe("root");
    expect(listener).toHaveBeenCalledTimes(1);

    store.deselect();
    expect(store.getSelection()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("setActiveBreakpoint() notifica e aggiorna getActiveBreakpoint()", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setActiveBreakpoint("mobile");
    expect(store.getActiveBreakpoint()).toBe("mobile");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("undo()/redo() notificano e restituiscono lo stesso riferimento di Document quando non c'è nulla da fare", () => {
    const store = newStore();
    const before = store.getDocument();
    const listener = vi.fn();
    store.subscribe(listener);

    store.undo(); // niente da annullare
    expect(store.getDocument()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1); // notifica comunque (nessuna logica di "notifica solo se cambia" qui)
  });

  it("un unsubscribe interrompe le notifiche a quel listener", () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.select("root");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.select("altro");
    expect(listener).toHaveBeenCalledTimes(1); // non richiamato di nuovo
  });
});
