// Shows a few raw XML snippets for a given tag name across a sample of files
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

const INPUT_DIR = path.join(import.meta.dirname, '..', 'Data', 'OneDrive_2026-05-01', 'SCX Files');
const TAG = process.argv[2] || 'CompositeViewItem';
const SHOW = parseInt(process.argv[3] || '8', 10);

function findScxFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findScxFiles(full));
    else if (entry.name.toLowerCase().endsWith('.scx')) results.push(full);
  }
  return results;
}

function readZipEntry(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  const buf = entry.getData();
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  return buf.toString('utf8');
}

const tagRe = new RegExp(`<${TAG}[^>]*AA:Id[^/]*/?>`, 'g');

const files = findScxFiles(INPUT_DIR);
let found = 0;
for (const f of files) {
  if (found >= SHOW) break;
  try {
    const zip = new AdmZip(f);
    const xml = readZipEntry(zip, 'Scenario.xml');
    if (!xml) continue;
    const matches = xml.match(tagRe);
    if (matches) {
      console.log(`\n--- ${path.basename(f)} ---`);
      for (const m of matches.slice(0, 3)) console.log(' ', m);
      found++;
    }
  } catch { /* skip */ }
}
console.log(`\nShowed ${found} files with <${TAG}> elements.`);
