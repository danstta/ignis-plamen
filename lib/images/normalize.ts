import {
  isHeicContentType,
  isImageContentType,
  normalizeImageContentType,
} from "@/lib/images/content-types";

export type ImageBytes = Buffer | Uint8Array | ArrayBuffer;

export const JPEG_CONTENT_TYPE = "image/jpeg";

type HeicConvert = (input: {
  buffer: Buffer;
  format: "JPEG";
  quality?: number;
}) => Promise<ImageBytes>;

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

function extensionImageContentType(name: string | undefined): string {
  const match = name?.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  const extension = match?.[1]?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return JPEG_CONTENT_TYPE;
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "heic":
      return "image/heic";
    case "heif":
    case "hif":
      return "image/heif";
    default:
      return "";
  }
}

function isoBmffBrand(bytes: Buffer, offset: number): string {
  return bytes.subarray(offset, offset + 4).toString("ascii").toLowerCase();
}

function hasHeicSignature(bytes: Buffer) {
  if (bytes.byteLength < 12 || isoBmffBrand(bytes, 4) !== "ftyp") return false;

  const majorBrand = isoBmffBrand(bytes, 8);
  if (AVIF_BRANDS.has(majorBrand)) return false;
  if (
    HEIC_BRANDS.has(majorBrand) &&
    majorBrand !== "mif1" &&
    majorBrand !== "msf1"
  ) {
    return true;
  }

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

export function inferImageContentType(input: {
  bytes?: ImageBytes;
  contentType?: string | null;
  name?: string;
}): string {
  const contentType = normalizeImageContentType(input.contentType);
  if (isImageContentType(contentType)) return contentType;

  const bytes = input.bytes ? toBuffer(input.bytes) : undefined;
  if (bytes) {
    if (
      bytes.byteLength >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      return JPEG_CONTENT_TYPE;
    }

    if (
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }

    const header = bytes.subarray(0, 12).toString("ascii");
    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
      return "image/gif";
    }
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
      return "image/webp";
    }
    if (hasHeicSignature(bytes)) return "image/heic";
    if (bytes.byteLength >= 12 && isoBmffBrand(bytes, 4) === "ftyp") {
      const majorBrand = isoBmffBrand(bytes, 8);
      if (AVIF_BRANDS.has(majorBrand)) return "image/avif";
    }
  }

  return extensionImageContentType(input.name);
}

function assertMaxBytes(bytes: Buffer, maxBytes: number | undefined) {
  if (maxBytes && bytes.byteLength > maxBytes) {
    throw new Error(`converted image is ${bytes.byteLength} bytes (max ${maxBytes})`);
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function convertHeicToJpeg(
  bytes: Buffer,
  options: { quality?: number; maxBytes?: number; timeoutMs?: number },
): Promise<Buffer> {
  const heicConvertModule = await import("heic-convert");
  const convert = (heicConvertModule.default ?? heicConvertModule) as HeicConvert;
  const converted = toBuffer(
    await convert({
      buffer: bytes,
      format: "JPEG",
      quality: Math.max(0, Math.min(1, (options.quality ?? 90) / 100)),
    }),
  );

  assertMaxBytes(converted, options.maxBytes);
  return converted;
}

export async function convertImageToJpeg(
  bytes: ImageBytes,
  options: { quality?: number; maxBytes?: number; timeoutMs?: number } = {},
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const input = toBuffer(bytes);
  try {
    const converted = await sharp(input, { failOn: "none" })
      .autoOrient()
      .jpeg({ quality: options.quality ?? 90, mozjpeg: true })
      .toBuffer();

    assertMaxBytes(converted, options.maxBytes);
    return converted;
  } catch (err) {
    if (!hasHeicSignature(input)) throw err;

    try {
      return await convertHeicToJpeg(input, options);
    } catch (fallbackErr) {
      throw new Error(
        `sharp conversion failed: ${errorMessage(err)}; HEIC fallback failed: ${errorMessage(fallbackErr)}`,
      );
    }
  }
}

export async function normalizeHeicImageForPreview(input: {
  bytes: ImageBytes;
  contentType: string | null | undefined;
  name?: string;
}): Promise<{ bytes: Buffer; contentType: string; converted: boolean }> {
  const bytes = toBuffer(input.bytes);
  const contentType =
    inferImageContentType({ ...input, bytes }) || "application/octet-stream";

  if (!isHeicLikeImage({ ...input, bytes })) {
    return { bytes, contentType, converted: false };
  }

  return {
    bytes: await convertImageToJpeg(bytes),
    contentType: JPEG_CONTENT_TYPE,
    converted: true,
  };
}

export async function normalizeImageForPreview(input: {
  bytes: ImageBytes;
  contentType: string | null | undefined;
  name?: string;
}): Promise<{ bytes: Buffer; contentType: string; converted: boolean }> {
  return normalizeHeicImageForPreview(input);
}
