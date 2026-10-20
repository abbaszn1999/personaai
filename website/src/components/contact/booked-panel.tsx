"use client";

import { FALLBACK_EMAIL, formatDayLong, formatTime, zoneLabel } from "@/lib/booking";
import { cn } from "@/lib/cn";

export type BookedInfo =
  | { kind: "booked"; start: string; end: string | null; meetLink: string | null; zone: string }
  | { kind: "already_booked"; start: string | null; zone: string };

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function Check() {
  return (
    <span data-check-wrap className="grid h-16 w-16 place-items-center rounded-full bg-[image:var(--grad-brand)]">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path data-check d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" strokeDashoffset="0" />
      </svg>
    </span>
  );
}

/** The last screen of the flow: the demo is booked, or this person already has one. */
export function BookedPanel({ info, email }: { info: BookedInfo; email: string }) {
  const when = info.start
    ? `${formatDayLong(info.start, info.zone)} · ${formatTime(info.start, info.zone)}${
        info.kind === "booked" && info.end ? ` – ${formatTime(info.end, info.zone)}` : ""
      }`
    : null;

  return (
    <div data-success className="flex min-h-[34rem] flex-col items-start justify-center">
      <Check />
      <h2 data-success-line className="mt-8 font-display text-4xl font-semibold tracking-[-0.04em] text-bone">
        {info.kind === "booked" ? "You’re booked." : "You’re already booked."}
      </h2>

      {when ? (
        <div data-success-line className="mt-6 rounded-2xl border border-hairline bg-[var(--surface-input)] px-5 py-4">
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-bone">{when}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Your time zone · {zoneLabel(info.zone, info.start ? new Date(info.start) : undefined)}
          </p>
        </div>
      ) : null}

      <p data-success-line className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
        {info.kind === "booked" ? (
          <>
            The Google Calendar invite is on its way to <span className="text-bone">{email}</span>. It has the link to
            join.
          </>
        ) : (
          <>
            You can only hold one upcoming demo, so we haven’t booked a second. The invite was sent to{" "}
            <span className="text-bone">{email}</span>. To change the time, email{" "}
            <a className="text-bone underline underline-offset-2" href={`mailto:${FALLBACK_EMAIL}`}>
              {FALLBACK_EMAIL}
            </a>
            .
          </>
        )}
      </p>

      {info.kind === "booked" && info.meetLink ? (
        <a
          data-success-line
          href={info.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "mt-8 inline-flex items-center gap-3 rounded-full bg-[image:var(--grad-brand)] px-7 py-3.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110",
            focusRing,
          )}
        >
          Meet link <span aria-hidden>↗</span>
        </a>
      ) : null}
    </div>
  );
}
