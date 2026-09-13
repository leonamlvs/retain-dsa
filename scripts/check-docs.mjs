import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredDocuments = [
  'docs/README.md',
  'docs/spec/product.md',
  'docs/spec/scheduler.md',
  'docs/spec/frontend.md',
  'docs/spec/architecture.md',
  'docs/spec/testing.md',
  'docs/work/current.md',
  'docs/adr/README.md',
];
const ignoredDirectories = new Set(['.git', '.yarn', 'dist', 'generated', 'test-results']);
const allowedWorkStatuses = new Set([
  'Proposed execution plan',
  'In progress',
  'Blocked',
  'Complete',
]);
const allowedAdrStatuses = new Set(['Accepted', 'Partially superseded', 'Superseded']);
const errors = [];

function markdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      files.push(...markdownFiles(join(directory, entry.name)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function checkRequiredDocuments() {
  for (const document of requiredDocuments) {
    if (!existsSync(join(root, document))) errors.push(`Missing required document: ${document}`);
  }
}

function checkMarkdownLinks() {
  const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  for (const file of markdownFiles(join(root, 'docs'))) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      const targetPath = decodeURIComponent(target.split('#', 1)[0]);
      if (!targetPath) continue;
      const resolved = normalize(resolve(dirname(file), targetPath));
      if (!resolved.startsWith(root) || !existsSync(resolved))
        errors.push(`Broken Markdown link in ${relative(root, file)}: ${target}`);
    }
  }
}

function checkCurrentWork() {
  const workDirectory = join(root, 'docs/work');
  const workFiles = readdirSync(workDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map((entry) => entry.name);
  if (workFiles.length !== 1 || workFiles[0] !== 'current.md')
    errors.push('docs/work must contain exactly one Markdown plan named current.md.');

  const content = readFileSync(join(workDirectory, 'current.md'), 'utf8');
  const status = content.match(/^Status:\s+\*\*(.+?)\*\*\./m)?.[1];
  if (!status || !allowedWorkStatuses.has(status))
    errors.push(
      `docs/work/current.md must use one of these statuses: ${[...allowedWorkStatuses].join(', ')}.`,
    );
}

function checkAdrIndex() {
  const adrDirectory = join(root, 'docs/adr');
  const adrFiles = readdirSync(adrDirectory)
    .filter((name) => /^\d{3}-.+\.md$/.test(name))
    .sort();
  const knownNumbers = new Set(adrFiles.map((name) => name.slice(0, 3)));
  const index = readFileSync(join(adrDirectory, 'README.md'), 'utf8');
  const rows = [
    ...index.matchAll(/^\|\s*(\d{3})\s*\|[^\n]*?\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/gm),
  ];
  const indexed = new Map();

  for (const row of rows) {
    const number = row[1];
    const status = row[2].trim();
    const notes = row[3].trim();
    if (indexed.has(number)) errors.push(`ADR ${number} appears more than once in the ADR index.`);
    indexed.set(number, status);
    if (!allowedAdrStatuses.has(status))
      errors.push(`ADR ${number} has unsupported index status: ${status}`);
    if (status.includes('superseded')) {
      const references = [...notes.matchAll(/ADR\s+(\d{3})/g)].map((match) => match[1]);
      if (!references.length)
        errors.push(`ADR ${number} is ${status.toLowerCase()} but names no superseding ADR.`);
      for (const reference of references) {
        if (!knownNumbers.has(reference))
          errors.push(`ADR ${number} references missing superseding ADR ${reference}.`);
      }
    }
  }

  for (const number of knownNumbers) {
    if (!indexed.has(number)) errors.push(`ADR ${number} is missing from docs/adr/README.md.`);
  }
  for (const number of indexed.keys()) {
    if (!knownNumbers.has(number))
      errors.push(`ADR index entry ${number} has no matching ADR file.`);
  }
}

checkRequiredDocuments();
if (errors.length === 0) {
  checkMarkdownLinks();
  checkCurrentWork();
  checkAdrIndex();
}

if (errors.length > 0) {
  for (const error of errors) console.error(`docs:check error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `docs:check passed (${requiredDocuments.length} required documents, Markdown links, current work, and ADR index).`,
  );
}
