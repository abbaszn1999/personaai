import { describe, expect, it } from "vitest";
import { readGeminiTokenUsage, toGeminiContents, toToolCalls, type ChatCompletionMessage } from "./gemini-chat";

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return { id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
}

describe("toGeminiContents", () => {
  it("lifts system messages out of the contents array and joins repeats", () => {
    const { systemInstruction, contents } = toGeminiContents([
      { role: "system", content: "first" },
      { role: "system", content: "second" },
      { role: "user", content: "hello" },
    ]);

    expect(systemInstruction).toBe("first\nsecond");
    expect(contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
  });

  it("maps assistant turns to the model role", () => {
    const { contents } = toGeminiContents([{ role: "assistant", content: "hi there" }]);
    expect(contents).toEqual([{ role: "model", parts: [{ text: "hi there" }] }]);
  });

  it("drops assistant turns with neither text nor tool calls", () => {
    const { contents } = toGeminiContents([{ role: "assistant", content: null }]);
    expect(contents).toEqual([]);
  });

  it("echoes the functionCall id back on the matching functionResponse", () => {
    const messages: ChatCompletionMessage[] = [
      { role: "user", content: "find me a jacket" },
      { role: "assistant", content: null, tool_calls: [toolCall("call_abc", "search_catalog", { query: "jacket" })] },
      { role: "tool", tool_call_id: "call_abc", content: "1 result" },
    ];

    const { contents } = toGeminiContents(messages);

    expect(contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "search_catalog", args: { query: "jacket" }, id: "call_abc" } }],
    });
    expect(contents[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "search_catalog", response: { output: "1 result" }, id: "call_abc" } }],
    });
  });

  it("keeps one response per call when the same tool is called twice in a turn", () => {
    // The failure this guards against: keying responses by function name instead of id drops
    // all but one part, and Gemini rejects the turn for a call/response count mismatch.
    const messages: ChatCompletionMessage[] = [
      { role: "user", content: "build me an outfit" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          toolCall("call_1", "search_catalog", { query: "shirt" }),
          toolCall("call_2", "search_catalog", { query: "trousers" }),
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "shirts" },
      { role: "tool", tool_call_id: "call_2", content: "trousers" },
    ];

    const { contents } = toGeminiContents(messages);

    const callParts = contents.filter((c) => c.role === "model").flatMap((c) => c.parts ?? []);
    const responseParts = contents.filter((c) => c.role === "user").flatMap((c) => c.parts ?? []).filter((p) => p.functionResponse);

    expect(callParts).toHaveLength(2);
    expect(responseParts).toHaveLength(2);
    expect(responseParts.map((p) => p.functionResponse?.id)).toEqual(["call_1", "call_2"]);
  });

  it("groups consecutive tool results into a single content rather than one each", () => {
    const messages: ChatCompletionMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [toolCall("call_1", "search_catalog", {}), toolCall("call_2", "try_on", {})],
      },
      { role: "tool", tool_call_id: "call_1", content: "a" },
      { role: "tool", tool_call_id: "call_2", content: "b" },
    ];

    const { contents } = toGeminiContents(messages);

    expect(contents).toHaveLength(2);
    expect(contents[1].parts).toHaveLength(2);
  });

  it("starts a new content when a user message separates two tool results", () => {
    const messages: ChatCompletionMessage[] = [
      { role: "assistant", content: null, tool_calls: [toolCall("call_1", "search_catalog", {})] },
      { role: "tool", tool_call_id: "call_1", content: "a" },
      { role: "user", content: "actually, cheaper" },
      { role: "assistant", content: null, tool_calls: [toolCall("call_2", "search_catalog", {})] },
      { role: "tool", tool_call_id: "call_2", content: "b" },
    ];

    const { contents } = toGeminiContents(messages);

    expect(contents.map((c) => c.role)).toEqual(["model", "user", "user", "model", "user"]);
  });

  it("recovers the function name for a tool result from the call that requested it", () => {
    const { contents } = toGeminiContents([
      { role: "assistant", content: null, tool_calls: [toolCall("call_1", "add_to_cart", {})] },
      { role: "tool", tool_call_id: "call_1", content: "added" },
    ]);

    expect(contents[1].parts?.[0].functionResponse?.name).toBe("add_to_cart");
  });

  it("treats unparseable tool arguments as empty rather than throwing", () => {
    const { contents } = toGeminiContents([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "search_catalog", arguments: "not json" } }],
      },
    ]);

    expect(contents[0].parts?.[0].functionCall?.args).toEqual({});
  });

  it("omits locally synthesised ids, which Gemini never issued and would reject", () => {
    const [call] = toToolCalls([{ functionCall: { name: "search_catalog", args: {} } }]);
    const { contents } = toGeminiContents([
      { role: "assistant", content: null, tool_calls: [call] },
      { role: "tool", tool_call_id: call.id, content: "result" },
    ]);

    expect(contents[0].parts?.[0].functionCall).not.toHaveProperty("id");
    expect(contents[1].parts?.[0].functionResponse).not.toHaveProperty("id");
  });
});

describe("toToolCalls", () => {
  it("preserves distinct ids for parallel calls to the same function", () => {
    const calls = toToolCalls([
      { functionCall: { id: "a", name: "search_catalog", args: { q: 1 } } },
      { functionCall: { id: "b", name: "search_catalog", args: { q: 2 } } },
    ]);

    expect(calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(calls.map((c) => c.function.arguments)).toEqual(['{"q":1}', '{"q":2}']);
  });

  it("serialises missing args to an empty object", () => {
    expect(toToolCalls([{ functionCall: { id: "a", name: "t" } }])[0].function.arguments).toBe("{}");
  });

  it("ignores parts that are not function calls", () => {
    // A tool-calling turn also carries the model's prose and its thought parts.
    const calls = toToolCalls([
      { text: "Let me look." },
      { thought: true, thoughtSignature: "sig-for-a-thought-part" },
      { functionCall: { id: "a", name: "search_catalog", args: {} } },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("a");
  });

  it("reads the thought signature off the part, not the function call", () => {
    const [call] = toToolCalls([
      { functionCall: { id: "a", name: "search_catalog", args: {} }, thoughtSignature: "sig-abc" },
    ]);

    expect(call.thoughtSignature).toBe("sig-abc");
  });
});

/**
 * Gemini 3 rejects a replayed function call whose reasoning signature is missing, and does it on
 * the turn *after* the one that dropped it — so the whole round trip is asserted here rather than
 * just the read side.
 */
describe("thought signature round trip", () => {
  it("echoes the signature back on the replayed functionCall part", () => {
    const calls = toToolCalls([
      { functionCall: { id: "call_1", name: "record_intake_field", args: { field: "budget" } }, thoughtSignature: "sig-1" },
    ]);

    const { contents } = toGeminiContents([
      { role: "user", content: "under $200" },
      { role: "assistant", content: null, tool_calls: calls },
      { role: "tool", tool_call_id: "call_1", content: "ok" },
    ]);

    const modelPart = contents[1].parts?.[0];
    expect(modelPart?.functionCall?.id).toBe("call_1");
    expect(modelPart?.thoughtSignature).toBe("sig-1");
  });

  it("omits the field entirely when the model issued no signature", () => {
    const { contents } = toGeminiContents([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "try_on", arguments: "{}" } }],
      },
    ]);

    expect(contents[0].parts?.[0]).not.toHaveProperty("thoughtSignature");
  });
});

describe("readGeminiTokenUsage", () => {
  it("bills thoughts as output and treats a missing report as zero", () => {
    expect(
      readGeminiTokenUsage({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 })
    ).toEqual({ inputTokens: 100, outputTokens: 25 });
    expect(readGeminiTokenUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
