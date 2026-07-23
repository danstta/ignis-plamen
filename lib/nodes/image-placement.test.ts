import { describe, expect, test } from "bun:test";
import { isPlaceholderImageValue } from "@/lib/editor/types";
import {
  DEFAULT_PLACEMENT,
  hasCustomPlacement,
  placementToPlaceholderValue,
} from "./image-placement";

describe("hasCustomPlacement", () => {
  test("the default frame is not custom", () => {
    expect(hasCustomPlacement(DEFAULT_PLACEMENT)).toBe(false);
    expect(
      hasCustomPlacement({ objectPosition: "center center", scale: 1 }),
    ).toBe(false);
  });

  test("a moved or zoomed frame is custom", () => {
    expect(
      hasCustomPlacement({ objectPosition: "left top", scale: 1 }),
    ).toBe(true);
    expect(
      hasCustomPlacement({ objectPosition: "center center", scale: 1.5 }),
    ).toBe(true);
  });
});

describe("placementToPlaceholderValue", () => {
  test("collapses an untouched frame to a bare URL string", () => {
    expect(
      placementToPlaceholderValue("https://img/1.jpg", DEFAULT_PLACEMENT),
    ).toBe("https://img/1.jpg");
  });

  test("carries the crop as a PlaceholderImageValue once framed", () => {
    const value = placementToPlaceholderValue("https://img/1.jpg", {
      objectPosition: "left top",
      scale: 1.5,
    });
    expect(isPlaceholderImageValue(value)).toBe(true);
    expect(value).toEqual({
      url: "https://img/1.jpg",
      objectPosition: "left top",
      scale: 1.5,
    });
  });

  test("an empty URL is always the empty string", () => {
    expect(placementToPlaceholderValue("", DEFAULT_PLACEMENT)).toBe("");
    expect(
      placementToPlaceholderValue("", { objectPosition: "left top", scale: 2 }),
    ).toBe("");
  });
});
