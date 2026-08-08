import { type NextRequest } from "next/server";

/**
 * Generates a solid-colour splash screen with the Matrix logo mark centred.
 * iOS requires PNG images for `apple-touch-startup-image`; this route
 * returns a minimal hand-built PNG so the PWA splash is never a white flash.
 *
 * Query: ?w=<width>&h=<height>  (pixels at 3× or 2× device scale)
 *
 * Cached aggressively — the image never changes, only the dimensions vary.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const w = parseInt(searchParams.get("w") || "1170", 10);
  const h = parseInt(searchParams.get("h") || "2532", 10);

  // Build a minimal valid PNG by hand — no external dependencies.
  const png = minimalPng(w, h);

  // Next.js API routes run in Node.js; Response accepts a Node Buffer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Response(Buffer.from(png) as any, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** Creates the smallest possible valid RGBA PNG of the given dimensions
 *  with the Matrix background colour and a centred logo block. */
function minimalPng(width: number, height: number): Uint8Array {
  // Raw RGBA pixel data — fill with background colour (#f4ecdd = 244,236,221,255)
  const raw: number[] = [];
  const bgR = 0xf4;
  const bgG = 0xec;
  const bgD = 0xdd; // 'd' to avoid confusion with B
  const accent = { r: 168, g: 70, b: 31 }; // #a8461f

  // Logo bounding box: ~40% of width, centred
  const logoW = Math.round(width * 0.28);
  const logoH = Math.round(logoW * 0.55);
  const logoX = Math.round((width - logoW) / 2);
  const logoY = Math.round((height - logoH) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Draw a simplified "M" logo mark: two vertical bars + a chevron
      const inLogoX = x >= logoX && x < logoX + logoW;
      const inLogoY = y >= logoY && y < logoY + logoH;
      const lx = x - logoX;
      const ly = y - logoY;

      // Left vertical bar
      const leftBar = lx < logoW * 0.12 && inLogoY;
      // Right vertical bar
      const rightBar = lx >= logoW * 0.88 && inLogoY;
      // Diagonal left leg of chevron
      const diagLeft =
        lx >= logoW * 0.12 &&
        lx < logoW * 0.5 &&
        ly > logoH * 0.8 - (lx / logoW) * logoH * 0.8 &&
        ly < logoH * 0.8 - (lx / logoW) * logoH * 0.6;
      // Diagonal right leg of chevron
      const diagRight =
        lx >= logoW * 0.5 &&
        lx < logoW * 0.88 &&
        ly > (lx / logoW) * logoH * 0.8 - logoH * 0.4 &&
        ly < (lx / logoW) * logoH * 0.8 - logoH * 0.2;
      // Top accent bar
      const topAccent = inLogoX && ly < logoH * 0.06;

      // Accent glow behind the logo
      const dx = lx - logoW / 2;
      const dy = ly - logoH / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glowRadius = Math.max(logoW, logoH) * 0.7;
      const glowAlpha = Math.max(0, 1 - dist / glowRadius) * 0.12;

      const isAccent = leftBar || rightBar || diagLeft || diagRight || topAccent;

      let r: number, g: number, b: number, a: number;

      if (isAccent) {
        r = accent.r;
        g = accent.g;
        b = accent.b;
        a = 255;
      } else if (glowAlpha > 0.01) {
        // Accent glow
        r = Math.round(bgR + (accent.r - bgR) * glowAlpha);
        g = Math.round(bgG + (accent.g - bgG) * glowAlpha);
        b = Math.round(bgD + (accent.b - bgD) * glowAlpha);
        a = 255;
      } else {
        r = bgR;
        g = bgG;
        b = bgD;
        a = 255;
      }

      raw.push(r, g, b, a);
    }
  }

  return buildPng(width, height, raw);
}

/** Assembles raw RGBA data into a minimal valid PNG buffer. */
function buildPng(width: number, height: number, raw: number[]): Uint8Array {
  const crcTable = makeCrcTable();

  function crc32(buf: number[]): number {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type: string, data: number[]): number[] {
    const typeBytes = [...type].map((c) => c.charCodeAt(0));
    const len = data.length;
    const combined = [...typeBytes, ...data];
    const crc = crc32(combined);
    const lenB = [len >>> 24, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff];
    const crcB = [(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
    return [...lenB, ...combined, ...crcB];
  }

  // PNG signature
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  // IHDR
  const ihdrData = [
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8, // bit depth
    6, // colour type: RGBA
    0,
    0,
    0, // compression, filter, interlace
  ];

  // IDAT — raw pixel data with filter byte 0 per row
  const idatData: number[] = [];
  for (let y = 0; y < height; y++) {
    idatData.push(0); // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      idatData.push(raw[i], raw[i + 1], raw[i + 2], raw[i + 3]);
    }
  }
  const compressed = deflate(idatData);

  // IEND
  const result = [
    ...sig,
    ...chunk("IHDR", ihdrData),
    ...chunk("IDAT", compressed),
    ...chunk("IEND", []),
  ];
  return new Uint8Array(result);
}

/** Minimal DEFLATE compressor — enough for our use case (filter-byte-0 rows compress well). */
function deflate(data: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    // Deflate block header: final=false, type=0 (uncompressed)
    const isLast = i >= data.length - 1;
    out.push(isLast ? 1 : 0); // BFINAL
    out.push(0, 0); // BTYPE=0 (uncompressed)
    // Padding to byte boundary
    const len = Math.min(data.length - i, 0xffff);
    out.push(len & 0xff, (len >>> 8) & 0xff);
    out.push(~len & 0xff, (~len >>> 8) & 0xff);
    for (let j = 0; j < len; j++) out.push(data[i + j]);
    i += len;
  }
  // Wrap in zlib container
  const cmf = 0x78; // deflate, 32K window
  const flg = 0x01; // check bits
  const adler = adler32(data);
  return [
    cmf,
    flg,
    ...out,
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ];
}

function adler32(data: number[]): number {
  let a = 1,
    b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}
