/**
 * Build an installable release of the system.
 *
 *   node tools/release.mjs [--no-build] [--repo owner/name]
 *
 * 1. Rebuilds the compendium packs (skip with --no-build; Foundry must not have a world open that uses them).
 * 2. Writes dist/swordworld25.zip with the system files at the archive root.
 * 3. Writes dist/system.json with manifest/download URLs pointing to GitHub releases, so the manifest URL
 *    https://github.com/<repo>/releases/latest/download/system.json can be pasted into Foundry's installer.
 *
 * The zip writer is dependency-free (deflate from node:zlib + a small ZIP container).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM_DIR = path.join(ROOT, "swordworld25");
const DIST = path.join(ROOT, "dist");
const args = process.argv.slice(2);
const repoArg = args.indexOf("--repo");
const REPO = repoArg >= 0 ? args[repoArg + 1] : "HudilajnenVlad/SWMy";

/** Files never shipped (LevelDB runtime files, OS clutter). */
const SKIP = new Set(["LOCK", "LOG", "LOG.old", ".DS_Store", "Thumbs.db"]);

/* -------------------------------------------- */
/*  ZIP writer                                  */
/* -------------------------------------------- */

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for ( let k = 0; k < 8; k++ ) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for ( const byte of buf ) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Create a ZIP archive from a list of {name, data} entries.
 * @param {{name: string, data: Buffer}[]} entries
 * @returns {Buffer}
 */
function createZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());
  for ( const { name, data } of entries ) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt16LE(20, 4);                    // version needed
    header.writeUInt16LE(0x0800, 6);                // UTF-8 names
    header.writeUInt16LE(useDeflate ? 8 : 0, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(day, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014B50, 0);
    dir.writeUInt16LE(20, 4);                       // version made by
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(useDeflate ? 8 : 0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += header.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

/* -------------------------------------------- */
/*  Release                                     */
/* -------------------------------------------- */

function listFiles(dir, base = dir) {
  const out = [];
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    if ( SKIP.has(entry.name) ) continue;
    const full = path.join(dir, entry.name);
    if ( entry.isDirectory() ) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

if ( !args.includes("--no-build") ) {
  console.log("Building compendium packs…");
  execFileSync(process.execPath, [path.join(ROOT, "tools", "build-packs.mjs")], { stdio: "inherit" });
}

const packsDir = path.join(SYSTEM_DIR, "packs");
if ( !fs.existsSync(packsDir) ) throw new Error("swordworld25/packs is missing — run npm run build:packs first");

const manifest = JSON.parse(fs.readFileSync(path.join(SYSTEM_DIR, "system.json"), "utf8"));
const version = manifest.version;
manifest.manifest = `https://github.com/${REPO}/releases/latest/download/system.json`;
manifest.download = `https://github.com/${REPO}/releases/download/v${version}/swordworld25.zip`;

const files = listFiles(SYSTEM_DIR);
const entries = files.map(name => ({
  name,
  data: name === "system.json"
    ? Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    : fs.readFileSync(path.join(SYSTEM_DIR, name))
}));

fs.mkdirSync(DIST, { recursive: true });
const zip = createZip(entries);
fs.writeFileSync(path.join(DIST, "swordworld25.zip"), zip);
fs.writeFileSync(path.join(DIST, "system.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nRelease v${version}: ${entries.length} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  dist/swordworld25.zip`);
console.log(`  dist/system.json  (manifest: ${manifest.manifest})`);
