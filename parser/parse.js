import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';

// --- CLI args ---
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};
const INPUT_DIR = getArg('--input', path.join(import.meta.dirname, '..', 'Data', 'OneDrive_2026-05-01', 'SCX Files'));
const OUTPUT_FILE = getArg('--output', path.join(import.meta.dirname, '..', 'web', 'public', 'data.json'));
const SAMPLE = parseInt(getArg('--sample', '0'), 10); // 0 = all files

// --- XML parser config ---
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'SingleValueResponse', 'TimerVariableResponse',
    'Event', 'BoolEvent', 'IntEvent', 'EnumEvent', 'DrugEvent',
    'UnsetEvent', 'StringEvent', 'DoubleEvent', 'CompositeViewItem',
    'ExecutionElement', 'Condition', 'Name',
  ].includes(name),
  parseAttributeValue: false,
});

// --- Collect all .scx file paths recursively ---
function findScxFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findScxFiles(full));
    else if (entry.name.toLowerCase().endsWith('.scx')) results.push(full);
  }
  return results;
}

// --- Extract a named entry from ZIP as string (handles UTF-8 and UTF-16) ---
function readZipEntry(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  const buf = entry.getData();
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  return buf.toString('utf8');
}

// --- Tags that carry AA:Id (all variable types) ---
const ID_ATTR = '@_AA:Id';
const ID_CARRYING_TAGS = new Set([
  'SingleValueResponse', 'TimerVariableResponse',
  'Event', 'BoolEvent', 'IntEvent', 'EnumEvent', 'DrugEvent',
  'UnsetEvent', 'StringEvent', 'DoubleEvent', 'CompositeViewItem',
]);

// Tags whose NewValue attribute we want to record for value-distribution stats
const VALUE_TAGS = new Map([
  ['SingleValueResponse', '@_NewValue'],
  ['EnumEvent',           '@_Value'],
]);

// --- Walk the parsed XML tree, collecting IDs and value assignments ---
function collectData(node, ids = new Set(), valueAssignments = []) {
  if (typeof node !== 'object' || node === null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectData(item, ids, valueAssignments);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (ID_CARRYING_TAGS.has(key)) {
      const items = Array.isArray(value) ? value : [value];
      for (const r of items) {
        const id = r[ID_ATTR];
        if (!id) continue;
        ids.add(id);
        if (VALUE_TAGS.has(key)) {
          const val = r[VALUE_TAGS.get(key)];
          if (val !== undefined && val !== '') valueAssignments.push({ id, value: String(val) });
        }
      }
    } else {
      collectData(value, ids, valueAssignments);
    }
  }
}

// --- Parse one .scx file ---
function parseScx(filePath) {
  let zip;
  try {
    zip = new AdmZip(filePath);
  } catch {
    return null;
  }

  const infoXml = readZipEntry(zip, 'ScenarioInfo.xml');
  const scenarioXml = readZipEntry(zip, 'Scenario.xml');
  if (!infoXml || !scenarioXml) return null;

  let manikin = 'Unknown';
  try {
    const info = parser.parse(infoXml);
    const root = info?.['AA:ScenarioInfo'] ?? info?.ScenarioInfo ?? {};
    manikin = root?.['AA:TargetedManikin'] ?? root?.TargetedManikin ?? 'Unknown';
  } catch { /* keep Unknown */ }

  const ids = new Set();
  const valueAssignments = [];
  try {
    const scenario = parser.parse(scenarioXml);
    collectData(scenario, ids, valueAssignments);
  } catch { /* keep empty */ }

  return {
    file: path.basename(filePath),
    manikin: String(manikin),
    variableIds: [...ids],
    valueAssignments,
  };
}

// --- Classify a variable ID ---
function classify(id) {
  if (id.startsWith('Laerdal.Response.')) return { type: 'standard', category: 'Response' };
  if (id.startsWith('Laerdal.Event.'))    return { type: 'standard', category: 'Event' };
  if (id.startsWith('Laerdal.Drug.'))     return { type: 'standard', category: 'Drug' };
  if (id.startsWith('Custom.Response.'))  return { type: 'custom',   category: 'Response' };
  if (id.startsWith('Custom.Event.'))     return { type: 'custom',   category: 'Event' };
  if (id.startsWith('Custom.Drug.'))      return { type: 'custom',   category: 'Drug' };
  return { type: 'custom', category: 'Timer' };
}

// --- Main ---
const allFiles = findScxFiles(INPUT_DIR);
const files = SAMPLE > 0 ? allFiles.slice(0, SAMPLE) : allFiles;

console.log(`Found ${allFiles.length} .scx files. Processing ${files.length}...`);

const scenarios = [];
let processed = 0;
let errors = 0;

for (const f of files) {
  const result = parseScx(f);
  if (result) {
    scenarios.push(result);
    processed++;
  } else {
    errors++;
  }
  if (processed % 50 === 0) process.stdout.write(`  ${processed}/${files.length}\r`);
}

console.log(`\nParsed: ${processed}  Errors: ${errors}`);

// --- Aggregate variable stats + value distributions ---
const variableMap = new Map();

for (const scenario of scenarios) {
  // Track which (id, value) pairs appeared in this scenario file (for per-scenario counts)
  const seenValues = new Set();

  for (const id of scenario.variableIds) {
    if (!variableMap.has(id)) {
      variableMap.set(id, {
        id,
        ...classify(id),
        scenarioFiles: new Set(),
        manikins: new Set(),
        // value -> { assignments, scenarioFiles }
        valueMap: new Map(),
      });
    }
    const v = variableMap.get(id);
    v.scenarioFiles.add(scenario.file);
    v.manikins.add(scenario.manikin);
  }

  for (const { id, value } of scenario.valueAssignments) {
    const v = variableMap.get(id);
    if (!v) continue;
    if (!v.valueMap.has(value)) v.valueMap.set(value, { assignments: 0, scenarioFiles: new Set() });
    const entry = v.valueMap.get(value);
    entry.assignments++;
    entry.scenarioFiles.add(scenario.file);
    seenValues.add(`${id}\0${value}`);
  }
}

const total = scenarios.length;
const variables = [...variableMap.values()]
  .map(({ id, type, category, scenarioFiles, manikins, valueMap }) => {
    const base = {
      id,
      type,
      category,
      usedInCount: scenarioFiles.size,
      usedInPercent: total > 0 ? parseFloat(((scenarioFiles.size / total) * 100).toFixed(1)) : 0,
      manikins: [...manikins].sort(),
    };
    if (valueMap.size > 0) {
      base.values = [...valueMap.entries()]
        .map(([value, { assignments, scenarioFiles: sf }]) => ({
          value,
          assignments,
          scenarios: sf.size,
        }))
        .sort((a, b) => b.assignments - a.assignments);
    }
    return base;
  })
  .sort((a, b) => b.usedInCount - a.usedInCount);

const output = {
  generated: new Date().toISOString(),
  totalScenarios: total,
  sampledScenarios: SAMPLE > 0 ? SAMPLE : null,
  variables,
  scenarios: scenarios.map(({ file, manikin, variableIds }) => ({
    file,
    manikin,
    variableIds,
  })),
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
console.log(`Written to ${OUTPUT_FILE}`);
console.log(`  ${variables.length} unique variables across ${total} scenarios`);
console.log(`  ${variables.filter(v => v.values).length} variables with value distributions`);
