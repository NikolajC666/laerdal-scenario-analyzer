import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';

const INPUT_DIR = path.join(import.meta.dirname, '..', 'Data', 'OneDrive_2026-05-01', 'SCX Files');

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

// Collect every tag name that has an AA:Id attribute, with example IDs
function collectTagsWithId(node, tagCounts = new Map(), parentTag = '') {
  if (typeof node !== 'object' || node === null) return tagCounts;
  if (Array.isArray(node)) {
    for (const item of node) collectTagsWithId(item, tagCounts, parentTag);
    return tagCounts;
  }
  for (const [key, value] of Object.entries(node)) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (typeof item === 'object' && item !== null && item['@_AA:Id']) {
        const id = item['@_AA:Id'];
        if (!tagCounts.has(key)) tagCounts.set(key, { count: 0, examples: [] });
        const entry = tagCounts.get(key);
        entry.count++;
        if (entry.examples.length < 3) entry.examples.push(id);
      }
      collectTagsWithId(item, tagCounts, key);
    }
  }
  return tagCounts;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

const files = findScxFiles(INPUT_DIR);
console.log(`Scanning ${files.length} files...`);

const tagCounts = new Map();
let i = 0;
for (const f of files) {
  try {
    const zip = new AdmZip(f);
    const xml = readZipEntry(zip, 'Scenario.xml');
    if (!xml) continue;
    const parsed = parser.parse(xml);
    collectTagsWithId(parsed, tagCounts);
  } catch { /* skip */ }
  if (++i % 100 === 0) process.stdout.write(`  ${i}/${files.length}\r`);
}

console.log('\n\nAll XML tags that carry an AA:Id attribute:\n');
const sorted = [...tagCounts.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [tag, { count, examples }] of sorted) {
  console.log(`  ${tag.padEnd(30)} ${String(count).padStart(6)} occurrences`);
  for (const ex of examples) console.log(`    e.g. ${ex}`);
}

// Show which ones the parser currently captures vs misses
const CAPTURED = new Set(['SingleValueResponse', 'Event', 'BoolEvent', 'IntEvent', 'EnumEvent', 'DrugEvent']);
console.log('\n--- NOT currently captured by parse.js ---');
for (const [tag, { count, examples }] of sorted) {
  if (!CAPTURED.has(tag)) {
    console.log(`  ${tag.padEnd(30)} ${count} occurrences  e.g. ${examples[0]}`);
  }
}
console.log('\n--- Already captured ---');
for (const [tag] of sorted) {
  if (CAPTURED.has(tag)) console.log(`  ${tag}`);
}
