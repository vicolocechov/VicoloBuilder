import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("main.tsx: elemento #root non trovato in index.html.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
