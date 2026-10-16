// Refresh metadata without overwriting artwork or requiring the local sample folder.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { relative, join, sep } from 'node:path';

const root = fileURLToPath(new URL('../src/assets/', import.meta.url));
const target = join(root, 'library.json');
const catalogue = JSON.parse(await readFile(target, 'utf8'));
const previous = new Map(catalogue.entries.map((asset) => [asset.id, asset]));
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...(await files(path)));
    else if (item.name.endsWith('.png')) result.push(path);
  }
  return result;
}
const entries = [];
for (const file of (await files(root)).sort()) {
  const name = relative(root, file).split(sep).join('/'),
    id = name.slice(0, -4);
  const png = await readFile(file);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('Invalid PNG: ' + name);
  const known = previous.get(id);
  entries.push({
    id,
    path: 'src/assets/' + name,
    group: known?.group ?? '待分类',
    size: [png.readUInt32BE(16), png.readUInt32BE(20)],
    alpha: [4, 6].includes(png[25]) || png.includes(Buffer.from('tRNS')),
    source: known?.source ?? '待登记来源',
    sha256: createHash('sha256').update(png).digest('hex'),
  });
}
catalogue.entries = entries;
await writeFile(target, JSON.stringify(catalogue, null, 2) + '\n');
console.log(
  `Indexed ${entries.length} PNGs; ${entries.filter((asset) => asset.source === '待登记来源').length} new sources need registration. Artwork unchanged.`,
);
