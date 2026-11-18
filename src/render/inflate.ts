// A small inflater (raw DEFLATE, RFC 1951) for the lookup tables that are embedded compressed, and the undoing of
// the row and column differences they are packed with. Written for this game; checked against zlib in
// tests/smaatables.test.ts.

const L_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const L_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const D_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const D_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huff { count: Uint16Array; symbol: Uint16Array }

/** `src` is a raw deflate stream that unpacks to exactly `size` bytes */
export function inflate(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let pos = 0, o = 0, buf = 0, cnt = 0;
  const bits = (n: number): number => {
    while (cnt < n) {
      if (pos >= src.length) throw new Error('inflate: out of data');
      buf |= src[pos++] << cnt;
      cnt += 8;
    }
    const v = buf & ((1 << n) - 1);
    buf >>>= n;
    cnt -= n;
    return v;
  };
  // canonical Huffman codes from the code length of each symbol
  const build = (lens: ArrayLike<number>, n: number): Huff => {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lens[i]]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < n; i++) if (lens[i]) symbol[offs[lens[i]]++] = i;
    return { count, symbol };
  };
  const decode = (h: Huff): number => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw new Error('inflate: bad code');
  };
  let fixed: [Huff, Huff] | null = null;
  for (let last = 0; !last;) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      // stored: the rest of this byte is skipped, then length, its complement, the bytes
      buf = 0;
      cnt = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      if (o + len > size || pos + len > src.length) throw new Error('inflate: bad stored block');
      out.set(src.subarray(pos, pos + len), o);
      o += len;
      pos += len;
      continue;
    }
    if (type === 3) throw new Error('inflate: bad block type');
    let lit: Huff, dist: Huff;
    if (type === 1) {
      if (!fixed) {
        const l = new Uint8Array(288);
        l.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288);
        fixed = [build(l, 288), build(new Uint8Array(30).fill(5), 30)];
      }
      [lit, dist] = fixed;
    } else {
      const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < nc; i++) cl[CL_ORDER[i]] = bits(3);
      const ch = build(cl, 19);
      const lens = new Uint8Array(nl + nd);
      for (let i = 0; i < nl + nd;) {
        const s = decode(ch);
        if (s < 16) { lens[i++] = s; continue; }
        const prev = s === 16 ? lens[i - 1] : 0;
        let rep = s === 16 ? 3 + bits(2) : s === 17 ? 3 + bits(3) : 11 + bits(7);
        if (i + rep > nl + nd) throw new Error('inflate: bad lengths');
        while (rep--) lens[i++] = prev;
      }
      lit = build(lens.subarray(0, nl), nl);
      dist = build(lens.subarray(nl), nd);
    }
    for (;;) {
      let s = decode(lit);
      if (s === 256) break;
      if (s < 256) {
        if (o >= size) throw new Error('inflate: too long');
        out[o++] = s;
        continue;
      }
      s -= 257;
      if (s >= 29) throw new Error('inflate: bad length');
      const len = L_BASE[s] + bits(L_EXTRA[s]);
      const d = decode(dist);
      if (d >= 30) throw new Error('inflate: bad distance');
      const back = D_BASE[d] + bits(D_EXTRA[d]);
      if (back > o || o + len > size) throw new Error('inflate: bad copy');
      for (let i = 0; i < len; i++, o++) out[o] = out[o - back];
    }
  }
  if (o !== size) throw new Error('inflate: too short');
  return out;
}

/**
 * A table packed by tools/smaatables.py: base64 of the deflated differences. `w` texels of `bpp` bytes to a row.
 */
export function unpackTable(z: string, w: number, h: number, bpp: number): Uint8Array {
  const bin = atob(z);
  const src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
  const pitch = w * bpp;
  const b = inflate(src, pitch * h);
  for (let i = pitch; i < b.length; i++) b[i] = (b[i] + b[i - pitch]) & 255; // less the byte above
  for (let i = 0; i < b.length; i++) if (i % pitch >= bpp) b[i] = (b[i] + b[i - bpp]) & 255; // less the byte to the left
  return b;
}
