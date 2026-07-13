import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const overlayMatch = /^\/overlay\/([A-Za-z0-9_-]{43})$/.exec(
  window.location.pathname
);

if (overlayMatch?.[1]) {
  void import("./ui/BroadcastOverlay").then(({ BroadcastOverlay }) => {
    root.render(
      <StrictMode>
        <BroadcastOverlay publicToken={overlayMatch[1]!} />
      </StrictMode>
    );
  });
} else {
  void import("./ui/App").then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
