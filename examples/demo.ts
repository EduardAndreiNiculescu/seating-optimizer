/** node examples/demo.ts  ->  docs/demo-plan.svg + summary */
import fs from "node:fs";
import { demoEvent } from "../src/demo-data.ts";
import { renderSeatingSvg } from "../src/render-svg.ts";
import { planSeating } from "../src/seating.ts";

const event = demoEvent();
const t0 = performance.now();
const plan = planSeating(event);
const ms = (performance.now() - t0).toFixed(1);
const guests = event.parties.reduce((n, p) => n + (p.seats ?? p.guests.length), 0);

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/demo-plan.svg", renderSeatingSvg(plan, { columns: 3, title: `Demo gala · ${event.parties.length} parties · ${guests} guests` }));
console.log(`${event.parties.length} parties, ${guests} seats, ${event.tables.length} tables -> score ${plan.score}, ${plan.swaps} improving swaps, ${plan.unassigned.length} unassigned, ${ms} ms`);
