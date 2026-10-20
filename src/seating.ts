/**
 * Table seating for networking events: who sits with whom.
 *
 * Scale is tens to hundreds of guests, so there's no solver: greedy pairing
 * by affinity, round-robin for the rest, then 2-opt local search. Re-runnable
 * from scratch on current data.
 *
 * The unit of placement is a *party* (everyone booked together: a buyer and
 * their companions). A party is never split: "we sit together" outranks any
 * matchmaking score.
 */

export interface Guest {
  id: string;
  company?: string;
  industry?: string;
  interests?: string[];
  revenueBand?: string;
  /** Opt-in: only then is a matching revenue band rewarded. */
  wantsSimilarRevenue?: boolean;
  /** People this guest asked to sit with (guest ids or company names). */
  wants?: { guestIds?: string[]; companies?: string[] };
  /** Hard constraint, bidirectional: never at the same table. */
  blocks?: { guestIds?: string[]; companies?: string[] };
}

export interface PartyInput {
  id: string;
  /** Guests in the party. Profile fields are read from the first guest that has them. */
  guests: Guest[];
  /** Physical seats needed (companions without a profile still need a seat). Defaults to guests.length. */
  seats?: number;
}

export interface TableInput {
  number: number;
  capacity: number;
}

export const WEIGHTS = {
  mutualWant: 50,
  oneWayWant: 20,
  sharedInterest: 15,
  similarRevenue: 20,
  tableDiversity: 10,
};

interface Party {
  id: string;
  guestIds: string[];
  seats: number;
  company: string;
  industry: string;
  interests: Set<string>;
  revenueBand: string;
  wantsSimilarRevenue: boolean;
}

interface Table {
  number: number;
  capacity: number;
  parties: Party[];
}

export interface SeatingResult {
  tables: Array<{ number: number; capacity: number; parties: Array<{ id: string; guestIds: string[]; seats: number; score: number }> }>;
  unassigned: Array<{ id: string; seats: number; oversized: boolean }>;
  score: number;
  swaps: number;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function planSeating(input: { parties: PartyInput[]; tables: TableInput[]; maxPasses?: number }): SeatingResult {
  const guests = input.parties.flatMap((p) => p.guests);
  const companyOf = new Map(guests.map((g) => [g.id, norm(g.company)]));

  const parties: Party[] = input.parties.map((p) => {
    const rep = p.guests.find((g) => g.industry || g.interests?.length || g.company) ?? p.guests[0];
    return {
      id: p.id,
      guestIds: p.guests.map((g) => g.id),
      seats: p.seats ?? p.guests.length,
      company: norm(rep?.company),
      industry: norm(rep?.industry),
      // union of interests across the party
      interests: new Set(p.guests.flatMap((g) => (g.interests ?? []).map(norm))),
      revenueBand: norm(rep?.revenueBand),
      wantsSimilarRevenue: Boolean(rep?.wantsSimilarRevenue),
    };
  });

  // ── hard constraints: blocked guest pairs, by person or by company, both directions ──
  const blocked = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const g of guests) {
    for (const other of g.blocks?.guestIds ?? []) if (other !== g.id) blocked.add(pairKey(g.id, other));
    for (const company of (g.blocks?.companies ?? []).map(norm)) {
      for (const [id, c] of companyOf) if (id !== g.id && c && c === company) blocked.add(pairKey(g.id, id));
    }
  }
  const partiesBlocked = (a: Party, b: Party) =>
    a.id !== b.id && a.guestIds.some((x) => b.guestIds.some((y) => blocked.has(pairKey(x, y))));

  // ── soft affinity ──
  const wantsOf = new Map(guests.map((g) => [g.id, { ids: new Set(g.wants?.guestIds ?? []), companies: (g.wants?.companies ?? []).map(norm) }]));
  const wants = (a: Party, b: Party) =>
    a.guestIds.some((x) => {
      const w = wantsOf.get(x)!;
      return b.guestIds.some((y) => w.ids.has(y)) || (b.company !== "" && w.companies.includes(b.company));
    });

  const pairScore = (a: Party, b: Party): number => {
    let s = 0;
    const ab = wants(a, b), ba = wants(b, a);
    if (ab && ba) s += WEIGHTS.mutualWant;
    else if (ab || ba) s += WEIGHTS.oneWayWant;
    if ([...a.interests].some((i) => b.interests.has(i))) s += WEIGHTS.sharedInterest;
    if (a.wantsSimilarRevenue && b.wantsSimilarRevenue && a.revenueBand && a.revenueBand === b.revenueBand) s += WEIGHTS.similarRevenue;
    return s;
  };

  const tables: Table[] = [...input.tables].sort((x, y) => x.number - y.number).map((t) => ({ ...t, parties: [] }));
  const where = new Map<string, Table>();
  const free = (t: Table) => t.capacity - t.parties.reduce((n, p) => n + p.seats, 0);
  const conflicts = (p: Party, t: Table) => t.parties.some((q) => partiesBlocked(p, q));
  const place = (p: Party, t: Table) => {
    t.parties.push(p);
    where.set(p.id, t);
  };

  // ── 1. greedy: best pairs first ──
  const pairs: Array<{ a: Party; b: Party; s: number }> = [];
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      if (partiesBlocked(parties[i], parties[j])) continue;
      const s = pairScore(parties[i], parties[j]);
      if (s > 0) pairs.push({ a: parties[i], b: parties[j], s });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  for (const { a, b } of pairs) {
    const ta = where.get(a.id), tb = where.get(b.id);
    if (ta && tb) continue;
    if (!ta && !tb) {
      const t = tables.find((t) => free(t) >= a.seats + b.seats && !conflicts(a, t) && !conflicts(b, t));
      if (t) { place(a, t); place(b, t); }
    } else {
      const [joiner, table] = ta ? [b, ta] : [a, tb!];
      if (free(table) >= joiner.seats && !conflicts(joiner, table)) place(joiner, table);
    }
  }

  // ── 2. round-robin for the rest: fewest same-industry parties first, then most free seats ──
  const oversized = new Set<string>();
  for (const p of parties.filter((p) => !where.has(p.id))) {
    const candidates = tables.filter((t) => free(t) >= p.seats && !conflicts(p, t));
    if (!candidates.length) {
      if (!tables.some((t) => t.capacity >= p.seats)) oversized.add(p.id);
      continue;
    }
    const sameIndustry = (t: Table) => (p.industry ? t.parties.filter((q) => q.industry === p.industry).length : 0);
    candidates.sort((x, y) => sameIndustry(x) - sameIndustry(y) || free(y) - free(x));
    place(p, candidates[0]);
  }

  // ── 3. score: pairwise affinity + a bonus per table that mixes industries ──
  const tableScore = (t: Table) => {
    let s = 0;
    for (let i = 0; i < t.parties.length; i++) for (let j = i + 1; j < t.parties.length; j++) s += pairScore(t.parties[i], t.parties[j]);
    const industries = new Set(t.parties.map((p) => p.industry).filter(Boolean));
    if (t.parties.length > 1 && industries.size > 1) s += WEIGHTS.tableDiversity;
    return s;
  };

  // ── 4. 2-opt: swap whole equal-size parties between tables while it improves the score ──
  let swaps = 0;
  for (let pass = 0; pass < (input.maxPasses ?? 3); pass++) {
    let improved = false;
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const t1 = tables[i], t2 = tables[j];
        for (let pi = 0; pi < t1.parties.length; pi++) {
          for (let pj = 0; pj < t2.parties.length; pj++) {
            const a = t1.parties[pi], b = t2.parties[pj];
            if (a.seats !== b.seats) continue;
            const before = tableScore(t1) + tableScore(t2);
            t1.parties[pi] = b;
            t2.parties[pj] = a;
            const conflict = t1.parties.some((p, k) => k !== pi && partiesBlocked(p, b)) || t2.parties.some((p, k) => k !== pj && partiesBlocked(p, a));
            if (!conflict && tableScore(t1) + tableScore(t2) > before) {
              where.set(a.id, t2);
              where.set(b.id, t1);
              improved = true;
              swaps++;
            } else {
              t1.parties[pi] = a;
              t2.parties[pj] = b;
            }
          }
        }
      }
    }
    if (!improved) break;
  }

  return {
    tables: tables.map((t) => ({
      number: t.number,
      capacity: t.capacity,
      parties: t.parties.map((p) => ({
        id: p.id,
        guestIds: p.guestIds,
        seats: p.seats,
        score: t.parties.filter((q) => q !== p).reduce((n, q) => n + pairScore(p, q), 0),
      })),
    })),
    unassigned: parties.filter((p) => !where.has(p.id)).map((p) => ({ id: p.id, seats: p.seats, oversized: oversized.has(p.id) })),
    score: tables.reduce((n, t) => n + tableScore(t), 0),
    swaps,
  };
}
