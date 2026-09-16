// minimal PNG reader: 8-bit, non-interlaced, colour types 0/2/4/6
const fs = require('fs');
const zlib = require('zlib');

function readPNG(path) {
  const buf = fs.readFileSync(path);
  let off = 8, idat = [], ihdr = null, plte = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8],
               color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (ihdr.interlace) throw new Error('interlaced unsupported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  if (ch === undefined) throw new Error('colour type ' + ihdr.color);
  if (ihdr.depth !== 8 && !(ihdr.color === 3 && (ihdr.depth === 1 || ihdr.depth === 2 || ihdr.depth === 4)))
    throw new Error('depth ' + ihdr.depth + ' / colour ' + ihdr.color + ' unsupported');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  // sub-byte indexed images filter over packed bytes, one byte at a time
  const bpp = Math.max(1, (ihdr.depth * ch) >> 3);
  const stride = ihdr.depth === 8 ? w * ch : Math.ceil(w * ihdr.depth / 8);
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  // unpack sub-byte indexed rows into one index per pixel
  let idx = out;
  if (ihdr.depth < 8) {
    idx = Buffer.alloc(w * h);
    const per = 8 / ihdr.depth, mask = (1 << ihdr.depth) - 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const byte = out[y * stride + Math.floor(x / per)];
        const shift = 8 - ihdr.depth * ((x % per) + 1);
        idx[y * w + x] = (byte >> shift) & mask;
      }
  }
  return { w, h, ch, depth: ihdr.depth, color: ihdr.color, plte, data: idx };
}
module.exports = { readPNG };

if (require.main === module) {
  const img = readPNG(process.argv[2]);
  console.log('size', img.w, 'x', img.h, 'colour type', img.color, 'depth', img.depth);
  if (img.plte) {
    console.log('palette:');
    for (let i = 0; i < img.plte.length / 3; i++)
      console.log('  [' + i + '] rgb(' + img.plte[i*3] + ',' + img.plte[i*3+1] + ',' + img.plte[i*3+2] + ')');
  }
  const hist = new Map();
  for (let i = 0; i < img.w * img.h; i++) hist.set(img.data[i], (hist.get(img.data[i]) || 0) + 1);
  const total = img.w * img.h;
  [...hist.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log('  index ' + k, (n / total * 100).toFixed(2) + '%'));
}
