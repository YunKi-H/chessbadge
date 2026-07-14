import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";

const BroadcastOverlay = lazy(() =>
  import("./BroadcastOverlay").then((module) => ({
    default: module.BroadcastOverlay
  }))
);

export function BroadcastOverlayRoute() {
  const { publicToken } = useParams();

  if (!publicToken || !/^[A-Za-z0-9_-]{43}$/.test(publicToken)) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <BroadcastOverlay publicToken={publicToken} />
    </Suspense>
  );
}
