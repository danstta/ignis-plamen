import { describe, expect, test } from "bun:test";
import { sanitizeBlocksForCreate, type TallyBlock } from "./api";

/**
 * `GET /forms/{id}` returns disabled/optional block features as `null`, but
 * since API v0.4.0 `POST /forms` validates payloads against a strict schema
 * and rejects those nulls ("Invalid block structure detected for TEXTAREA").
 * sanitizeBlocksForCreate drops them so a copied form re-posts cleanly.
 */
describe("sanitizeBlocksForCreate", () => {
  test("drops null/undefined payload fields (the TEXTAREA round-trip failure)", () => {
    const block: TallyBlock = {
      uuid: "5a3dc0ec-d08c-4de2-a325-28e45d0463d5",
      type: "TEXTAREA",
      groupUuid: "1c2d3e4f-5061-4728-b394-a5b6c7d8e9f0",
      groupType: "TEXTAREA",
      payload: {
        isRequired: true,
        placeholder: "Enter your message",
        hasMaxCharacters: false,
        maxCharacters: null,
        hasMinCharacters: false,
        minCharacters: null,
        defaultAnswer: null,
        columnRatio: null,
        name: null,
      },
    };

    const [sanitized] = sanitizeBlocksForCreate([block]);

    expect(sanitized.payload).toEqual({
      isRequired: true,
      placeholder: "Enter your message",
      hasMaxCharacters: false,
      hasMinCharacters: false,
    });
  });

  test("keeps falsy-but-valid values (false, 0, empty string)", () => {
    const [sanitized] = sanitizeBlocksForCreate([
      {
        uuid: "a",
        type: "INPUT_TEXT",
        groupUuid: "b",
        groupType: "INPUT_TEXT",
        payload: { isRequired: false, placeholder: "", columnRatio: 0 },
      },
    ]);

    expect(sanitized.payload).toEqual({
      isRequired: false,
      placeholder: "",
      columnRatio: 0,
    });
  });

  test("only strips the payload's own keys, never nested structures", () => {
    // A conditional-logic condition's `value` is required yet null for
    // IS_EMPTY checks — nested nulls must survive.
    const [sanitized] = sanitizeBlocksForCreate([
      {
        uuid: "a",
        type: "CONDITIONAL_LOGIC",
        groupUuid: "b",
        groupType: "CONDITIONAL_LOGIC",
        payload: {
          updateUuid: null,
          logicalOperator: "AND",
          conditionals: [
            { type: "SINGLE", payload: { comparison: "IS_EMPTY", value: null } },
          ],
        },
      },
    ]);

    expect(sanitized.payload).not.toHaveProperty("updateUuid");
    expect(sanitized.payload.conditionals).toEqual([
      { type: "SINGLE", payload: { comparison: "IS_EMPTY", value: null } },
    ]);
  });

  test("returns fresh blocks without mutating the input", () => {
    const block: TallyBlock = {
      uuid: "a",
      type: "TEXTAREA",
      groupUuid: "b",
      groupType: "TEXTAREA",
      payload: { name: null, isRequired: true },
    };

    sanitizeBlocksForCreate([block]);

    expect(block.payload).toHaveProperty("name", null);
  });
});
