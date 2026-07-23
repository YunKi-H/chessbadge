import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const overlayToken = readOverlayToken(window.location.pathname);

if (overlayToken) {
  void import("./ui/BroadcastOverlay").then(({ BroadcastOverlay }) => {
    root.render(<BroadcastOverlay publicToken={overlayToken} />);
  });
} else if (!window.location.pathname.startsWith("/overlay/")) {
  void Promise.all([
    import("react-router-dom"),
    import("./router")
  ]).then(([{ RouterProvider }, { router }]) => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    );
  });
}

function readOverlayToken(pathname: string): string | null {
  return /^\/overlay\/([A-Za-z0-9_-]{43})\/?$/.exec(pathname)?.[1] ?? null;
}
