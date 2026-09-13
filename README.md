# Retain DSA

Local-first DSA interview practice with official LeetCode 75 coverage, adaptive recommendations,
structured feedback, and progress analytics.

Requires Node.js 24.19+ (24.x), Corepack, and Docker Compose.

```sh
corepack enable
yarn install --immutable
yarn dev
```

Open http://localhost:3000. `yarn dev` starts the application and a private PostgreSQL instance;
`Ctrl+C` stops them while preserving your data.

No `.env` is required. The default port is `3000`; set `PORT` to change it.

[Documentation](docs/README.md)
