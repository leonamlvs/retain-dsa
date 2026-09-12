import { mkdir, readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import { openApiDocument } from '../apps/api/src/http/openapi.js';
const document = openApiDocument();
const source =
  '/* Generated from API Zod schemas. Do not edit. */\n' +
  astToString(await openapiTS(JSON.stringify(document)));
const outputs = new Map([
  ['packages/api-client/src/generated.ts', source],
  ['packages/api-client/openapi.json', JSON.stringify(document, null, 2) + '\n'],
]);
await mkdir('packages/api-client/src', { recursive: true });
for (const [path, content] of outputs) {
  if (process.argv.includes('--check')) {
    if ((await readFile(path, 'utf8')) !== content)
      throw new Error(`Generated contract drift: ${path}`);
  } else await writeFile(path, content);
}
