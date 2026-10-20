import type { Guest, PartyInput, TableInput } from "./seating.ts";

/** Deterministic PRNG so the demo plan is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INDUSTRIES = ["Retail", "Construction", "IT", "Health", "Real estate", "Hospitality", "Logistics", "Finance"];
const INTERESTS = ["export", "hiring", "AI", "funding", "franchising", "marketing", "energy", "e-commerce"];
const BANDS = ["<500k", "500k-2M", "2M-10M", ">10M"];

/** A fictional business gala: 48 parties of 1-3 seats, some wishes and a few blocks, 9 tables of 10. */
export function demoEvent(seed = 7, partyCount = 48): { parties: PartyInput[]; tables: TableInput[] } {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const parties: PartyInput[] = [];
  for (let i = 1; i <= partyCount; i++) {
    const size = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
    const guests: Guest[] = Array.from({ length: size }, (_, k) => ({ id: `g${i}_${k}` }));
    Object.assign(guests[0], {
      company: `Company ${i}`,
      industry: pick(INDUSTRIES),
      interests: [pick(INTERESTS), pick(INTERESTS)],
      revenueBand: pick(BANDS),
      wantsSimilarRevenue: rnd() < 0.4,
    });
    parties.push({ id: `p${i}`, guests });
  }
  // wishes and blocks between random parties
  for (let k = 0; k < 18; k++) {
    const a = pick(parties).guests[0], b = pick(parties).guests[0];
    if (a !== b) (a.wants ??= {}).guestIds = [...(a.wants?.guestIds ?? []), b.id];
  }
  for (let k = 0; k < 4; k++) {
    const a = pick(parties).guests[0], b = pick(parties);
    if (a.company !== b.guests[0].company) (a.blocks ??= {}).companies = [b.guests[0].company!];
  }
  const tables: TableInput[] = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, capacity: 10 }));
  return { parties, tables };
}
