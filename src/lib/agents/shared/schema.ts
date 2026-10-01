/** JSON-schema fragments the agents' response schemas share. */

export const NULLABLE_NUMBER = { type: ["number", "null"] } as const;

export const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

export const ATTRIBUTE_CONSTRAINTS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      key: { type: "string" },
      values: STRING_ARRAY,
    },
    required: ["key", "values"],
  },
} as const;
