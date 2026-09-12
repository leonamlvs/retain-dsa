# Retain DSA

Local DSA interview practice with LeetCode 75, spaced repetition, and feedback.

Requires Node.js 24.19+ (24.x), Corepack, and Docker Desktop running.

```sh
corepack enable
yarn install --immutable
yarn dev
```

Open http://localhost:3000. The command starts the application and PostgreSQL. `Ctrl+C` stops the
environment while preserving your data.

You do not need to create `.env`. The default port is `3000`, configurable with `PORT`.

[Documentation](docs/README.md) · [Development](docs/development.md)
