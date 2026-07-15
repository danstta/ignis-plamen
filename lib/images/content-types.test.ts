import { describe, expect, test } from "bun:test";
import {
  isHeicContentType,
  isImageContentType,
  normalizeImageContentType,
} from "./content-types";

/**
 * Characterization tests for content-type normalization — the first gate every
 * uploaded/fetched image passes through before HEIC detection and conversion.
 */

describe("normalizeImageContentType", () => {
  test("strips parameters and lowercases", () => {
    expect(normalizeImageContentType("IMAGE/JPEG; charset=x")).toBe(
      "image/jpeg",
    );
    expect(normalizeImageContentType("image/png;")).toBe("image/png");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeImageContentType("  image/webp  ")).toBe("image/webp");
  });

  test("null/undefined normalize to empty string", () => {
    expect(normalizeImageContentType(null)).toBe("");
    expect(normalizeImageContentType(undefined)).toBe("");
    expect(normalizeImageContentType("")).toBe("");
  });
});

describe("isImageContentType", () => {
  test("true only for image/* types", () => {
    expect(isImageContentType("image/jpeg")).toBe(true);
    expect(isImageContentType("IMAGE/HEIC; foo=bar")).toBe(true);
    expect(isImageContentType("application/octet-stream")).toBe(false);
    expect(isImageContentType(null)).toBe(false);
  });
});

describe("isHeicContentType", () => {
  const heicTypes = [
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
  ];
  for (const t of heicTypes) {
    test(`${t} is HEIC`, () => {
      expect(isHeicContentType(t)).toBe(true);
      expect(isHeicContentType(t.toUpperCase())).toBe(true);
    });
  }

  test("non-HEIC image types are not HEIC", () => {
    expect(isHeicContentType("image/jpeg")).toBe(false);
    expect(isHeicContentType("image/avif")).toBe(false);
    expect(isHeicContentType(null)).toBe(false);
  });
});
