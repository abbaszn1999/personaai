/**
 * Drives the catalog drain route to completion from a dev machine.
 *
 * In production pg_cron calls this route on a schedule, but Supabase's pg_net cannot reach a
 * localhost dev server, so a backfill would otherwise never start locally. Each request drains
 * batches until it hits its own time budget and returns; this just keeps calling until the
 * queue reports empty.
 *
 * Usage: node scripts/drain-catalog.mjs [--url http://localhost:3000]
 */
import { readFileSync } from "node:fs";

function readEnvLocal() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnvLocal();
const secret = process.env.INTERNAL_JOB_SECRET || env.INTERNAL_JOB_SECRET;
const urlArg = process.argv.indexOf("--url");
const baseUrl = (urlArg > -1 ? process.argv[urlArg + 1] : env.APP_URL) || "http://localhost:3000";

if (!secret) {
  console.error("INTERNAL_JOB_SECRET is not set — add it to .env.local first.");
  process.exit(1);
}

const started = Date.now();
let totalIndexed = 0;
let totalFailed = 0;
let pass = 0;

while (true) {
  pass += 1;
  let res;
  try {
    res = await fetch(`${baseUrl}/api/internal/catalog/drain`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
      redirect: "manual",
    });
  } catch (err) {
    console.error(`pass ${pass}: request failed — ${err.message}. Retrying in 10s.`);
    await new Promise((r) => setTimeout(r, 10_000));
    continue;
  }

  if (!res.ok) {
    console.error(`pass ${pass}: HTTP ${res.status}. Stopping.`);
    process.exit(1);
  }

  const body = await res.json();
  totalIndexed += body.indexed;
  totalFailed += body.failed;
  const mins = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(
    `pass ${pass}: indexed ${body.indexed}, skipped ${body.skipped}, failed ${body.failed}, ` +
      `remaining ${body.remaining} — ${totalIndexed} done in ${mins}m`
  );

  // Retrying an exhausted account just re-reads the same messages and inflates their delivery
  // counts, so stop and let a human top up the credit.
  if (body.quotaExhausted) {
    console.error(
      "\nStopped: the platform Gemini account is out of credit. No products were dropped — " +
        `${body.remaining} remain queued. Top up GEMINI_API_KEY's billing, then re-run this script.`
    );
    process.exit(1);
  }

  // `claimed === 0` means the queue had nothing visible to hand out. Anything still counted in
  // `remaining` is a message serving out its visibility timeout after a failure, so waiting and
  // re-reading is what lets those retries actually happen instead of exiting early on them.
  if (body.claimed === 0) {
    if (body.remaining === 0) break;
    console.log(`  ${body.remaining} message(s) awaiting retry — waiting 60s.`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

console.log(`Done. Indexed ${totalIndexed}, failed ${totalFailed}, in ${((Date.now() - started) / 60_000).toFixed(1)}m.`);
