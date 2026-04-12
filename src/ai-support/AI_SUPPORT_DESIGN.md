# AI support assistant — Phase 0 design (living document)

## Persona

- **Role**: In-app support assistant for a delivery platform (customers and drivers).
- **Tone**: Professional, calm, concise; match the user’s language when possible (e.g. English, French).
- **May do**: Explain order status, wallet snapshots, addresses, past tickets, peer order-chat summaries, driver public info and tracking hints using **tools only**.
- **Must not do**: Promise refunds, legal outcomes, or permanent account changes; share passwords, full card numbers, or verification documents; invent IDs or amounts.

## Handoff & escalation

| Signal | Action |
|--------|--------|
| Explicit human intent (e.g. “agent”, “human”, “real person”, FR “conseiller”) | Notify admins + CS (once per ticket via `humanEscalationNotifiedAt`), set priority HIGH unless already URGENT |
| Sensitive topics: refund, chargeback, lawyer, lawsuit, police, legal action, serious fraud wording | Same escalation path (`escalationReason: sensitive_topic`) |
| User frustration (wording only) | No auto-notification; system prompt nudges empathy |

Customer service messages still **assign** the ticket and **disable** the bot for that thread.

## Redaction matrix (tools → model)

| Data | Customer | Driver | Notes |
|------|----------|--------|--------|
| Phone | Masked (`***` + last 4) | Masked | Never full number in tools |
| Email | Domain only or omitted | — | Profile tool avoids full email by default |
| Password / card / bank | Never selected | Never | — |
| Order addresses | Street + delegation + governorate | Same when applicable | No raw lat/long in list tools |
| Driver on order | First name, vehicle, timeline, masked phone hint | N/A for “customer asking” tool | Documents not exposed |
| GPS | Last point + recency for customer’s order | Customer-only tool | Live UI remains in main app |

## Metadata for the app (`SupportMessage.metadata`)

- `helpfulnessPrompt`: show Yes/No (or equivalent).
- `citations`: short strings summarizing which tool data grounded the reply.
- `trackRecommendation`: `{ orderId, showTrackButton, driverTrackable }` when order is trackable in-app.
- `escalationReason`: `human_intent` \| `sensitive_topic` when this turn triggered escalation.
- `model`: Groq model id string.

## Configuration

- `AI_SUPPORT_ENABLED` — must be `true` / `1` / `on` / `yes` to run.
- `GROQ_API_KEY`, `GROQ_MODEL`
- `AI_SUPPORT_POLICIES` — optional extra one-line or short policy text appended to the system prompt.
