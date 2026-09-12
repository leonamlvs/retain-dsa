import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';

export async function createRuntimeServer(
  app: Express,
  options: { mode: 'development' | 'production'; webRoot?: string },
) {
  const server = createServer(app);
  const webRoot =
    options.webRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../web');
  let closeWeb: () => Promise<void> = async () => undefined;
  if (options.mode === 'production') {
    const distribution = resolve(webRoot, 'dist');
    app.use(express.static(distribution));
    app.use((request, response, next) =>
      request.method === 'GET' && request.accepts('html')
        ? response.sendFile(resolve(distribution, 'index.html'))
        : next(),
    );
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: webRoot,
      appType: 'spa',
      server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
    closeWeb = () => vite.close();
  }
  return { server, closeWeb };
}
