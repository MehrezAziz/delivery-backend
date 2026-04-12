/**
 * Derives short citation lines and optional track CTA from tool results (Phase 2: UI transparency).
 */

export interface TrackRecommendation {
  orderId: string;
  showTrackButton: boolean;
  driverTrackable: boolean;
}

export function buildCitationLines(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): string[] {
  const lines: string[] = [];
  if (result === null || result === undefined) return lines;
  const r = result as Record<string, unknown>;
  if (r.error) {
    lines.push(`${toolName}: ${String(r.error)}`);
    return lines;
  }

  switch (toolName) {
    case 'get_order_details': {
      const id = String((r.id as string) ?? args.orderId ?? '');
      const short = id.length > 14 ? `${id.slice(0, 8)}…` : id;
      lines.push(`Order ${short} — status: ${String(r.status ?? '?')}`);
      const tr = r.tracking as Record<string, unknown> | undefined;
      if (tr?.uiTrackRecommended) {
        lines.push('Tracking may be available in the app for this order.');
      }
      break;
    }
    case 'list_orders': {
      const orders = (r as { orders?: unknown[] }).orders;
      const n = Array.isArray(orders) ? orders.length : 0;
      lines.push(`Orders list: ${n} row(s).`);
      break;
    }
    case 'get_wallet': {
      const kind = (r as { kind?: string }).kind;
      const bal = (r as { balance?: string }).balance;
      if (bal != null) lines.push(`Wallet snapshot (${kind ?? 'account'}): balance ${bal}.`);
      break;
    }
    case 'get_user_profile': {
      const role = (r as { role?: string }).role;
      if (role) lines.push(`Profile: role ${role}.`);
      break;
    }
    case 'list_addresses': {
      const addrs = (r as { addresses?: unknown[] }).addresses;
      lines.push(`Addresses: ${Array.isArray(addrs) ? addrs.length : 0} saved.`);
      break;
    }
    case 'get_support_history': {
      const tix = (r as { tickets?: unknown[] }).tickets;
      lines.push(`Past support tickets: ${Array.isArray(tix) ? tix.length : 0}.`);
      break;
    }
    case 'get_peer_chat_summaries': {
      const rooms = (r as { rooms?: unknown[] }).rooms;
      lines.push(`Peer chats (order): ${Array.isArray(rooms) ? rooms.length : 0} thread(s).`);
      break;
    }
    case 'get_driver_for_order': {
      lines.push('Driver assignment / public driver info for order.');
      break;
    }
    case 'get_driver_position': {
      const hasFix = (r as { hasFix?: boolean }).hasFix;
      const recent = (r as { recentEnough?: boolean }).recentEnough;
      if (hasFix) {
        lines.push(`Driver GPS: last fix ${recent ? 'recent' : 'stale'} (use app map for live view).`);
      } else {
        lines.push('No recent GPS fix for this order (driver may be offline).');
      }
      break;
    }
    default:
      break;
  }

  return lines;
}

export function mergeCitations(lines: string[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Prefer active delivery orders for “Track” CTA metadata. */
export function inferTrackRecommendation(
  traces: Array<{ name: string; result: unknown }>,
): TrackRecommendation | undefined {
  for (const { name, result } of traces) {
    if (name !== 'get_order_details') continue;
    const r = result as Record<string, unknown>;
    const tr = r.tracking as Record<string, unknown> | undefined;
    const id = r.id as string | undefined;
    if (!id || !tr?.uiTrackRecommended) continue;
    return {
      orderId: id,
      showTrackButton: true,
      driverTrackable: !!tr.driverProbablyTrackable,
    };
  }
  return undefined;
}
