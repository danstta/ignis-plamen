declare module "heic-convert" {
  type ImageBytes = Buffer | Uint8Array | ArrayBuffer;

  type ConvertOptions = {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  type Convert = ((options: ConvertOptions) => Promise<ImageBytes>) & {
    all(options: ConvertOptions): Promise<{ convert(): Promise<ImageBytes> }[]>;
  };

  const convert: Convert;
  export default convert;
}
