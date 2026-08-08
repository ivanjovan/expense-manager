# Expense Manager

A personal expense and utility tracker for a single household: fuel purchases
per vehicle, electricity bills per meter, and the numbers derived from
them — consumption, cost per kilometre, price per kWh, what is still unpaid.
Optionally, it can read a photographed receipt or bill and pre-fill the form.

The full specification lives in
[docs/Personal_Expense_Utility_Tracker_SRS_v1.1.md](docs/Personal_Expense_Utility_Tracker_SRS_v1.1.md),
and the `§` references throughout the code point at it.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL ·
Auth.js v5 · next-intl · Tailwind 4 · Vitest.

> **Note:** this repository targets a Next.js version with breaking changes
> relative to most training data — `middleware` is now `proxy`, error
> boundaries take `retry` rather than `reset`. See [AGENTS.md](AGENTS.md);
> the authoritative docs ship in `node_modules/next/dist/docs/`.

## Getting started

```bash
cp .env.example .env      # then set AUTH_SECRET: npx auth secret
npm install
npm run db:up             # Postgres via docker compose
npm run db:migrate
npm run dev
```

Open http://localhost:3000. The first visit to `/register` bootstraps the
household and makes that account its owner; registration then closes unless
`ALLOW_PUBLIC_REGISTRATION=true`. Further members join by invitation.

## Architecture

Code is organised by feature module under `src/modules/<module>/`, each with
the same internal split:

| Layer | Contains | Rule |
| --- | --- | --- |
| `domain/` | Calculations — consumption, derivation, billing periods | Pure. No Prisma, no React, no I/O. Where the tests live. |
| `schemas/` | Zod input schemas | Error messages are i18n *keys*, never prose (§16). |
| `server/` | Queries and Server Actions | Every one filters on `householdId`. |
| `components/` | Forms, tables, charts | Presentation only. |

Shared concerns sit in `src/shared/`, i18n in `src/i18n/`, routes in
`src/app/`.

Two invariants are worth knowing before changing anything:

- **Every household-scoped query filters on `householdId`** taken from
  `requireCurrentUser()`, which re-reads the user from the database rather
  than trusting JWT claims (§6.4). This is the entire authorization model;
  `src/modules/tenancy.test.ts` is what keeps it honest.
- **Server Actions return `ActionResult`, they don't throw** across the
  client boundary. The `error` field is a message key the caller translates.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest (database-backed suites skipped — see below) |
| `npm run db:up` | Start Postgres in Docker |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Prisma Studio |
| `npm run db:backup` / `db:restore` | Encrypted local dump / restore |

### Database-backed tests

Most of the suite is pure and needs nothing. The tenancy suite drives real
Server Actions against real rows, so it is opt-in:

```bash
npm run db:up
RUN_DB_TESTS=1 npm test
```

CI sets `RUN_DB_TESTS=1` against a Postgres service container, so these
always run there. They create and then delete their own households; point
`DATABASE_URL` at a scratch database rather than one you care about.

## Configuration

Every variable is described in [.env.example](.env.example) and validated at
startup by `src/shared/lib/env.ts` — the app refuses to boot on an invalid
configuration rather than failing confusingly at the first request (§18).

Only `DATABASE_URL` and `AUTH_SECRET` are required. Email
(`SMTP_*`) and document scanning (`DOCUMENT_EXTRACTION_*`) are optional; with
no scanning provider configured the scan buttons are simply hidden.

`DIRECT_DATABASE_URL` matters in production: migrations must bypass a
connection pooler, for the reason documented in
[prisma.config.ts](prisma.config.ts).

## Backups

A nightly GitHub Action dumps the database, encrypts it and uploads it to
Google Drive; it can also be triggered by hand, because a backup you cannot
test is not a backup. Setup and restore instructions are in
[docs/backups.md](docs/backups.md).

## Known gaps

Deliberate, not oversights:

- **No password reset.** The token model and SMTP configuration exist, but no
  flow is wired to them; a locked-out user currently needs database access.
- **No member removal or invitation revocation** from the settings screen.
- **A household's currency is fixed** at registration.
- Utilities cover **electricity only**; the schema already generalises to
  water, gas, internet and mobile.
