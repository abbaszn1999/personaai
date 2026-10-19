/**
 * Booking a demo: the lead and the time slot both go to the shared contact API (the same one the
 * Autommerce site uses), which emails the team, owns the Google Calendar and sends the invite.
 * Nothing here talks to Google. This file is plain TypeScript with no React so the time-zone and
 * calendar rules can be tested on their own.
 */

import { MESSAGE_MAX, platforms } from "./contact";

export const CONTACT_API_URL = (
  process.env.NEXT_PUBLIC_CONTACT_API_URL ?? "https://autommerce-contact-api.onrender.com"
).replace(/\/+$/, "");

export const FALLBACK_EMAIL = "info@autommerce.com";

export type PlatformLabel = (typeof platforms)[number];
export type PlatformValue = "shopify" | "woocommerce" | "other";

const PLATFORM_VALUES: Record<PlatformLabel, PlatformValue> = {
  Shopify: "shopify",
  WooCommerce: "woocommerce",
  Other: "other",
};

/** What `/api/contact` and `/api/book` both receive. */
export interface LeadPayload {
  site: "persona";
  name: string;
  email: string;
  storeUrl: string;
  platform: PlatformValue;
  message: string;
}

export interface LeadFields {
  name: string;
  email: string;
  store: string;
  platform: string;
  message: string;
}

export type LeadErrors = Partial<Record<"name" | "email" | "message", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name, a real-looking email and a message are required; the store URL is optional. */
export function validateLead(fields: LeadFields): LeadErrors {
  const errors: LeadErrors = {};
  if (!fields.name.trim()) errors.name = "Enter your name.";
  if (!EMAIL_PATTERN.test(fields.email.trim())) errors.email = "Enter a valid work email.";
  const message = fields.message.trim();
  if (message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
  else if (message.length > MESSAGE_MAX) errors.message = `Keep it under ${MESSAGE_MAX} characters.`;
  return errors;
}

export function buildPayload(fields: LeadFields): LeadPayload {
  const platform = PLATFORM_VALUES[fields.platform as PlatformLabel] ?? "other";
  return {
    site: "persona",
    name: fields.name.trim(),
    email: fields.email.trim(),
    storeUrl: fields.store.trim(),
    platform,
    message: fields.message.trim(),
  };
}

/* ------------------------------------------------------------------ time zones ---- */

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "Berlin (GMT+2)" — the visitor's city and current offset. */
export function zoneLabel(zone: string, at: Date = new Date()): string {
  const city = zone.split("/").pop()?.replace(/_/g, " ") || zone;
  let offset = "";
  try {
    offset =
      new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    offset = "";
  }
  return offset ? `${city} (${offset})` : city;
}

/** "2026-10-21" — the calendar day an instant falls on in `zone`. */
export function dayKey(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDayLong(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDayShort(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

/** Slots grouped by the visitor's own calendar day, so a slot that is already "tomorrow" for
 *  them is listed under tomorrow. Days and the times within each are in ascending order. */
export function groupSlotsByDay(slots: readonly string[], zone: string): Map<string, string[]> {
  const sorted = [...new Set(slots)].filter((s) => !Number.isNaN(Date.parse(s))).sort((a, b) => Date.parse(a) - Date.parse(b));
  const days = new Map<string, string[]>();
  for (const slot of sorted) {
    const key = dayKey(slot, zone);
    const list = days.get(key);
    if (list) list.push(slot);
    else days.set(key, [slot]);
  }
  return days;
}

/* -------------------------------------------------------------------- calendar ---- */

export interface MonthCell {
  key: string;
  day: number;
}

/** A month as rows of seven cells (null for the padding before the 1st and after the last day).
 *  `weekStart` is 0 for Sunday … 6 for Saturday. Pure date arithmetic, so it does not depend
 *  on any time zone. `month` is 1–12. */
export function buildMonth(year: number, month: number, weekStart: number): (MonthCell | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const cells: (MonthCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ key, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (MonthCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** The visitor's first day of the week (0 = Sunday), falling back to Monday where the browser
 *  can't say. */
export function localWeekStart(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay;
    if (typeof firstDay === "number") return firstDay % 7;
  } catch {
    /* use the fallback */
  }
  return 1;
}

export function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function weekdayLabels(weekStart: number): { short: string; long: string }[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(2023, 0, 1 + ((weekStart + i) % 7)));
    return {
      short: new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "narrow" }).format(date),
      long: new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "long" }).format(date),
    };
  });
}

/** "2026-10-21" -> { year: 2026, month: 10 } */
export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/** The accessible name of a day button, e.g. "Wednesday, October 21, 3 times available". */
export function dayAriaLabel(key: string, count: number): string {
  const { year, month, day } = parseDayKey(key);
  const text = new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return count > 0 ? `${text}, ${count} ${count === 1 ? "time" : "times"} available` : `${text}, no times available`;
}

/* ------------------------------------------------------------------------ API ---- */

export interface SlotsResponse {
  timezone: string;
  durationMin: number;
  slots: string[];
}

export type SlotsResult = { ok: true; data: SlotsResponse } | { ok: false };

/** Loads the open times. The API sleeps on a free plan and the first call after a quiet spell
 *  can take a minute, so this has no timeout of its own; only the caller may abort it. */
export async function fetchSlots(signal?: AbortSignal): Promise<SlotsResult> {
  try {
    const res = await fetch(`${CONTACT_API_URL}/api/slots`, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as Partial<SlotsResponse>;
    if (!Array.isArray(body.slots)) return { ok: false };
    const slots = body.slots.filter((s): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s)));
    if (slots.length === 0) return { ok: false };
    return {
      ok: true,
      data: {
        timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
        durationMin: typeof body.durationMin === "number" ? body.durationMin : 45,
        slots,
      },
    };
  } catch {
    return { ok: false };
  }
}

async function postJson(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** Sends the lead to the team. The shared API is tried first; if it can't be reached (it is
 *  asleep, or not yet allowing this site) the site's own mail route sends the same details, so
 *  a lead is only lost when both fail. */
export async function sendLead(
  payload: LeadPayload,
  honeypot = "",
): Promise<{ ok: true; via: "shared" | "local" } | { ok: false; code?: string }> {
  const shared = await postJson(`${CONTACT_API_URL}/api/contact`, payload);
  if (shared?.ok) return { ok: true, via: "shared" };
  // A rejected request (bad details, too many messages) would be rejected again by the local
  // route; only an unreachable or failing service is worth the second attempt.
  if (shared && (shared.status === 400 || shared.status === 429)) {
    return { ok: false, code: shared.status === 429 ? "rate_limited" : "invalid" };
  }

  const local = await postJson("/api/contact", {
    name: payload.name,
    email: payload.email,
    store: payload.storeUrl,
    platform: PLATFORM_LABELS[payload.platform],
    message: payload.message,
    website: honeypot,
  });
  if (local?.ok) return { ok: true, via: "local" };
  return { ok: false, code: local?.status === 429 ? "rate_limited" : undefined };
}

const PLATFORM_LABELS: Record<PlatformValue, PlatformLabel> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  other: "Other",
};

export type BookResult =
  | { kind: "booked"; start: string; end: string | null; meetLink: string | null }
  | { kind: "already_booked"; existingStart: string | null }
  | { kind: "slot_unavailable" }
  | { kind: "error"; status: number | null };

export async function bookSlot(payload: LeadPayload, start: string, timeZone: string): Promise<BookResult> {
  const res = await postJson(`${CONTACT_API_URL}/api/book`, { ...payload, start, timeZone });
  if (!res) return { kind: "error", status: null };
  const body = (await res.json().catch(() => ({}))) as {
    code?: string;
    start?: string;
    end?: string;
    meetLink?: string;
    existingStart?: string;
  };
  if (res.ok) {
    return {
      kind: "booked",
      start: typeof body.start === "string" ? body.start : start,
      end: typeof body.end === "string" ? body.end : null,
      meetLink: typeof body.meetLink === "string" && body.meetLink ? body.meetLink : null,
    };
  }
  if (res.status === 409 && body.code === "already_booked") {
    return { kind: "already_booked", existingStart: typeof body.existingStart === "string" ? body.existingStart : null };
  }
  if (res.status === 409 && body.code === "slot_unavailable") return { kind: "slot_unavailable" };
  return { kind: "error", status: res.status };
}
