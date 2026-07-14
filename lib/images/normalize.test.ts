import { describe, expect, test } from "bun:test";
import { inferImageContentType, isHeicLikeImage } from "./normalize";

/**
 * Characterization tests for the pure detection half of image normalization:
 * magic-byte sniffing and HEIC-likeness. The conversion paths (sharp /
 * heic-convert) are deliberately not exercised here.
 */

/**
 * Build a minimal ISO-BMFF header: [size][ftyp][major][minor][...compatible].
 * Compatible brands start at byte 16, which is where hasHeicSignature scans.
 */
function isoBmff(major: string, ...compatible: string[]): Buffer {
  const size = 16 + compatible.length * 4;
  const header = Buffer.alloc(size);
  header.writeUInt32BE(size, 0);
  header.write("ftyp", 4, "ascii");
  header.write(major, 8, "ascii");
  header.write("\0\0\0\0", 12, "ascii");
  compatible.forEach((brand, i) => header.write(brand, 16 + i * 4, "ascii"));
  return header;
}

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const gifBytes = Buffer.from("GIF89a\x01\x00\x01\x00", "ascii");
const webpBytes = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "ascii");

describe("inferImageContentType — magic bytes", () => {
  const sniffCases: { name: string; bytes: Buffer; expected: string }[] = [
    { name: "JPEG", bytes: jpegBytes, expected: "image/jpeg" },
    { name: "PNG", bytes: pngBytes, expected: "image/png" },
    { name: "GIF89a", bytes: gifBytes, expected: "image/gif" },
    { name: "WEBP", bytes: webpBytes, expected: "image/webp" },
    { name: "HEIC major brand", bytes: isoBmff("heic"), expected: "image/heic" },
    { name: "AVIF major brand", bytes: isoBmff("avif"), expected: "image/avif" },
  ];
  for (const { name, bytes, expected } of sniffCases) {
    test(`${name} bytes -> ${expected}`, () => {
      expect(inferImageContentType({ bytes })).toBe(expected);
    });
  }

  test("AVIF is not misdetected as HEIC even with heic compatible brand", () => {
    expect(inferImageContentType({ bytes: isoBmff("avif", "heic") })).toBe(
      "image/avif",
    );
  });

  test("mif1 major brand alone is not HEIC", () => {
    // NOTE: current behavior — a bare mif1/msf1 ftyp with no decisive
    // compatible brand is undetectable and falls through to the extension.
    expect(inferImageContentType({ bytes: isoBmff("mif1") })).toBe("");
    expect(inferImageContentType({ bytes: isoBmff("msf1") })).toBe("");
  });

  test("mif1 major brand with a heic compatible brand is HEIC", () => {
    expect(inferImageContentType({ bytes: isoBmff("mif1", "mif1", "heic") })).toBe(
      "image/heic",
    );
  });

  test("mif1 major brand with an avif compatible brand is not HEIC", () => {
    expect(inferImageContentType({ bytes: isoBmff("mif1", "avif") })).toBe("");
  });

  test("unrecognized bytes yield empty string", () => {
    expect(
      inferImageContentType({ bytes: Buffer.from("not an image", "ascii") }),
    ).toBe("");
  });

  test("accepts Uint8Array and ArrayBuffer inputs", () => {
    expect(inferImageContentType({ bytes: new Uint8Array(jpegBytes) })).toBe(
      "image/jpeg",
    );
    const ab = jpegBytes.buffer.slice(
      jpegBytes.byteOffset,
      jpegBytes.byteOffset + jpegBytes.byteLength,
    );
    expect(inferImageContentType({ bytes: ab })).toBe("image/jpeg");
  });
});

describe("inferImageContentType — declared type and extension", () => {
  test("declared image content type wins over bytes", () => {
    expect(
      inferImageContentType({ bytes: jpegBytes, contentType: "IMAGE/PNG; q=1" }),
    ).toBe("image/png");
  });

  test("non-image declared type is ignored in favor of bytes", () => {
    expect(
      inferImageContentType({
        bytes: jpegBytes,
        contentType: "application/octet-stream",
      }),
    ).toBe("image/jpeg");
  });

  test("extension fallback when bytes are absent", () => {
    expect(inferImageContentType({ name: "photo.HEIC" })).toBe("image/heic");
    expect(inferImageContentType({ name: "photo.hif" })).toBe("image/heif");
    expect(inferImageContentType({ name: "pic.jpg" })).toBe("image/jpeg");
    expect(inferImageContentType({ name: "pic.jpeg?width=200" })).toBe(
      "image/jpeg",
    );
    expect(inferImageContentType({ name: "doc.pdf" })).toBe("");
  });

  test("bytes win over the extension when both are present", () => {
    expect(inferImageContentType({ bytes: pngBytes, name: "photo.heic" })).toBe(
      "image/png",
    );
  });

  test("nothing to go on yields empty string", () => {
    expect(inferImageContentType({})).toBe("");
  });
});

describe("isHeicLikeImage", () => {
  test("detects via content type", () => {
    expect(isHeicLikeImage({ contentType: "image/heif-sequence" })).toBe(true);
    expect(isHeicLikeImage({ contentType: "image/jpeg" })).toBe(false);
  });

  test("detects via file extension", () => {
    expect(isHeicLikeImage({ name: "IMG_0001.HEIC" })).toBe(true);
    expect(isHeicLikeImage({ name: "IMG_0001.heif" })).toBe(true);
    expect(isHeicLikeImage({ name: "IMG_0001.jpg" })).toBe(false);
  });

  test("detects via magic bytes", () => {
    expect(isHeicLikeImage({ bytes: isoBmff("heic") })).toBe(true);
    expect(isHeicLikeImage({ bytes: isoBmff("avif") })).toBe(false);
    expect(isHeicLikeImage({ bytes: jpegBytes })).toBe(false);
  });

  test("no signal at all is not HEIC", () => {
    expect(isHeicLikeImage({})).toBe(false);
  });
});
