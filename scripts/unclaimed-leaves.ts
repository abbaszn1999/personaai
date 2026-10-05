/** npx tsx scripts/unclaimed-leaves.ts <brand> <dept,dept...> — leaves in those departments no chart claims. */
import { CHART_SEEDS } from "@/lib/sizing/seeds";
import { PERSONA_CATEGORIES, leafKeysFor } from "@/modules/store/mapping/persona-taxonomy";

const [brand, depts] = process.argv.slice(2);
const claimed = new Set((CHART_SEEDS[brand] ?? []).flatMap((chart) => chart.coversLeaves));
for (const dept of depts.split(",")) {
  const missing = PERSONA_CATEGORIES.flatMap((cat) => leafKeysFor(dept as never, cat.id)).filter(
    (leaf) => !claimed.has(leaf),
  );
  console.log(`${dept}: ${missing.join(" ")}`);
}
