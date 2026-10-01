import { MESSAGE_MAX, platforms, topics } from "@/lib/contact";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  // Bots fill every field, including the hidden one; pretend it worked.
  if (text(body.website, 200)) return Response.json({ ok: true });

  const name = text(body.name, 120);
  const email = text(body.email, 200);
  const store = text(body.store, 300);
  const message = text(body.message, MESSAGE_MAX);
  const topic = topics.find((t) => t.id === body.topic)?.label ?? topics[0].label;
  const platform = platforms.find((p) => p === body.platform) ?? "";

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL ?? "info@autommerce.com";
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@autommerce.com";
  if (!key || !to) return Response.json({ error: "not_configured" }, { status: 503 });

  const rows = [
    ["Topic", topic],
    ["Name", name],
    ["Email", email],
    ["Store", store || "—"],
    ["Platform", platform || "—"],
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((a) => a.trim()),
      reply_to: email,
      subject: `[Persona contact] ${topic} — ${name}`,
      text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${message}`,
      html: `<table>${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${escape(v)}</td></tr>`).join("")}</table><p style="white-space:pre-wrap">${escape(message)}</p>`,
    }),
  });

  if (!res.ok) {
    console.error("[contact] resend failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "send_failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
