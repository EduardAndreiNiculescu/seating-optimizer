import assert from "node:assert/strict";
import { test } from "node:test";
import { demoEvent } from "../src/demo-data.ts";
import { renderSeatingSvg } from "../src/render-svg.ts";
import { planSeating, WEIGHTS, type PartyInput } from "../src/seating.ts";

const solo = (id: string, extra: Record<string, unknown> = {}): PartyInput => ({ id, guests: [{ id: `${id}g`, company: id, ...extra }] });

test("parties are never split and capacity is respected", () => {
  const { parties, tables } = demoEvent(3);
  const r = planSeating({ parties, tables });
  const seen = new Map<string, number>();
  for (const t of r.tables) {
    assert.ok(t.parties.reduce((n, p) => n + p.seats, 0) <= t.capacity, `table ${t.number} over capacity`);
    for (const p of t.parties) {
      assert.ok(!seen.has(p.id), `${p.id} appears twice`);
      seen.set(p.id, t.number);
      assert.equal(p.guestIds.length, parties.find((x) => x.id === p.id)!.guests.length);
    }
  }
  assert.equal(seen.size + r.unassigned.length, parties.length);
});

test("blocked pairs never share a table, by person or by company, in both directions", () => {
  const parties = [
    solo("a", { blocks: { guestIds: ["bg"] }, wants: { guestIds: ["bg"] } }),
    solo("b", { wants: { guestIds: ["ag"] } }),
    solo("c", { blocks: { companies: ["D"] } }),
    solo("d", { company: "D", wants: { guestIds: ["cg"] } }),
  ];
  const r = planSeating({ parties, tables: [{ number: 1, capacity: 4 }, { number: 2, capacity: 4 }] });
  const tableOf = (id: string) => r.tables.find((t) => t.parties.some((p) => p.id === id))!.number;
  assert.notEqual(tableOf("a"), tableOf("b"), "mutual wish must not override a block");
  assert.notEqual(tableOf("c"), tableOf("d"));
});

test("mutual wishes beat one-way wishes and seat people together", () => {
  const parties = [
    solo("a", { wants: { guestIds: ["bg"] } }),
    solo("b", { wants: { guestIds: ["ag"] } }),
    solo("c", { wants: { companies: ["a"] } }),
    solo("x"),
  ];
  const r = planSeating({ parties, tables: [{ number: 1, capacity: 2 }, { number: 2, capacity: 2 }] });
  const t1 = r.tables.find((t) => t.parties.some((p) => p.id === "a"))!;
  assert.deepEqual(t1.parties.map((p) => p.id).sort(), ["a", "b"]);
  assert.equal(t1.parties[0].score, WEIGHTS.mutualWant);
});

test("revenue matching only counts when both sides opted in", () => {
  const optIn = { revenueBand: "2M-10M", wantsSimilarRevenue: true };
  const both = planSeating({ parties: [solo("a", optIn), solo("b", optIn)], tables: [{ number: 1, capacity: 2 }] });
  const one = planSeating({ parties: [solo("a", optIn), solo("b", { revenueBand: "2M-10M" })], tables: [{ number: 1, capacity: 2 }] });
  assert.equal(both.score, WEIGHTS.similarRevenue);
  assert.equal(one.score, 0);
});

test("oversized parties are reported, not forced", () => {
  const big: PartyInput = { id: "big", guests: [{ id: "x" }], seats: 12 };
  const r = planSeating({ parties: [big, solo("a")], tables: [{ number: 1, capacity: 10 }] });
  assert.deepEqual(r.unassigned, [{ id: "big", seats: 12, oversized: true }]);
});

test("2-opt improves a deliberately bad greedy start", () => {
  // Greedy fills table 1 with the a-b pair; c and d only like each other via shared interest
  // across tables after round-robin, which local search fixes.
  const parties = [
    solo("a", { interests: ["export"], industry: "IT" }),
    solo("b", { interests: ["hiring"], industry: "IT" }),
    solo("c", { interests: ["export"], industry: "Retail" }),
    solo("d", { interests: ["hiring"], industry: "Retail" }),
  ];
  const r = planSeating({ parties, tables: [{ number: 1, capacity: 2 }, { number: 2, capacity: 2 }] });
  const mates = (id: string) => r.tables.find((t) => t.parties.some((p) => p.id === id))!.parties.map((p) => p.id).sort();
  assert.deepEqual(mates("a"), ["a", "c"]);
  assert.equal(r.score, 2 * (WEIGHTS.sharedInterest + WEIGHTS.tableDiversity));
});

test("demo plan renders to SVG", () => {
  const r = planSeating(demoEvent());
  const svg = renderSeatingSvg(r, { title: "Demo gala" });
  assert.ok(svg.startsWith("<svg") && svg.includes("T9"));
  assert.ok(r.score > 0);
});
