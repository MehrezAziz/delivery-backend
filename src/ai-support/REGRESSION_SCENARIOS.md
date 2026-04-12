# AI support — manual regression checklist

Run through these on a **staging** build with `AI_SUPPORT_ENABLED=true`. Ticket must be **unassigned** for the bot to reply.

## Happy paths

1. Customer asks “What is my last order status?” — bot uses tools, cites order/status, no invention.
2. Customer gives a valid `orderId` — `get_order_details` returns consistent status with DB.
3. Driver asks “How much is on my account?” — wallet tool returns driver account, not customer wallet.
4. User asks for saved addresses — list shows delegations/governorates, no surprise coords.
5. Active delivery — metadata may include `trackRecommendation` and citations mention tracking when relevant.

## Human / escalation

6. “I want to speak to a human” — ticket priority raised (if not already URGENT), admins/CS notified once, `escalationReason: human_intent` on bot metadata when first fired.
7. “I need a refund” — same notification path, `escalationReason: sensitive_topic`.
8. Second message with “human” again — no duplicate admin spam (`humanEscalationNotifiedAt` set).

## Edge & safety

9. User mentions another user’s order id (forbidden) — tool returns error/empty; bot does not fabricate.
10. Closed ticket — user cannot post; no bot.
11. Assigned ticket (CS replied) — bot does not run on new user messages.
12. Groq failure / timeout — user gets fallback BOT message, no crash.
13. Long thread — still completes within tool round limit; no runaway loop.

## Languages

14. Short message in French requesting “un conseiller” — escalation triggers.
15. Mixed FR/EN — assistant responds in kind if possible.

## Read state

16. User marks read — BOT and CS messages marked read together for USER reader.

## Wallet / money

17. Customer wallet balance matches DB after a known transaction.
18. User asks only “refund” without order context — bot escalates and does not promise money back.

## Peer chat

19. Customer with past order chats — `get_peer_chat_summaries` returns previews without exposing other users’ PII beyond what’s needed.

## Performance

20. First reply after user message completes within acceptable latency (network + Groq).

_Add scenarios as you discover production issues; keep IDs anonymized in notes._
