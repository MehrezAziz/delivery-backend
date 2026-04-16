# Delivery backend — AI support assistant: current status

---

## Delivery Company Program (PFE) — Current Status

This section is the delivery-company baseline for the PFE report (`pfe-rapport`), covering feature scope, security system, and secure sequence conception.

### A) Feature scope implemented/planned

- Dedicated `delivery_company` domain exists (company profile, addresses/departments, API keys, refunds, transactions, audit logs).
- Company portal routes exist under `/company/*` in `delivery-control`:
  - overview dashboard
  - orders (preview + create + details + return feedback)
  - wallet
  - stats
  - refunds
  - departments
  - api keys
  - setup
- Company auth supports email/password (legacy companyId + apiKey fallback still present).
- Admin and CS access gates for delivery companies exist and are role-protected.
- Return lifecycle is implemented with `RETURNED -> RETURN_DEPOSIT -> feedback`.

### B) Security system (top security target)

Reference design docs:

- `../design.md`
- `../design-security-matrix.md`
- `../design-sequence-diagrams.md`

Security model defined:

1. Zero-trust per request
   - authenticate, authorize, resolve context server-side, audit every critical action.
2. Scoped authorization
   - endpoint scope and role checks (`orders:*`, `wallet:*`, `refunds:*`, `departments:*`, etc.).
3. API key hardening
   - hash-only storage, revoke/reactivate lifecycle, expiration support.
4. Replay/race protections
   - idempotency keys for financial writes.
   - row-level wallet locking in transaction engine.
5. Financial invariants
   - enforce max negative balance and lock-safe operations.
6. Audit/compliance
   - immutable delivery-company audit logs for high-risk actions.

### C) Conception artifacts completed

- Enterprise architecture and bounded contexts documented.
- Domain class diagram documented.
- Secure sequence diagrams documented for:
  - order creation (preview + lock + invariant checks)
  - refund request (withdrawable check + hold lock)
  - urgent budget request (auto-approval policy path)

### D) Remaining implementation phases (tracking)

Phase A (Domain foundation) — **In progress**
- Department account model (main + child departments).
- Budget policy and urgent budget request models.
- Idempotency entity for critical writes.

Phase B (Secure transaction engine) — **Pending**
- Wallet lock orchestration service with invariant guardrails.
- Budget transfer and auto-approval engine.

Phase C (Portal/BFF enforcement) — **In progress**
- Department geo + coordinates constraints, setup security, refund guards implemented.
- Main-vs-child hard isolation and budget UI workflows pending.

Phase D (Admin governance) — **Pending**
- Approval queue for budget exceed / urgent requests.
- Advanced override history and reconciliation views.

Phase E (Hardening & tests) — **Pending**
- E2E and concurrency-focused financial tests.
- Security abuse testing and alert playbooks.

### E) PFE report note

For the final report, use this section plus:

- `../design.md` for architecture/conception
- `../design-security-matrix.md` for endpoint-level security policy
- `../design-sequence-diagrams.md` for transaction sequence behavior

---

## Is Phase 1 complete?

**Yes.** Phase 1 was defined as: integrated **AI orchestrator** in NestJS (not a separate microservice), **tool dispatcher** backed by Prisma with fixed selects, **persisted assistant messages** on support tickets, and a **feature flag / kill switch**. All of that is implemented and wired into the existing support flow.

**Phases 2 and 3** (quality, transparency, ops, mobile) are also implemented; see below.

---

## Phase 1 — what we built (detailed)

### Architecture

- **Monolith integration**: All AI logic lives under `src/ai-support/` and is consumed by `SupportModule` via `AiSupportModule`. No separate AI microservice; Groq is called over HTTPS from the API process only.
- **Orchestration**: `AiSupportOrchestratorService` runs after a user message is saved. It builds a short **context pack** (profile + recent orders + wallet snapshot), loads recent **support transcript**, then loops with **Groq** using OpenAI-style **tool calling** (max 6 tool rounds). Final assistant text is persisted as a support message.
- **Tools**: `AiSupportToolsService` exposes allowlisted tools only (no arbitrary SQL). Each tool maps to scoped Prisma queries with explicit `select`s, **ticket- and user-scoped** via `ticketId` + `userId`. Results are **cached per ticket** for a few minutes to limit repeated DB hits.
- **LLM client**: `GroqClientService` calls `https://api.groq.com/openai/v1/chat/completions` with `GROQ_API_KEY` and `GROQ_MODEL`.

### Data model (Prisma)

- **`SupportMessage.senderType`**: Values include `'BOT'` for AI replies (alongside existing `'USER'` and `'CUSTOMER_SERVICE'`).
- **`SupportMessage.metadata`**: JSON for UI and auditing (e.g. helpfulness prompt, citations, track CTA, escalation reason).
- **`SupportTicket.humanEscalationNotifiedAt`**: Prevents duplicate notifications when the user repeatedly asks for a human or raises sensitive topics.
- **`NotificationType.SUPPORT_HUMAN_REQUESTED`**: Used when escalation to humans is triggered from chat.
- **`AiSupportToolLog`**: One row per tool invocation (ticket id, user id, tool name, duration ms, success, optional error code, model).
- **`AiSupportFeedback`**: Optional user rating of a bot message (`messageId`, `helpful`).
- **`SystemConfig`** key **`ai_support_enabled`**: Admin runtime toggle (`true` / `false`) when set; combined with env `AI_SUPPORT_ENABLED`.

### Support API behavior

- **`POST /support/tickets/:id/messages`**: Saves the user message first; if the ticket is **unassigned** and AI is **effectively enabled** (env + DB + Groq), the orchestrator runs and returns **`{ message, botMessage }`**. Otherwise `botMessage` is `null`.
- **`POST /support/tickets/:id/messages/stream`**: Same as above but responds with **Server-Sent Events**: `user_message`, then **`chunk`** events (Groq **token stream** when enabled, otherwise 32-char slices of the final text), then **`done`** with the persisted `botMessage` (or `null`).
- **`POST /support/tickets/:id/ai-followup`**: If SSE failed on the client but the **user message was already saved**, call this to **run the AI once** without inserting another user row (avoids duplicate lines). Throttled like stream.
- **`POST /support/tickets/:id/ai-feedback`**: Body `{ messageId, helpful }` — stores feedback for a **BOT** message on the user’s ticket.
- **`PATCH .../read` (user)**: Marks **`CUSTOMER_SERVICE`** and **`BOT`** messages as read.

### Admin ops

- **`GET /api/admin/ai-support/settings`**: `effectiveEnabled`, `envEnabled`, `groqConfigured`, `runtimeDisabledByAdmin`, `model` (JWT super-user **ADMIN** only).
- **`PATCH /api/admin/ai-support/settings`**: Body `{ enabled: boolean }` — upserts `SystemConfig` `ai_support_enabled`.
- **`GET /api/admin/ai-support/analytics?days=30`**: Feedback counts, escalations, bot messages, tool-call stats (grouped by tool / success).
- **`GET /api/admin/ai-support/tool-logs?limit=80&ticketId=`**: Recent rows from `AiSupportToolLog`.

**Rate limits**: `POST /support/tickets/:id/messages` and `.../messages/stream` use stricter per-route throttles (25/min and 15/min) on top of the global limiter.

**Policies**: Default rules live in `src/ai-support/ai-support-default-policies.ts`; optional env `AI_SUPPORT_POLICIES` is appended. **RAG** for policies is intentionally skipped for now (short text → inject into system prompt).

### Human takeover

- When **customer service** sends a message, the ticket is **assigned**; **`assignedTo` set** disables further AI replies on new user messages.

### Escalation and notifications

- **Handoff** in `ai-support-handoff.ts`; **`SupportNotificationListener`** handles **`support.human_requested`** with `SUPPORT_HUMAN_REQUESTED`.

### Configuration (environment)

| Variable | Role |
|----------|------|
| `GROQ_API_KEY` | Groq API secret (server only). |
| `GROQ_MODEL` | Model id (e.g. `llama-3.3-70b-versatile`). |
| `GROQ_MODEL_FALLBACK` | Optional secondary model id used when the primary hits **daily** quota (TPD); TPM 429 uses retries instead. |
| `GROQ_MAX_TOKENS` | Max output tokens for completions/stream (default 900; clamped 256–4096). |
| `AI_SUPPORT_ENABLED` | Must be `true` / `1` / `on` / `yes` for AI to be eligible; admin can still disable via DB. |
| `AI_SUPPORT_POLICIES` | Optional extra policy text appended to the system prompt. |

### Database migrations

Apply with `npx prisma migrate deploy` in each environment (includes `ai_support_tool_logs`, `ai_support_feedback`, and earlier AI support migrations).

---

## Frontend (delivery-frontend)

| Item | Location |
|------|----------|
| Types + stream + feedback API | `services/api/support.service.ts` |
| Message row (BOT, citations, track, helpfulness) | `components/support/SupportChatMessageItem.tsx` |
| Customer chat (stream + track-driver link) | `app/(customer)/support-chat.tsx` |
| Driver chat (stream, no track CTA) | `app/(driver)/support-chat.tsx` |

**Mobile note:** On React Native, SSE uses **`XMLHttpRequest`** progressive `responseText` because `fetch` often has no `response.body`; on failure after the user row exists, call **`aiFollowup`** (see `support.service.ts`).

---

## Further improvements (optional)

1. **Richer analytics** (latency percentiles, cost estimates, per-ticket drill-down in the admin app).
2. **RAG** for policies only if documents grow large and change often; until then, prompt injection + `AI_SUPPORT_POLICIES` is enough.

### delivery-control (admin UI)

- **`/dashboard/ai-support`**: Runtime toggle (`ai_support_enabled`), feedback + tool metrics, recent tool log table (reads the same PostgreSQL DB as the API).

---

## Files to know (quick map)

| Area | Path |
|------|------|
| Module | `src/ai-support/ai-support.module.ts` |
| Orchestrator | `src/ai-support/ai-support-orchestrator.service.ts` |
| Runtime config | `src/ai-support/ai-support-config.service.ts` |
| Admin API | `src/ai-support/ai-support-admin.controller.ts` |
| Tools | `src/ai-support/ai-support-tools.service.ts` |
| Groq | `src/ai-support/groq-client.service.ts` |
| Handoff | `src/ai-support/ai-support-handoff.ts` |
| Citations | `src/ai-support/ai-support-citations.ts` |
| Tool schemas | `src/ai-support/ai-support.tool-definitions.ts` |
| Support wiring | `src/support/support.service.ts`, `support.controller.ts` |
| Notifications | `src/notifications/listeners/support-notification.listener.ts` |
| Steering / Phase 0 summary | `../.kiro/steering/current-status.md` |

---

*Last updated: token streaming, `ai-followup`, Groq TPD fallback + `GROQ_MAX_TOKENS`, admin analytics API, throttles, delivery-control AI Support page, prompt-based policies (no RAG). Workspace summary: `../project-status.md`; rapport (conception IA): `../pde-rapport/conception-intelligence-artificielle.md`.*
