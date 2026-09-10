export interface ZipEntry {
  name: string;
  blob: Blob;
}

const encoder = new TextEncoder();

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
}

const CRC_TABLE = crcTable();

async function crc32(blob: Blob) {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export async function buildStoredZip(entries: ZipEntry[]) {
  const parts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/\\/g, "/"));
    const checksum = await crc32(entry.blob);
    const size = entry.blob.size;
    if (size > 0xffffffff) throw new Error(`O arquivo ${entry.name} excede o limite ZIP de 4 GB.`);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, now.time);
    writeUint16(localView, 12, now.day);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, size);
    writeUint32(localView, 22, size);
    writeUint16(localView, 26, name.length);
    local.set(name, 30);
    parts.push(local, entry.blob);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, now.time);
    writeUint16(centralView, 14, now.day);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, size);
    writeUint32(centralView, 24, size);
    writeUint16(centralView, 28, name.length);
    writeUint32(centralView, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (part as Uint8Array).byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  return new Blob([...parts, ...centralParts, end], { type: "application/zip" });
}
