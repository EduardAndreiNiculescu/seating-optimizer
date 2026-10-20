import type { SeatingResult } from "./seating.ts";


/**
 * Renders a seating plan as a self-contained SVG: round tables, one dot per
 * seat, each party in its own colour, so "parties are never split" is visible.
 */
export function renderSeatingSvg(result: SeatingResult, opts: { columns?: number; title?: string; label?: (guestId: string) => string } = {}): string {
  const cols = opts.columns ?? 4;
  const cell = 230;
  const rows = Math.ceil(result.tables.length / cols);
  const width = cols * cell;
  const height = rows * cell + 90;
  const colourOf = new Map<string, string>();
  let next = 0;
  const colour = (partyId: string) => {
    // golden-angle hues: every party gets a distinct colour, however many there are
    if (!colourOf.has(partyId)) colourOf.set(partyId, `hsl(${Math.round((next++ * 137.508) % 360)} 70% ${next % 2 ? 58 : 46}%)`);
    return colourOf.get(partyId)!;
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter,Segoe UI,Arial,sans-serif">`,
    `<rect width="100%" height="100%" fill="#0f1115"/>`,
    `<text x="24" y="40" fill="#f5f5f5" font-size="22" font-weight="700">${esc(opts.title ?? "Seating plan")}</text>`,
    `<text x="24" y="66" fill="#9aa0a6" font-size="15">score ${result.score} · ${result.swaps} improving swaps · ${result.unassigned.length} unassigned</text>`,
  ];

  result.tables.forEach((t, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2 + 80;
    const r = 58;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b1f27" stroke="#2c3240" stroke-width="2"/>`);
    parts.push(`<text x="${cx}" y="${cy - 4}" fill="#f5f5f5" font-size="18" font-weight="700" text-anchor="middle">T${t.number}</text>`);
    const used = t.parties.reduce((n, p) => n + p.seats, 0);
    const score = t.parties.reduce((n, p) => n + p.score, 0) / 2;
    parts.push(`<text x="${cx}" y="${cy + 18}" fill="#9aa0a6" font-size="12" text-anchor="middle">${used}/${t.capacity} · +${score}</text>`);
    let seat = 0;
    for (const p of t.parties) {
      for (let s = 0; s < p.seats; s++, seat++) {
        const a = (seat / t.capacity) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * (r + 22);
        const sy = cy + Math.sin(a) * (r + 22);
        const title = esc(opts.label?.(p.guestIds[s] ?? p.guestIds[0]) ?? p.id);
        parts.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="11" fill="${colour(p.id)}"><title>${title}</title></circle>`);
      }
    }
    for (; seat < t.capacity; seat++) {
      const a = (seat / t.capacity) * Math.PI * 2 - Math.PI / 2;
      parts.push(`<circle cx="${(cx + Math.cos(a) * (r + 22)).toFixed(1)}" cy="${(cy + Math.sin(a) * (r + 22)).toFixed(1)}" r="11" fill="none" stroke="#3a4150" stroke-dasharray="3 3"/>`);
    }
  });
  parts.push("</svg>");
  return parts.join("\n");
}
