# Repository Structure

This repository is intentionally structured as a monorepo while keeping the first deployable unit as a single ECS service.

```text
apps/
  server/
    src/
      routes/       HTTP endpoints, SSE endpoints
      auth/         Chzzk, Lichess, Supabase auth flows
      chzzk/        Session creation, event subscription, reconnect logic
      overlay/      Overlay token, theme, display policy
      realtime/     SSE fan-out, later WebSocket/pub-sub
      ratings/      Provider adapters and rating refresh jobs
      db/           Prisma client and repositories
  web/
    src/
      ui/           Dashboard and overlay React components
packages/
  core/
    src/            Shared domain types and pure rating rules
prisma/
  schema.prisma     Postgres schema
```

## Initial Deployment Shape

```text
ECS service: chessbadge-app
  - Fastify API
  - React/Vite static assets
  - SSE overlay event stream
  - Chzzk ingestion manager
  - rating refresh jobs
```

This should stay as one deployable service for the MVP. When multiple ECS tasks become necessary, split Chzzk ingestion and rating refresh into separate services and add Redis for locks/pub-sub.

## First Implementation Slice

1. Implement Chzzk OAuth routes in `apps/server/src/auth`.
2. Implement Chzzk session client in `apps/server/src/chzzk`.
3. Forward received chat messages into `apps/server/src/realtime`.
4. Render those messages in `apps/web/src/ui/OverlayPreview.tsx`.

