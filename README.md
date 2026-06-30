# ChessBadge

ChessBadge is a Chzzk-first chess rating chat overlay for streamers.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Fastify, TypeScript
- Database/Auth: Supabase Postgres, Supabase Auth
- ORM: Prisma
- Realtime: SSE first, WebSocket later if needed
- Deploy target: ECS Fargate

## Repository Layout

```text
apps/
  server/   Fastify API, Chzzk ingestion, SSE gateway, jobs
  web/      React/Vite dashboard and OBS overlay UI
packages/
  core/     Shared domain types and rating rules
prisma/     Database schema and migrations
```

## First Milestone

The first product risk to remove is Chzzk chat ingestion:

1. Complete Chzzk OAuth.
2. Create a Chzzk chat session.
3. Subscribe to chat events.
4. Print `senderChannelId`, `nickname`, `content`, and `messageTime`.
5. Forward those events to `/events/test` via SSE.

