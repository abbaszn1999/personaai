import { describe, expect, it } from "vitest";
import {
  buildMonth,
  buildPayload,
  dayAriaLabel,
  dayKey,
  formatTime,
  groupSlotsByDay,
  validateLead,
  zoneLabel,
} from "./booking";

// Slots come from the API as UTC instants, exactly like these.
const SLOTS = [
  "2026-10-21T10:00:00.000Z",
  "2026-10-21T11:00:00.000Z",
  "2026-10-21T15:00:00.000Z",
  "2026-10-21T21:30:00.000Z",
  "2026-10-22T08:00:00.000Z",
];

describe("slots in the visitor's time zone", () => {
  it("shows the same instant as the right local time in each zone (October 2026)", () => {
    // Beirut is UTC+3 until 25 Oct; Los Angeles is UTC-7 (PDT); Tokyo is UTC+9 all year.
    expect(formatTime(SLOTS[0], "Asia/Beirut")).toBe("1:00 PM");
    expect(formatTime(SLOTS[0], "America/Los_Angeles")).toBe("3:00 AM");
    expect(formatTime(SLOTS[0], "Asia/Tokyo")).toBe("7:00 PM");
  });

  it("groups by the visitor's own date: a late slot is already 'tomorrow' in Tokyo", () => {
    const beirut = groupSlotsByDay(SLOTS, "Asia/Beirut");
    // 21:30Z is 00:30 on the 22nd in Beirut.
    expect(beirut.get("2026-10-21")).toEqual(SLOTS.slice(0, 3));
    expect(beirut.get("2026-10-22")).toEqual([SLOTS[3], SLOTS[4]]);

    const tokyo = groupSlotsByDay(SLOTS, "Asia/Tokyo");
    // 15:00Z is 00:00 on the 22nd in Tokyo, and 21:30Z is 06:30 on the 22nd.
    expect(tokyo.get("2026-10-21")).toEqual(SLOTS.slice(0, 2));
    expect(tokyo.get("2026-10-22")).toEqual(SLOTS.slice(2));
  });

  it("puts early slots on the previous day in Los Angeles", () => {
    const la = groupSlotsByDay(SLOTS, "America/Los_Angeles");
    // 10:00Z is 03:00 PDT on the 21st; 08:00Z on the 22nd is 01:00 PDT on the 22nd.
    expect([...la.keys()]).toEqual(["2026-10-21", "2026-10-22"]);
    expect(la.get("2026-10-21")).toEqual(SLOTS.slice(0, 4));
    expect(la.get("2026-10-22")).toEqual([SLOTS[4]]);
  });

  it("keeps the exact ISO strings and sorts days and times", () => {
    const grouped = groupSlotsByDay([SLOTS[4], SLOTS[0], SLOTS[0], SLOTS[2]], "UTC");
    expect([...grouped.values()].flat()).toEqual([SLOTS[0], SLOTS[2], SLOTS[4]]);
  });

  it("drops anything that is not a date", () => {
    expect([...groupSlotsByDay(["nope", SLOTS[0]], "UTC").values()].flat()).toEqual([SLOTS[0]]);
  });

  it("names the day an instant falls on", () => {
    expect(dayKey(SLOTS[3], "Asia/Tokyo")).toBe("2026-10-22");
    expect(dayKey(SLOTS[3], "America/Los_Angeles")).toBe("2026-10-21");
  });

  it("labels the zone with a city and its offset", () => {
    const at = new Date("2026-10-21T10:00:00Z");
    expect(zoneLabel("Europe/Berlin", at)).toBe("Berlin (GMT+2)");
    expect(zoneLabel("America/Los_Angeles", at)).toBe("Los Angeles (GMT-7)");
    expect(zoneLabel("Asia/Tokyo", at)).toBe("Tokyo (GMT+9)");
    expect(zoneLabel("America/Argentina/Buenos_Aires", at)).toContain("Buenos Aires");
  });
});

describe("month calendar", () => {
  it("pads to whole weeks and starts the month on the right weekday", () => {
    // 1 October 2026 is a Thursday.
    const sunday = buildMonth(2026, 10, 0);
    expect(sunday[0].findIndex((c) => c?.day === 1)).toBe(4);
    const monday = buildMonth(2026, 10, 1);
    expect(monday[0].findIndex((c) => c?.day === 1)).toBe(3);
    for (const rows of [sunday, monday]) {
      expect(rows.every((row) => row.length === 7)).toBe(true);
      expect(rows.flat().filter(Boolean)).toHaveLength(31);
    }
  });

  it("gives every day a YYYY-MM-DD key", () => {
    const cells = buildMonth(2026, 2, 1).flat().filter(Boolean);
    expect(cells).toHaveLength(28);
    expect(cells[0]?.key).toBe("2026-02-01");
    expect(cells[27]?.key).toBe("2026-02-28");
  });

  it("describes a day for assistive tech", () => {
    expect(dayAriaLabel("2026-10-21", 3)).toBe("Wednesday, October 21, 3 times available");
    expect(dayAriaLabel("2026-10-21", 1)).toBe("Wednesday, October 21, 1 time available");
    expect(dayAriaLabel("2026-10-23", 0)).toBe("Friday, October 23, no times available");
  });
});

describe("the lead", () => {
  const good = { name: " Sara Haddad ", email: " sara@store.com ", store: " store.com ", platform: "WooCommerce", message: " Hello, we sell dresses. " };

  it("builds the exact payload both endpoints expect", () => {
    expect(buildPayload(good)).toEqual({
      site: "persona",
      name: "Sara Haddad",
      email: "sara@store.com",
      storeUrl: "store.com",
      platform: "woocommerce",
      message: "Hello, we sell dresses.",
    });
    expect(buildPayload({ ...good, store: "", platform: "Shopify" })).toMatchObject({ storeUrl: "", platform: "shopify" });
    expect(buildPayload({ ...good, platform: "Other" }).platform).toBe("other");
  });

  it("requires a name, a valid email and a message; the store URL is optional", () => {
    expect(validateLead(good)).toEqual({});
    expect(validateLead({ ...good, store: "" })).toEqual({});
    expect(Object.keys(validateLead({ ...good, name: "  " }))).toEqual(["name"]);
    expect(Object.keys(validateLead({ ...good, email: "sara@" }))).toEqual(["email"]);
    expect(Object.keys(validateLead({ ...good, message: "short" }))).toEqual(["message"]);
    expect(Object.keys(validateLead({ ...good, message: "x".repeat(2001) }))).toEqual(["message"]);
  });
});
