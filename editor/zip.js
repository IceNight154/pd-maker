// ================================================================
//  작은 ZIP 도구 (의존성 없음) — 프로젝트 내보내기(.pdmproj)·가져오기에 씀
//    zipDir(dir, outFile, { exclude(rel) })  → 파일 수
//    unzip(file, destDir)                    → 파일 수   (".." 같은 바깥 경로는 막음)
//  형식: 일반 ZIP (deflate). 탐색기·7-Zip 으로도 열 수 있음. 파일 이름은 UTF-8.
// ================================================================
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
function walk(dir, rel, out, exclude) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (exclude && exclude(r, e.isDirectory())) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out, exclude);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

function zipDir(dir, outFile, opts = {}) {
  const files = walk(dir, '', [], opts.exclude);
  const locals = [], central = [];
  let offset = 0;
  for (const rel of files) {
    const full = path.join(dir, ...rel.split('/'));
    const data = fs.readFileSync(full);
    const st = fs.statSync(full);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useStore = comp.length >= data.length;
    const body = useStore ? data : comp;
    const name = Buffer.from((opts.prefix || '') + rel, 'utf8');
    const { time, date } = dosTime(st.mtime);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);   // UTF-8 이름
    lh.writeUInt16LE(useStore ? 0 : 8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useStore ? 0 : 8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([...locals, ...central, end]));
  return files.length;
}

/** 압축 안의 파일 이름 목록 */
function entries(file) {
  const buf = fs.readFileSync(file);
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP 파일이 아닙니다');
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 목록이 깨졌습니다');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28),
      xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    out.push({ name, method, csize, loff });
    p += 46 + nlen + xlen + clen;
  }
  return { buf, list: out };
}
function unzip(file, destDir) {
  const { buf, list } = entries(file);
  const root = path.resolve(destDir);
  let n = 0;
  for (const it of list) {
    if (it.name.endsWith('/')) continue;
    const target = path.resolve(root, ...it.name.split('/'));
    if (!target.startsWith(root + path.sep)) throw new Error('잘못된 경로가 들어 있습니다: ' + it.name);
    const nlen = buf.readUInt16LE(it.loff + 26), xlen = buf.readUInt16LE(it.loff + 28);
    const start = it.loff + 30 + nlen + xlen;
    const body = buf.slice(start, start + it.csize);
    const data = it.method === 8 ? zlib.inflateRawSync(body) : it.method === 0 ? body : null;
    if (!data) throw new Error('지원하지 않는 압축 방식: ' + it.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    n++;
  }
  return n;
}

module.exports = { zipDir, unzip, entries, crc32 };
