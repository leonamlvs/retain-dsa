# Retain DSA

A local-first app for developers who want to retain DSA skills over time, using spaced repetition and varied practice to reinforce patterns instead of memorizing solutions.

- Official LeetCode 75 coverage
- Adaptive recommendations
- Structured feedback on independence, pattern recognition, implementation difficulty, and Big-O analysis
- Optional solve-time tracking
- Progress analytics

## Getting started

### Requirements

- **Docker Compose v2** — included with [Docker Desktop](https://www.docker.com/products/docker-desktop/)

After cloning the repository, open a terminal in the project root and run:

```sh
docker compose up --build
```

Open <http://localhost:3000>.

To use another port, create a `.env` file in the project root:

```env
PORT=3001
```

Press `Ctrl+C` to stop the application.

## Contributing

To work on the project, you will also need:

- **Node.js 24.19+ (24.x)**
- **Corepack**, included with Node.js 24

Yarn does not need to be installed separately.

From the project root:

```sh
corepack enable
yarn install --immutable
yarn dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development commands and guidelines.

## Docker and data

### Where is my progress stored?

Progress is stored in PostgreSQL inside a Docker named volume.

It survives:

- `Ctrl+C`
- `docker compose stop`
- `docker compose down`
- Container recreation
- Docker restarts
- Computer restarts

### How do I stop the app?

Press `Ctrl+C`, or run:

```sh
docker compose stop
```

or:

```sh
docker compose down
```

Both preserve your progress.

### What can delete my progress?

Avoid these unless you intentionally want to delete the database:

```sh
docker compose down -v
docker compose down --volumes
docker volume rm ...
docker system prune --volumes
```

⚠️ Also be careful with Docker cleanup, factory reset, or uninstall options that remove volumes.

### How do I reset only my progress?

Use **Full Progress Reset** at the bottom of the application.

It removes your attempts, feedback, memory state, recommendations, timers, and progress history while preserving the problem catalog, curriculum, and shared application data.

### How do I delete all Docker data for this project?

Stop the application, then run:

```sh
docker compose down --volumes --remove-orphans
```

This removes the project's Docker-managed data, including all progress.

The repository source files are not removed.

## Documentation

- [Project documentation](docs/README.md)
