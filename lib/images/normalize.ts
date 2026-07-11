import {
  isHeicContentType,
  normalizeImageContentType,
} from "@/lib/images/content-types";

export type ImageBytes = Buffer | Uint8Array | ArrayBuffer;

export const JPEG_CONTENT_TYPE = "image/jpeg";

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

const AVIF_BRANDS = new Set(["avif", "avis"]);

function toBuffer(bytes: ImageBytes): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function extensionLooksHeic(name: string | undefined) {
  return /\.(heic|heif|hif)$/i.test(name ?? "");
}

function isoBmffBrand(bytes: Buffer, offset: number): string {
  return bytes.subarray(offset, offset + 4).toString("ascii").toLowerCase();
}

function hasHeicSignature(bytes: Buffer) {
  if (bytes.byteLength < 12 || isoBmffBrand(bytes, 4) !== "ftyp") return false;

  const majorBrand = isoBmffBrand(bytes, 8);
  if (AVIF_BRANDS.has(majorBrand)) return false;
  if (HEIC_BRANDS.has(majorBrand)) return true;

  const maxOffset = Math.min(bytes.byteLength - 4, 64);
  for (let offset = 16; offset <= maxOffset; offset += 4) {
    const brand = isoBmffBrand(bytes, offset);
    if (AVIF_BRANDS.has(brand)) return false;
    if (HEIC_BRANDS.has(brand) && brand !== "mif1" && brand !== "msf1") {
      return true;
    }
  }

  return false;
}

export function isHeicLikeImage(input: {
  bytes?: ImageBytes;
  contentType?: string | null;
  name?: string;
}) {
  if (isHeicContentType(input.contentType)) return true;
  if (extensionLooksHeic(input.name)) return true;
  return input.bytes ? hasHeicSignature(toBuffer(input.bytes)) : false;
}

export async function convertImageToJpeg(
  bytes: ImageBytes,
  options: { quality?: number; maxBytes?: number } = {},
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const converted = await sharp(toBuffer(bytes), { failOn: "none" })
    .autoOrient()
    .jpeg({ quality: options.quality ?? 90, mozjpeg: true })
    .toBuffer();

  if (options.maxBytes && converted.byteLength > options.maxBytes) {
    throw new Error(
      `converted image is ${converted.byteLength} bytes (max ${options.maxBytes})`,
    );
  }

  return converted;
}

export async function normalizeHeicImageForPreview(input: {
  bytes: ImageBytes;
  contentType: string | null | undefined;
  name?: string;
}): Promise<{ bytes: Buffer; contentType: string; converted: boolean }> {
  const bytes = toBuffer(input.bytes);
  const contentType =
    normalizeImageContentType(input.contentType) || "application/octet-stream";

  if (!isHeicLikeImage({ ...input, bytes })) {
    return { bytes, contentType, converted: false };
  }

  return {
    bytes: await convertImageToJpeg(bytes),
    contentType: JPEG_CONTENT_TYPE,
    converted: true,
  };
}
