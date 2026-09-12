# ADR 009 — Single-origin Docker runtime

Status: **accepted** on 2026-09-12 through approval of the complete application plan.

## Context

Running API, web and PostgreSQL manually requires multiple terminals and exposes implementation ports. The product is a local single-user application and should have one obvious startup command.

## Decision

`yarn dev` starts Docker Compose in the foreground. Compose runs the application and PostgreSQL, but publishes only the application at `127.0.0.1:3000` by default. PostgreSQL uses a named volume and its private Compose network.

Express owns the HTTP server. In development Vite runs in middleware mode on that server, including HMR; production serves the compiled web assets from the same origin. API packages and web packages remain independent, and the web communicates only through the generated HTTP client.

Startup waits for a healthy database, applies non-destructive migrations serially and seeds only missing global roots. Graceful shutdown stops HTTP and background work without deleting data.

## Consequences

- One terminal and one published port serve the complete application.
- The container has its own Linux `node_modules`, separate from the host installation.
- Automated tests continue to use their own disposable PostgreSQL and browser resources.

## Documents and verification

Update architecture, development, API, frontend, testing and observability. Verify startup from a clean clone, same-origin API/UI/Swagger/HMR, shutdown, restart persistence and private database networking.
