import { describe, expect, test } from "bun:test";
import {
  flattenSample,
  referencedNodeIds,
  resolvePathMatches,
  resolveReferences,
  toStructuralPath,
  validateLockedPaths,
  valueToText,
} from "./references";

/**
 * Characterization tests pinning down `{{token}}` reference resolution — the
 * contract between the editor's token picker and the engine's runtime lookup.
 * These assert *current* behavior so engine refactors have a regression gate.
 */

const outputs = {
  node1: {
    name: "Ada",
    count: 3,
    tags: ["a", "b"],
    nested: { deep: { flag: true } },
    items: [{ url: "https://x/1" }, { url: "https://x/2" }],
    single: [{ url: "https://only/1" }],
  },
};

const trigger = {
  body: { x: "from-trigger", n: 42 },
  headers: { "content-type": "application/json" },
};

describe("resolveReferences", () => {
  // The declared signature is (value: T) => T, but an exact-token string
  // resolves to the raw upstream value of any type — widen so assertions can
  // state the actual runtime type.
  const resolve = (value: unknown, trig: Record<string, unknown> = {}) =>
    resolveReferences<unknown>(value, outputs, trig);

  test("exact token preserves the raw value's type", () => {
    expect(resolve("{{node1.count}}")).toBe(3);
    expect(resolve("{{node1.tags}}")).toEqual(["a", "b"]);
    expect(resolve("{{node1.nested.deep.flag}}")).toBe(true);
  });

  test("embedded token interpolates to text", () => {
    expect(resolve("Hello {{node1.name}}!")).toBe("Hello Ada!");
    expect(resolve("{{node1.name}} has {{node1.count}} tags")).toBe(
      "Ada has 3 tags",
    );
  });

  test("unresolvable exact token resolves to undefined", () => {
    expect(resolve("{{missing.path}}")).toBeUndefined();
    expect(resolve("{{node1.no.such}}")).toBeUndefined();
  });

  test("unresolvable embedded token interpolates as empty string", () => {
    expect(resolve("x={{missing.path}}!")).toBe("x=!");
  });

  test("trigger tokens resolve against the trigger argument", () => {
    expect(resolve("{{trigger.body.x}}", trigger)).toBe("from-trigger");
    expect(resolve("n is {{trigger.body.n}}", trigger)).toBe("n is 42");
  });

  test("resolves deeply inside nested objects and arrays", () => {
    const config: unknown = {
      title: "{{node1.name}}",
      list: ["{{node1.count}}", { inner: "hi {{node1.name}}" }],
      keep: { untouched: "plain" },
    };
    expect(resolve(config)).toEqual({
      title: "Ada",
      list: [3, { inner: "hi Ada" }],
      keep: { untouched: "plain" },
    });
  });

  test("non-string leaves pass through unchanged", () => {
    expect(resolve(7)).toBe(7);
    expect(resolve(false)).toBe(false);
    expect(resolve(null)).toBeNull();
  });

  test("wildcard path: single match yields the value itself", () => {
    expect(resolve("{{node1.single.*.url}}")).toBe("https://only/1");
  });

  test("wildcard path: multiple matches yield an array", () => {
    expect(resolve("{{node1.items.*.url}}")).toEqual([
      "https://x/1",
      "https://x/2",
    ]);
  });

  test("wildcard path with zero matches resolves to undefined", () => {
    expect(resolve("{{node1.items.*.missing}}")).toBeUndefined();
  });

  test("whitespace inside token braces is tolerated", () => {
    expect(resolve("{{ node1.name }}")).toBe("Ada");
  });
});

describe("resolvePathMatches", () => {
  test("wildcard matches array elements", () => {
    expect(
      resolvePathMatches({ items: [{ v: 1 }, { v: 2 }] }, ["items", "*", "v"]),
    ).toEqual([1, 2]);
  });

  test("wildcard matches object values", () => {
    expect(resolvePathMatches({ map: { a: 1, b: 2 } }, ["map", "*"])).toEqual([
      1, 2,
    ]);
  });

  test("explicit null leaf counts as a match", () => {
    expect(resolvePathMatches({ a: null }, ["a"])).toEqual([null]);
  });

  test("missing key (undefined) does not match", () => {
    expect(resolvePathMatches({ a: 1 }, ["b"])).toEqual([]);
    expect(resolvePathMatches({ a: undefined }, ["a"])).toEqual([]);
  });

  test("empty segments list returns the root", () => {
    const root = { a: 1 };
    expect(resolvePathMatches(root, [])).toEqual([root]);
  });

  test("undefined root yields no matches even with empty segments", () => {
    expect(resolvePathMatches(undefined, [])).toEqual([]);
  });
});

describe("validateLockedPaths", () => {
  test("returns exactly the paths that resolve to zero values", () => {
    const payload = {
      body: { email: "a@b.c", items: [{ t: "x" }] },
      headers: {},
      query: {},
    };
    expect(
      validateLockedPaths(payload, [
        "body.email",
        "body.items.*.t",
        "body.missing",
        "body.items.*.nope",
      ]),
    ).toEqual(["body.missing", "body.items.*.nope"]);
  });

  test("empty path list validates clean", () => {
    expect(validateLockedPaths({ body: {} }, [])).toEqual([]);
  });
});

describe("toStructuralPath", () => {
  test("collapses array-index segments to *", () => {
    expect(toStructuralPath("items.0.title")).toBe("items.*.title");
    expect(toStructuralPath("a.12.b.3")).toBe("a.*.b.*");
  });

  test("leaves non-index segments alone", () => {
    expect(toStructuralPath("body.email")).toBe("body.email");
  });
});

describe("flattenSample", () => {
  test("collapses indices and dedupes structural duplicates", () => {
    const flat = flattenSample({
      items: [{ title: "first" }, { title: "second" }],
    });
    expect(flat).toEqual([{ path: "items.*.title", preview: "first" }]);
  });

  test("caps recursion depth at 3", () => {
    const flat = flattenSample({ a: { b: { c: { d: { e: "leaf" } } } } });
    // Depth cap: the level-3 container is emitted as one path with a JSON preview.
    expect(flat).toEqual([{ path: "a.b.c.d", preview: '{"e":"leaf"}' }]);
  });

  test("truncates previews at 40 chars with an ellipsis", () => {
    const long = "x".repeat(50);
    const flat = flattenSample({ k: long });
    expect(flat).toEqual([{ path: "k", preview: `${"x".repeat(40)}…` }]);
  });

  test("null and non-object payloads flatten to nothing", () => {
    expect(flattenSample(null)).toEqual([]);
    expect(flattenSample("just a string")).toEqual([]);
  });
});

describe("valueToText", () => {
  test("null/undefined become empty string", () => {
    expect(valueToText(null)).toBe("");
    expect(valueToText(undefined)).toBe("");
  });

  test("strings pass through; numbers and booleans stringify", () => {
    expect(valueToText("hi")).toBe("hi");
    expect(valueToText(3.5)).toBe("3.5");
    expect(valueToText(false)).toBe("false");
  });

  test("arrays join non-empty parts with a comma", () => {
    expect(valueToText(["a", "", null, "b"])).toBe("a, b");
    expect(valueToText([])).toBe("");
  });

  test("objects JSON-stringify", () => {
    expect(valueToText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("referencedNodeIds", () => {
  test("finds ids in nested configs", () => {
    const ids = referencedNodeIds({
      title: "{{n1.body.x}}",
      list: [{ inner: "{{n2.out}}" }],
    });
    expect([...ids].sort()).toEqual(["n1", "n2"]);
  });

  test("excludes the trigger pseudo-id", () => {
    expect(referencedNodeIds("{{trigger.body.x}}").size).toBe(0);
  });

  test("returns empty set for token-free values", () => {
    expect(referencedNodeIds({ a: 1, b: "plain" }).size).toBe(0);
  });
});
