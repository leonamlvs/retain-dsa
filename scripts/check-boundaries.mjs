import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const failures = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(file);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)/g)].map(
      (match) => match[1],
    );
    for (const specifier of imports) {
      const resolved = specifier.startsWith('.')
        ? path.resolve(path.dirname(file), specifier).replaceAll('\\', '/')
        : specifier;
      if (
        file.replaceAll('\\', '/').startsWith('apps/web/') &&
        (resolved.includes('/apps/api/') ||
          specifier === '@retain/api' ||
          specifier.includes('prisma'))
      )
        failures.push(`${file}: web cannot import ${specifier}`);
      if (
        /apps\/api\/src\/(domain|modules|application)\//.test(file.replaceAll('\\', '/')) &&
        (/^(express|@prisma|prisma|pg|pino|swagger|ts-fsrs)/.test(specifier) ||
          /\/src\/(infrastructure|generated|http)\//.test(resolved))
      )
        failures.push(`${file}: application/domain cannot import ${specifier}`);
    }
  }
}
await visit('apps');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Architecture boundaries verified.');
