import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import "@/index.css";

// Register the WebLLM weight-bridge Service Worker as early as possible
// so it is active before any model activation runs. The SW intercepts
// HuggingFace fetches and tees responses to the workspace FilesApi so
// weight files appear on disk under `<workspace>/.settings/models/...`.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/webllm-weight-bridge.sw.js", { type: "module" })
    .catch((error) => {
      console.warn("[chat-mini] SW registration failed:", error);
    });
}

const container = document.getElementById("app");
if (!container) {
  throw new Error("Root element #app not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
