# Repository Structure

This repository is intentionally structured as a monorepo while keeping the first deployable unit as a single ECS service.

```text
apps/
  server/
    src/
      routes/       HTTP endpoints, SSE endpoints
      auth/         Chzzk and Lichess auth flows
      chzzk/        Session creation, event subscription, reconnect logic
      firebase/     Firebase Admin, token verification, Firestore access
      overlay/      Overlay token, theme, display policy
      realtime/     SSE fan-out, later WebSocket/pub-sub
      ratings/      Provider adapters and rating refresh jobs
      repositories/ Firestore reads, writes, and transactions
  web/
    src/
      firebase/     Firebase Web SDK and browser auth
      ui/           Dashboard and overlay React components
packages/
  core/
    src/            Shared domain types and pure rating rules
firestore.rules     Deny-by-default client access rules
firebase.json       Firebase CLI configuration
```

## Initial Deployment Shape

```text
ECS service: elobadge-app
  - Fastify API
  - React/Vite static assets
  - SSE overlay event stream
  - Chzzk ingestion manager
  - rating refresh jobs
```

This should stay as one deployable service for the MVP. When multiple ECS tasks become necessary, split Chzzk ingestion and rating refresh into separate services and add Redis for locks/pub-sub.

Firestore is accessed only by the Fastify server. The React app uses Firebase
Authentication but sends application data requests to Fastify instead of querying
Firestore directly.

## First Implementation Slice

1. Implement Chzzk OAuth routes in `apps/server/src/auth`.
2. Implement Chzzk session client in `apps/server/src/chzzk`.
3. Forward received chat messages into `apps/server/src/realtime`.
4. Render those messages in `apps/web/src/ui/OverlayPreview.tsx`.
