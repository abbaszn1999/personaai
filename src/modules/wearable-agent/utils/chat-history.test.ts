import { describe, expect, it } from "vitest";
import { MAX_PERSISTED_MESSAGES, MAX_RENDERED_MESSAGES, MAX_SENT_MESSAGES, takeLastMessages } from "./chat-history";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("takeLastMessages", () => {
  it("keeps only the newest messages, in order", () => {
    expect(takeLastMessages(range(10), 3)).toEqual([7, 8, 9]);
  });

  it("returns the same array when it is already within the cap", () => {
    const messages = range(5);
    expect(takeLastMessages(messages, 5)).toBe(messages);
    expect(takeLastMessages(messages, 40)).toBe(messages);
    expect(takeLastMessages([], 40)).toEqual([]);
  });

  it("caps a long chat at each limit", () => {
    const chat = range(250);
    expect(takeLastMessages(chat, MAX_SENT_MESSAGES)).toHaveLength(40);
    expect(takeLastMessages(chat, MAX_SENT_MESSAGES)[0]).toBe(210);
    expect(takeLastMessages(chat, MAX_PERSISTED_MESSAGES)).toHaveLength(100);
    expect(takeLastMessages(chat, MAX_RENDERED_MESSAGES)).toHaveLength(60);
    expect(takeLastMessages(chat, MAX_RENDERED_MESSAGES).at(-1)).toBe(249);
  });
});
