import { describe, expect, test } from "bun:test";
import {
  evaluateCondition,
  isUnaryOp,
  type BranchCondition,
} from "./conditions";

/**
 * Characterization tests for router branch conditions. Operands arrive already
 * token-resolved (an unresolved token becomes ""), so the empty/whitespace
 * semantics here are what decide whether a branch fires on missing data.
 */

const cases: { c: BranchCondition; expected: boolean }[] = [
  // eq / ne — plain string comparison, no numeric coercion.
  { c: { left: "a", op: "eq", right: "a" }, expected: true },
  { c: { left: "a", op: "eq", right: "b" }, expected: false },
  { c: { left: "1", op: "eq", right: "1.0" }, expected: false },
  { c: { left: "a", op: "ne", right: "b" }, expected: true },
  { c: { left: "a", op: "ne", right: "a" }, expected: false },

  // contains — substring; every string contains "".
  { c: { left: "hello world", op: "contains", right: "world" }, expected: true },
  { c: { left: "hello", op: "contains", right: "z" }, expected: false },
  { c: { left: "abc", op: "contains", right: "" }, expected: true },
  { c: { left: "", op: "contains", right: "" }, expected: true },

  // gt / lt — false unless BOTH sides parse as finite floats.
  { c: { left: "2", op: "gt", right: "1" }, expected: true },
  { c: { left: "1", op: "gt", right: "2" }, expected: false },
  { c: { left: "1", op: "gt", right: "1" }, expected: false },
  { c: { left: "abc", op: "gt", right: "1" }, expected: false },
  { c: { left: "2", op: "gt", right: "xyz" }, expected: false },
  { c: { left: "", op: "gt", right: "1" }, expected: false },
  { c: { left: "1", op: "lt", right: "2" }, expected: true },
  { c: { left: "2", op: "lt", right: "1" }, expected: false },
  { c: { left: "abc", op: "lt", right: "2" }, expected: false },
  { c: { left: "1.5", op: "lt", right: "1.75" }, expected: true },
  // NOTE: current behavior — parseFloat accepts a numeric prefix, so "2px" > "1".
  { c: { left: "2px", op: "gt", right: "1" }, expected: true },

  // exists / empty — whitespace-only counts as empty.
  { c: { left: "x", op: "exists", right: "" }, expected: true },
  { c: { left: "", op: "exists", right: "" }, expected: false },
  { c: { left: "   ", op: "exists", right: "" }, expected: false },
  { c: { left: "", op: "empty", right: "" }, expected: true },
  { c: { left: " \t ", op: "empty", right: "" }, expected: true },
  { c: { left: "x", op: "empty", right: "" }, expected: false },
];

describe("evaluateCondition", () => {
  for (const { c, expected } of cases) {
    test(`${JSON.stringify(c.left)} ${c.op} ${JSON.stringify(c.right)} -> ${expected}`, () => {
      expect(evaluateCondition(c)).toBe(expected);
    });
  }

  test("null-ish operands are treated as empty strings", () => {
    expect(
      evaluateCondition({
        left: null as unknown as string,
        op: "empty",
        right: null as unknown as string,
      }),
    ).toBe(true);
    expect(
      evaluateCondition({
        left: null as unknown as string,
        op: "eq",
        right: "",
      }),
    ).toBe(true);
  });
});

describe("isUnaryOp", () => {
  test("only exists and empty are unary", () => {
    expect(isUnaryOp("exists")).toBe(true);
    expect(isUnaryOp("empty")).toBe(true);
    expect(isUnaryOp("eq")).toBe(false);
    expect(isUnaryOp("gt")).toBe(false);
  });
});
