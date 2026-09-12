import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const requiredDocuments = [
  'docs/specification.md',
  'docs/scheduler.md',
  'docs/architecture.md',
  'docs/database.md',
  'docs/api.md',
  'docs/frontend.md',
  'docs/testing.md',
  'docs/observability.md',
  'docs/git-workflow.md',
  'docs/development.md',
  'docs/implementation-plan.md',
  'docs/implementation-status.md',
];
const ignoredDirectories = new Set(['.git', '.yarn', 'dist', 'generated', 'test-results']);
const errors = [];
const warnings = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

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
      const targetPath = target.split('#', 1)[0];
      if (!targetPath) continue;
      const resolved = normalize(resolve(dirname(file), targetPath));
      if (!resolved.startsWith(root) || !existsSync(resolved)) {
        errors.push(`Broken Markdown link in ${relative(root, file)}: ${target}`);
      }
    }
  }
}

function checkImplementationEvidence() {
  const plan = read('docs/implementation-plan.md');
  for (const [label, pattern] of [
    ['acceptance criteria', /acceptance/i],
    ['tests', /tests/i],
    ['verification evidence', /verification/i],
  ]) {
    if (!pattern.test(plan))
      errors.push(`Implementation plan is missing required evidence: ${label}`);
  }

  const status = read('docs/implementation-status.md');
  if (!/Verification on \d{4}-\d{2}-\d{2}/.test(status)) {
    errors.push('Implementation status must include dated verification evidence.');
  }
  if (!/\b(?:Done|Partial|In progress|Blocked|Remaining work)\b/.test(status)) {
    warnings.push('Implementation status has no explicit completion-state vocabulary.');
  }
}

function changedFiles(base) {
  const changes = new Set();
  try {
    for (const file of execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: root,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)) {
      changes.add(file);
    }
  } catch {
    warnings.push(
      `Could not inspect Git changes from base '${base}'; skipped change-surface audit.`,
    );
  }
  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
  ]) {
    for (const file of execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)) {
      changes.add(file);
    }
  }
  return [...changes];
}

function checkChangeSurface() {
  const baseIndex = process.argv.indexOf('--base');
  if (baseIndex === -1) return;
  const base = process.argv[baseIndex + 1];
  if (!base) {
    errors.push('--base requires a Git ref.');
    return;
  }
  const changed = changedFiles(base);
  const sourceChange = changed.some(
    (file) =>
      /^(?:apps|packages|config)\//.test(file) ||
      /^(?:prisma\.config\.ts|compose\.yaml|Dockerfile)$/.test(file),
  );
  const documentationChange = changed.some(
    (file) => file === 'AGENTS.md' || file.startsWith('docs/'),
  );
  if (sourceChange && !documentationChange) {
    errors.push('Behavior/configuration files changed without a documentation or status update.');
  }
}

checkRequiredDocuments();
checkMarkdownLinks();
if (errors.length === 0) checkImplementationEvidence();
checkChangeSurface();

for (const warning of warnings) console.warn(`docs:check warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`docs:check error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `docs:check passed (${requiredDocuments.length} required documents, Markdown links, and implementation evidence).`,
  );
}
