import { createBrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
import { BroadcastOverlayRoute } from "./ui/BroadcastOverlayRoute";
import { NotFoundPage } from "./ui/NotFoundPage";
import { RouteLoading } from "./ui/RouteLoading";

export const router = createBrowserRouter([
  {
    path: "/overlay/:publicToken",
    Component: BroadcastOverlayRoute
  },
  {
    path: "/auth/chzzk/callback",
    HydrateFallback: RouteLoading,
    lazy: async () => {
      const module = await import("./ui/ChzzkAuthCallback");
      return { Component: module.ChzzkAuthCallback };
    }
  },
  {
    Component: App,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => {
          const module = await import("./ui/HomePage");
          return { Component: module.HomePage };
        }
      },
      {
        path: "streamer",
        lazy: async () => {
          const module = await import("./ui/StreamerPage");
          return { Component: module.StreamerPage };
        }
      },
      {
        path: "viewer",
        lazy: async () => {
          const module = await import("./ui/ViewerPage");
          return { Component: module.ViewerPage };
        }
      },
      { path: "*", Component: NotFoundPage }
    ]
  }
]);
