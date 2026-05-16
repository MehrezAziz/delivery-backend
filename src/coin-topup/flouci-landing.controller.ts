import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

/** Minimal HTTPS landing pages Flouci can redirect mobile users to after pay (then they return manually to the app). */
@Controller('payments/flouci/landing')
export class FlouciLandingController {
  private shell(title: string, inner: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin:0; min-height:100vh;
    display:flex; align-items:center; justify-content:center; background: radial-gradient(circle at 20% 20%,#e0f2fe 0,transparent 45%), radial-gradient(circle at 80% 10%,#ede9fe 0,transparent 40%),#0f172a; color:#e2e8f0; }
  .card { max-width:420px; padding:28px 24px; border-radius:20px; background:rgba(15,23,42,0.78);
    border:1px solid rgba(148,163,184,0.28); box-shadow:0 25px 60px rgba(0,0,0,0.45); text-align:center; }
  h1 { font-size:1.35rem; margin:0 0 10px; letter-spacing:-0.02em; }
  p { margin:0; line-height:1.55; color:#cbd5e1; font-size:0.95rem; }
  .pill { display:inline-block; margin-top:18px; padding:8px 14px; border-radius:999px; font-size:12px; font-weight:600;
    background:rgba(56,189,248,0.15); color:#7dd3fc; border:1px solid rgba(56,189,248,0.35); }
</style>
</head>
<body>
  <div class="card">${inner}</div>
</body>
</html>`;
  }

  @Get('success')
  success(
    @Query('tracking') tracking: string | undefined,
    @Query('amount') amount: string | undefined,
    @Res() res: Response,
  ) {
    const tr = (tracking ?? '').trim();
    const amt = (amount ?? '').trim();
    res
      .status(200)
      .type('html')
      .send(
        this.shell(
          'Payment complete',
          `<h1>Payment received</h1>
${amt ? `<p style="font-size:1.35rem;font-weight:800;margin:12px 0 0;color:#f8fafc">${escapeHtml(amt)} TND</p>` : ''}
<p style="margin-top:12px">Your bank confirmed the payment. Coins are added as soon as our server verifies the transaction — usually within a few seconds.</p>
<p style="margin-top:12px">You can close this window and return to the app.</p>
${tr ? `<span class="pill">Ref · ${escapeHtml(tr)}</span>` : ''}`,
        ),
      );
  }

  @Get('failure')
  failure(
    @Query('tracking') tracking: string | undefined,
    @Query('amount') amount: string | undefined,
    @Res() res: Response,
  ) {
    const tr = (tracking ?? '').trim();
    const amt = (amount ?? '').trim();
    res
      .status(200)
      .type('html')
      .send(
        this.shell(
          'Payment not completed',
          `<h1>Payment not completed</h1>
${amt ? `<p style="font-size:1.2rem;font-weight:700;margin:12px 0 0;color:#fca5a5">${escapeHtml(amt)} TND was not charged</p>` : ''}
<p style="margin-top:12px">The payment was cancelled or could not be processed. No charge was applied on our side.</p>
<p style="margin-top:12px">Return to the app to try again.</p>
${tr ? `<span class="pill">Ref · ${escapeHtml(tr)}</span>` : ''}`,
        ),
      );
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
