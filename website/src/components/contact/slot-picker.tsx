"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_EMAIL,
  bookSlot,
  browserZone,
  buildMonth,
  dayAriaLabel,
  fetchSlots,
  formatDayShort,
  formatTime,
  groupSlotsByDay,
  localWeekStart,
  monthTitle,
  parseDayKey,
  weekdayLabels,
  zoneLabel,
  type LeadPayload,
  type SlotsResponse,
} from "@/lib/booking";
import { cn } from "@/lib/cn";
import type { BookedInfo } from "@/components/contact/booked-panel";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type Notice = { tone: "error" | "info"; text: string; mail?: boolean };

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-6 rounded-2xl border px-4 py-3 text-sm",
        notice.tone === "error"
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : "border-brand/30 bg-brand/10 text-bone",
      )}
    >
      {notice.text}
      {notice.mail ? (
        <>
          {" "}
          Email us at{" "}
          <a className="underline underline-offset-2" href={`mailto:${FALLBACK_EMAIL}`}>
            {FALLBACK_EMAIL}
          </a>
          .
        </>
      ) : null}
    </p>
  );
}

interface SlotPickerProps {
  payload: LeadPayload;
  /** Back to the form with everything still filled in. */
  onBack: () => void;
  onBooked: (info: BookedInfo) => void;
  /** The times couldn't be loaded: the lead has still been sent, so the page says we'll reply. */
  onUnavailable: () => void;
  /** The signed pass the shared API gave back with the lead; booking sends it instead of a
   *  second bot check. */
  bookingPass: string | null;
  /** The pass was refused as expired: the form must send the details again for a new one. */
  onExpired: () => void;
}

export function SlotPicker({ payload, bookingPass, onBack, onBooked, onUnavailable, onExpired }: SlotPickerProps) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [reloads, setReloads] = useState(0);
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const zone = useMemo(() => browserZone(), []);
  const weekStart = useMemo(() => localWeekStart(), []);
  const weekdays = useMemo(() => weekdayLabels(weekStart), [weekStart]);

  // Loaded again whenever `reloads` changes (after a slot was taken).
  useEffect(() => {
    const controller = new AbortController();
    void fetchSlots(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        onUnavailable();
        return;
      }
      setData(result.data);
    });
    return () => controller.abort();
  }, [reloads, onUnavailable]);

  const days = useMemo(() => (data ? groupSlotsByDay(data.slots, zone) : new Map<string, string[]>()), [data, zone]);
  const dayKeys = useMemo(() => [...days.keys()], [days]);

  // The first day with a time is open from the start, so the times are already on screen.
  const firstDay = dayKeys[0] ?? null;
  const lastDay = dayKeys[dayKeys.length - 1] ?? null;
  const activeDay = day && days.has(day) ? day : firstDay;
  const activeView = view ?? (firstDay ? { year: parseDayKey(firstDay).year, month: parseDayKey(firstDay).month } : null);

  const times = activeDay ? (days.get(activeDay) ?? []) : [];
  const chosen = slot && times.includes(slot) ? slot : null;

  /** Fetches the times again from scratch (after one was taken): back to the loading screen. */
  function reload() {
    setData(null);
    setView(null);
    setDay(null);
    setSlot(null);
    setReloads((n) => n + 1);
  }

  async function confirm() {
    if (!chosen || booking) return;
    setBooking(true);
    setNotice(null);
    const result = await bookSlot(payload, chosen, zone, bookingPass);
    setBooking(false);

    if (result.kind === "booked") {
      onBooked({ kind: "booked", start: result.start, end: result.end, meetLink: result.meetLink, zone });
    } else if (result.kind === "already_booked") {
      onBooked({ kind: "already_booked", start: result.existingStart, zone });
    } else if (result.kind === "slot_unavailable") {
      setNotice({ tone: "info", text: "That time was just taken. Please choose another." });
      reload();
    } else if (result.kind === "verification_expired") {
      onExpired();
      setNotice({
        tone: "error",
        text: "Your verification expired. Use “Edit my details” above, then continue again to get a new one.",
        mail: false,
      });
    } else {
      setNotice({
        tone: "error",
        text:
          result.status === 429
            ? "Too many attempts in a short time. Please try again in a few minutes."
            : "We couldn't book that time right now.",
        mail: true,
      });
    }
  }

  if (!data) {
    return (
      <div className="flex min-h-[28rem] flex-col items-start justify-center">
        <div role="status" aria-live="polite">
          <span className="block h-9 w-9 animate-spin rounded-full border-2 border-hairline border-t-brand" />
          <p className="mt-6 font-display text-2xl font-semibold tracking-[-0.03em] text-bone">Finding open times…</p>
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-muted">
            Your details are with us. The first look at the calendar can take up to a minute, so please stay on this
            page.
          </p>
        </div>
        {notice ? <NoticeBox notice={notice} /> : null}
      </div>
    );
  }

  const prevDisabled =
    !activeView || !firstDay || activeView.year * 12 + activeView.month <= parseDayKey(firstDay).year * 12 + parseDayKey(firstDay).month;
  const nextDisabled =
    !activeView || !lastDay || activeView.year * 12 + activeView.month >= parseDayKey(lastDay).year * 12 + parseDayKey(lastDay).month;

  function shiftMonth(delta: number) {
    if (!activeView) return;
    const index = activeView.year * 12 + (activeView.month - 1) + delta;
    setView({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  }

  const rows = activeView ? buildMonth(activeView.year, activeView.month, weekStart) : [];
  const stepBase =
    "rounded-full border border-hairline px-3.5 py-2 text-[13px] text-muted transition hover:border-bone/40 hover:text-bone disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-hairline disabled:hover:text-muted";

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        disabled={booking}
        className={cn(
          "inline-flex items-center gap-2 rounded-full text-[13px] text-muted transition hover:text-bone disabled:opacity-50",
          focusRing,
        )}
      >
        <span aria-hidden>←</span> Edit my details
      </button>

      <h2 className="mt-6 font-display text-3xl font-semibold tracking-[-0.04em] text-bone min-[700px]:text-4xl">
        Pick a time
      </h2>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted">
        Thanks, {payload.name.split(" ")[0]}. We have your details. Choose a time for a {data?.durationMin ?? 45}-minute
        demo.
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        Times shown in your time zone · {zoneLabel(zone)}
      </p>

      <div className="mt-7 grid gap-8 min-[700px]:grid-cols-[1.15fr_1fr]">
        {/* Month calendar */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="font-display text-lg font-semibold tracking-[-0.02em] text-bone">
              {activeView ? monthTitle(activeView.year, activeView.month) : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={prevDisabled || booking}
                onClick={() => shiftMonth(-1)}
                className={cn(stepBase, focusRing)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next month"
                disabled={nextDisabled || booking}
                onClick={() => shiftMonth(1)}
                className={cn(stepBase, focusRing)}
              >
                →
              </button>
            </div>
          </div>

          <div aria-hidden className="mt-4 grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-faint">
            {weekdays.map((weekday, i) => (
              <span key={`${weekday.long}-${i}`}>{weekday.short}</span>
            ))}
          </div>

          <div
            role="group"
            aria-label={activeView ? `Days in ${monthTitle(activeView.year, activeView.month)}` : "Days"}
            className="mt-2 grid gap-1"
          >
            {rows.map((row, r) => (
              <div key={r} className="grid grid-cols-7 gap-1">
                {row.map((cell, c) => {
                  if (!cell) return <span key={c} aria-hidden className="aspect-square" />;
                  const count = days.get(cell.key)?.length ?? 0;
                  const selected = cell.key === activeDay;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={count === 0 || booking}
                      aria-label={dayAriaLabel(cell.key, count)}
                      aria-pressed={selected}
                      onClick={() => {
                        setDay(cell.key);
                        setSlot(null);
                        setNotice(null);
                      }}
                      className={cn(
                        "aspect-square rounded-xl border text-[14px] font-medium tabular-nums transition",
                        focusRing,
                        count === 0
                          ? "cursor-not-allowed border-transparent text-faint/40 line-through decoration-faint/30"
                          : selected
                            ? "border-brand bg-brand text-white shadow-[0_0_0_3px_rgba(247,109,1,0.18)]"
                            : "border-hairline bg-[var(--surface-input)] text-bone hover:border-brand/50",
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Times for the chosen day */}
        <div>
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-bone">
            {times[0] ? formatDayShort(times[0], zone) : "No times"}
          </p>
          <div
            role="group"
            aria-label={times[0] ? `Times on ${formatDayShort(times[0], zone)}` : "Times"}
            className="mt-4 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1"
          >
            {times.map((iso) => {
              const selected = iso === chosen;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={booking}
                  aria-pressed={selected}
                  onClick={() => {
                    setSlot(iso);
                    setNotice(null);
                  }}
                  className={cn(
                    "min-h-[48px] rounded-2xl border px-3 text-[14px] font-medium tabular-nums transition",
                    focusRing,
                    selected
                      ? "border-brand bg-brand/10 text-bone shadow-[0_0_0_3px_rgba(247,109,1,0.12)]"
                      : "border-hairline bg-[var(--surface-input)] text-muted hover:border-brand/40 hover:text-bone",
                  )}
                >
                  {formatTime(iso, zone)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {notice ? <NoticeBox notice={notice} /> : null}

      <button
        type="button"
        onClick={confirm}
        disabled={!chosen || booking}
        className={cn(
          "group relative mt-7 inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-[image:var(--grad-brand)] px-8 py-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100",
          focusRing,
        )}
      >
        {booking ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Booking…
          </>
        ) : chosen ? (
          <>
            Confirm {formatDayShort(chosen, zone)} · {formatTime(chosen, zone)}
          </>
        ) : (
          "Choose a time"
        )}
      </button>
    </div>
  );
}
