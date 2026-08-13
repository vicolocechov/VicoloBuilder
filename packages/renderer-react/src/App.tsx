import { useMemo } from "react";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { ReactiveHistory } from "./history/ReactiveHistory.js";
import { useActiveBreakpoint, useCanRedo, useCanUndo } from "./history/useHistoryStore.js";
import { Canvas } from "./canvas/Canvas.js";
import { PropertyPanel } from "./panel/PropertyPanel.js";
import { TIER_ORDER } from "./breakpoints.js";

/** Documento dimostrativo: una radice in modalità "libero" con due card, per avere subito qualcosa da selezionare/trascinare/ridimensionare. */
function buildDemoDocument(): Document {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card-1",
    nodeType: "box",
    parentId: "root",
    props: { x: 40, y: 40, width: 160, height: 80, color: "#dbeafe", text: "Card 1" },
  });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "card-2",
    nodeType: "box",
    parentId: "root",
    props: { x: 240, y: 120, width: 160, height: 80, color: "#fde68a", text: "Card 2" },
  });
  return doc;
}

export function App(): JSX.Element {
  const store = useMemo(() => new ReactiveHistory(buildDemoDocument()), []);
  const activeBreakpoint = useActiveBreakpoint(store);
  const canUndo = useCanUndo(store);
  const canRedo = useCanRedo(store);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#f3f4f6" }}>
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {TIER_ORDER.map((tier) => (
            <button
              key={tier}
              onClick={() => store.setActiveBreakpoint(tier)}
              style={{ fontWeight: tier === activeBreakpoint ? "bold" : "normal" }}
            >
              {tier}
            </button>
          ))}
          <button onClick={() => store.undo()} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={() => store.redo()} disabled={!canRedo}>
            Redo
          </button>
        </div>
        <Canvas store={store} />
      </div>
      <div style={{ width: 260, borderLeft: "1px solid #e5e7eb", overflow: "auto" }}>
        <PropertyPanel store={store} />
      </div>
    </div>
  );
}
