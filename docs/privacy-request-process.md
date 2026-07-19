# Privacy Request Process

This runbook defines how EloBadge handles requests to access, correct, delete,
or restrict the processing of personal data. It is an internal operating
procedure, not the public privacy policy.

## 1. Request channel

- Receive privacy requests at `support@elobadge.com`.
- Ask the requester to include the request category and their Chzzk channel
  URL or channel ID.
- Do not request a Chzzk password, OAuth access or refresh token, Firebase ID
  token, Chess.com password, government ID, or Firebase service-account key.
- Record only the minimum correspondence needed to complete and audit the
  request. Do not copy production records into issue trackers or chat tools.

## 2. Identity verification

A nickname, email address, screenshot, or public channel ID alone does not
prove account ownership.

1. Prefer an authenticated self-service action whenever the requester can sign
   in with the linked Chzzk account.
2. Do not send raw account records or change account data in response to an
   unverified email request.
3. If the requester cannot sign in, first help them restore Chzzk login access.
4. Escalate exceptional cases to the operator. Record the verification method
   and result, but never retain credentials or bearer tokens as evidence.

The current product does not provide a support-agent identity-verification
code or authenticated data-export endpoint. Until one exists, support may
explain data categories and retention behavior but must not disclose raw
account records by email.

## 3. Request handling

### Access

- Explain the data categories using `docs/privacy-data-inventory.md`.
- Do not export Firestore documents or operational logs by email until an
  authenticated export flow is implemented.
- If a request requires a manual search, search by the verified Firebase UID or
  Chzzk channel ID and avoid unrelated users' records.

### Correction

- Chzzk display names are refreshed by signing in again with Chzzk.
- Chess.com profile and rating data is corrected by refreshing or disconnecting
  and reconnecting the Chess.com account after correcting the source profile.
- Overlay appearance is corrected directly in streamer settings.
- EloBadge must not overwrite source-owned Chzzk or Chess.com profile data with
  a value supplied only by email.

### Deletion

- Direct signed-in users to **EloBadge account deletion** in account settings.
- The authenticated `DELETE /api/account` flow is the authoritative deletion
  mechanism. It removes Firebase Authentication and Firestore account records,
  stops the chat session, invalidates overlay access, and attempts to revoke
  the stored Chzzk token.
- Operational logs are not rewritten selectively. Identifiers already present
  in the host journal expire under the 14-day retention policy.
- Record only completion status and date in support correspondence. Do not copy
  deleted records into the support reply.

### Restriction or suspension

- A viewer can stop Chess.com processing by disconnecting the Chess.com account.
- A streamer can stop chat collection by disconnecting the Chzzk connection.
- Full account deletion remains available when the user wants all active
  account processing to stop.
- A request for a narrower restriction that the product cannot enforce must be
  escalated rather than represented as completed.

## 4. Completion checklist

- Confirm the request category and scope.
- Verify ownership using the strongest available authenticated route.
- Perform only the requested action.
- Check that related caches and active overlay or chat connections were
  invalidated where applicable.
- Reply with what was completed, what remains under fixed retention, and any
  action the requester still needs to take.
- Keep the response factual and avoid including secrets or unnecessary account
  data.

## 5. Remaining implementation gap

Build an authenticated self-service JSON export before promising downloadable
copies of account data in the public privacy policy. The export must omit raw
OAuth tokens, encryption material, Firebase ID tokens, and other users' data.
