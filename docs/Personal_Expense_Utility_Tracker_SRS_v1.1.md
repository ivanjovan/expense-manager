# Software Requirements Specification (SRS)

# Personal Expense & Utility Tracker

> **Version:** 1.1 (MVP)
> **Status:** Draft for implementation
> **Supersedes:** v1.0

---

## 0. Changelog: v1.0 → v1.1

| # | Change | Reason |
|---|---|---|
| 1 | Database changed **SQLite → PostgreSQL** | Prisma cannot use enums on SQLite; no exact decimal type; no native date type. All three are load-bearing here. |
| 2 | Data is scoped to a **Household**, not a User | Confirmed requirement: shared household, multiple people logging against the same vehicles. |
| 3 | `ElectricityBill` generalised to **`UtilityAccount` + `UtilityBill` + `UtilityBillReading`** | Makes water/gas/internet/mobile (§17 of v1.0) additive rather than new tables + new API + new UI each time. |
| 4 | `FuelEntry` gains `isFullTank`, `missedEntries`, `derivedField`, `householdId` | Consumption and cost-per-km are **not computable** without full-tank markers. |
| 5 | Electricity gains **meter readings and tariff bands** | v1.0 tracked only money; kWh and high/low tariff are standard in-region and almost certainly in the source spreadsheet. |
| 6 | `paymentStatus` and `year` **removed** as stored columns | Both derivable; storing them invites drift. |
| 7 | **Server Actions + RSC** replace most of the REST surface | See §16. Roughly halves the code; REST remains available as a later addition. |
| 8 | Currency is **household-level**, locale is **per-user** | Shared data must share a currency; family members may read different languages. |
| 9 | Registration is **invite-only** by default | An open registration form on a public host for a private household tracker is a liability, not a feature. |
| 10 | Added §18 NFRs, §19 backup/restore, §20 testing, §21 phasing | v1.0 had none; acceptance criteria were not verifiable. |
| 11 | Legacy `.xls` import and PDF export **moved out of MVP** | See §14 and §21. |

---

## 1. Vision

A modern, responsive web application replacing the Excel spreadsheets currently used to track vehicle fuel expenses and electricity bills for a **household**.

It must be materially better than the spreadsheet it replaces — not merely a web-shaped version of it — and must be built so that further modules (water, gas, internet, vehicle servicing, budgeting) are additive rather than structural changes.

**MVP scope:** Fuel tracking and Electricity tracking, for one household with multiple members.

---

## 2. Goals

- Replace manual Excel tracking for fuel and electricity
- Eliminate manual calculation, including the derived metrics that are error-prone in a spreadsheet (consumption, cost/km, kWh price)
- Provide insight through dashboards and charts, not just data entry
- Work excellently on both phone and desktop — phone is the primary capture device (entries are logged at the pump)
- Allow several household members to share one dataset
- Be modular and extensible
- Be production-ready and, critically, **recoverable** (§19)

### 2.1 Non-goals (MVP)

Explicitly out of scope, to prevent scope drift:

- Currency conversion or FX rates
- Multiple households per user
- Offline / PWA / background sync
- Native mobile applications
- Receipt photo capture or OCR
- Budgets, forecasting, alerting
- Any utility other than electricity
- Public API for third-party clients

---

## 3. Technology Stack

### Frontend
- Next.js (App Router), React, TypeScript
- Tailwind CSS, shadcn/ui, Lucide icons
- React Hook Form + Zod
- TanStack Table
- Recharts
- next-intl

### Backend
- Next.js Server Actions and Route Handlers
- Prisma ORM

### Database
- **PostgreSQL 16+**
- Dev: Docker Compose; Prod: managed instance or co-located container

### Authentication
- Auth.js (NextAuth v5), Credentials provider
- bcrypt password hashing (cost factor 12)
- JWT sessions

### Supporting
- `decimal.js` (transitively via Prisma) for all monetary arithmetic
- SheetJS for XLSX (see §14 note on distribution)
- Vitest + Playwright (§20)

---

## 4. Core Principles

- Modular, feature-sliced architecture
- Responsive-first, designed mobile-up
- Strong typing end to end — no `any` at module boundaries
- **A single validation source of truth**: Zod schemas are shared between client form validation and server-side re-validation. Server-side validation is never skipped because the client already ran it.
- **Authorisation is enforced at the data-access layer**, not at the UI or route layer (§6.4)
- Accessibility: WCAG 2.1 AA target
- Clean Architecture / SOLID where they earn their keep, not dogmatically

---

## 5. Project Structure

Corrects the v1.0 layout, which placed `services/`, `lib/`, `types/` etc. **inside** `app/` — where every folder becomes a URL segment.

```
src/
  app/
    [locale]/
      (auth)/              login, register, accept-invite, reset-password
      (app)/
        dashboard/
        vehicles/
          [vehicleId]/
          fuel/
        utilities/
          electricity/
        settings/
          household/
          members/
          profile/
      layout.tsx
    api/
      auth/[...nextauth]/route.ts
      import/route.ts       file upload (multipart)
      export/route.ts       file download (streaming)

  modules/
    fuel/
      components/           entry form, table, vehicle cards
      server/               actions.ts, queries.ts, repository.ts
      domain/               consumption.ts, derivation.ts   <- pure, unit-tested
      schemas/              zod
      charts/
      types/
    utilities/
      (same shape)
    dashboard/
    household/

  shared/
    components/ui/          shadcn primitives
    components/             DataTable, EmptyState, MoneyInput, DateField...
    lib/                    prisma, auth, money, dates, format
    hooks/
    types/

  i18n/
    messages/{en,sr-Latn}.json
    routing.ts, request.ts

prisma/
  schema.prisma
  migrations/
  seed.ts
```

**Module contract.** A module owns its UI, Zod schemas, domain logic, data access, and charts. A module may import from `shared/`. **A module must not import from another module's internals** — cross-module needs go through that module's `server/queries.ts` public surface. The dashboard is a module that composes the read-only query surfaces of the others.

**Domain purity.** `modules/*/domain/` contains pure functions with no Prisma, no React, no I/O. This is where consumption, cost-per-km, and derivation live, and it is the part with the strictest test requirement (§20).

---

## 6. Households, Users & Authentication

### 6.1 Model

A **Household** owns all data. A **User** belongs to exactly one household and has a role.

| Role | Capabilities |
|---|---|
| `OWNER` | Everything a member can do, plus: invite/remove members, change roles, change household currency, delete the household, reset a member's password, export full data |
| `MEMBER` | Full read/write on vehicles, fuel entries, utility accounts and bills; edit own profile and locale |

Members are **not** restricted to editing only their own entries — this is a shared ledger, and one partner correcting the other's typo is a normal workflow. Every record stores `createdByUserId` for attribution, shown in the UI as "added by …".

> **Deliberate constraint:** one household per user. If multi-household is ever needed, the migration is a `HouseholdMember` join table carrying `role`; `User.householdId` and `User.role` move onto it. Nothing else in the schema changes, because all data is already keyed on `householdId`.

### 6.2 Registration and onboarding

Public self-registration is **disabled by default** (`ALLOW_PUBLIC_REGISTRATION=false`).

1. **Bootstrap:** if zero users exist, `/register` is open. The first user to register creates their household, becomes `OWNER`, and sets the household currency. Registration then closes.
2. **Invitation:** an owner invites by email. The system generates a single-use token (random 32 bytes; **only its SHA-256 hash is stored**), valid 7 days.
3. **Acceptance:** the invitee opens the link, sets name and password, and joins the household with the invited role.

If SMTP is not configured, the invite URL is displayed to the owner to share manually. This keeps the MVP deployable without an email provider.

### 6.3 Auth requirements

- Login, logout, session management, protected routes via middleware
- Session: JWT, 30-day sliding expiry, carrying `userId`, `householdId`, `role`
  - **Known constraint:** JWT claims are stale until refresh. Role changes and member removal must therefore be re-checked against the database on every mutation (see §6.4), not trusted from the token.
- Password policy: minimum 10 characters; checked against a common-password list; no composition rules
- **Rate limiting:** 5 failed attempts per account → 15-minute lockout (`failedLoginAttempts`, `lockedUntil`). Login responses must not reveal whether an email exists.
- Password reset: single-use hashed token, 1-hour expiry, via SMTP if configured; otherwise owner-initiated reset
- Architecture ready for OAuth providers — the Prisma adapter and `Account` table are in place from the start even though only Credentials is enabled

### 6.4 Authorisation (non-negotiable)

Every domain table carries `householdId` directly, including `FuelEntry` — which could reach it transitively via `Vehicle`. This denormalisation is deliberate: transitive ownership means every query must remember to join, and the one place it's forgotten is an IDOR.

**Requirement:** all reads and writes go through a repository layer that takes `householdId` from the server session and injects it into the `where` clause. No Server Action or Route Handler constructs a Prisma query directly. A mutation must confirm the session's user still exists, still belongs to that household, and still holds the required role.

---

## 7. Internationalisation & Localisation

Implemented from day one — retrofitting is disproportionately expensive.

- Library: **next-intl**, ICU message format
- Routing: **path prefix**, `/[locale]/...`, default `en` (unprefixed default is not used; explicit prefixes keep links shareable between household members with different locales)
- Languages: **English (`en`, default)** and **Serbian, Latin script (`sr-Latn`)**
  - *Confirmed intentional:* MKD currency support alongside Serbian rather than Macedonian.
- Locale is stored **per user**, so household members may read different languages against the same data
- Resolution order: user setting → `NEXT_LOCALE` cookie → `Accept-Language` → default

**Requirements:**
- No hardcoded user-facing strings anywhere, including Zod validation messages, toasts, empty states, chart axis labels, export column headers, and email templates
- Serbian plural forms use ICU `one`/`few`/`other` — English-style `count === 1` branching is not acceptable
- Locale-aware date, number and currency formatting via `Intl` (§8)
- Locale-aware sorting via `Intl.Collator` for vehicle names and free-text columns
- Adding a language must require only a new message file and a locale registry entry — no changes to business logic

**Enforcement:** CI fails on any key present in `en.json` but missing from `sr-Latn.json`, and on unused keys (§20).

---

## 8. Currency

- Currency is a **household-level** setting: `MKD` (default) or `EUR`
- Formatted with `Intl.NumberFormat(locale, { style: 'currency', currency })`
- Every monetary record additionally stores its own `currency` code at write time

### 8.1 The MKD symbol requires explicit handling

v1.0 specified the symbol **ден**. Plain `Intl` will not produce it for either supported locale — verified against ICU 78:

| Locale | MKD | EUR |
|---|---|---|
| `en` | `MKD 12,345.50` | `€12,345.50` |
| `sr-Latn` | `12.345,50 MKD` | `12.345,50 €` |
| `mk` *(not supported)* | `12.345,50 ден.` | `12.345,50 €` |

Only the Macedonian locale carries `ден`, and Macedonian is deliberately out of scope (§7). `currencyDisplay: 'narrowSymbol'` does not help.

**Requirement:** the shared money formatter uses `Intl.NumberFormat.prototype.formatToParts` and substitutes the `currency` part from a currency registry (`MKD → "ден"`, `EUR → "€"`), preserving the locale's own grouping, decimal separator and symbol placement. A raw `.format()` call on a monetary value is not permitted outside that helper, and adding a currency must mean adding one registry entry.

Note that `sr-Latn` correctly yields decimal-comma, dot-grouped output (`12.345,50`). This is the same convention the import parser must handle (§14.1) and confirms it is the household's working format.

**Rationale for per-record currency:** without it, an owner switching the household from MKD to EUR would silently reinterpret every historical amount as a different value. With it, that switch is detectable.

**MVP behaviour on currency change:** blocked if any monetary records exist, with an explanatory message. There is no FX conversion in scope (§2.1), so silently mixing currencies would corrupt every total. Post-MVP this can become a guided conversion at a user-supplied rate.

Currency applies to dashboard, statistics, tables, charts, and all exported files. Adding a currency must require only a registry entry.

---

## 9. Money, Dates & Units

The precision rules the v1.0 spec left undefined. These are the most common source of "the numbers don't tie out" bugs.

### 9.1 Money

| Value | Type | Precision |
|---|---|---|
| Bill amount, total paid | `Decimal` | `numeric(12,2)` |
| Fuel price per litre | `Decimal` | `numeric(10,3)` — e.g. `1.459` |
| Litres | `Decimal` | `numeric(10,3)` |
| Meter readings, consumption | `Decimal` | `numeric(12,3)` |

Postgres `numeric` is exact, so decimals are safe. (Under SQLite this would have required integer minor units throughout — one of the reasons for the change.)

**Rule:** Prisma returns `Decimal` objects. Never convert to `number` for arithmetic. Aggregate in SQL, or with `Decimal.js`. Conversion to `number` is permitted only at the final formatting boundary and when feeding Recharts.

### 9.2 Dates

Fuel dates, billing periods, due dates and payment dates are **calendar dates, not instants**. Stored as Postgres `date` (`@db.Date`), never `timestamptz`. A "3 March" entry must read as 3 March in every timezone. Only audit columns (`createdAt`, `updatedAt`) are timestamps.

### 9.3 Units

- Odometer: whole **kilometres**, integer
- Consumption: **L/100 km**
- Electricity: **kWh**; water/gas (future): **m³**
- Units are not user-configurable in the MVP but are stored explicitly on readings so they can become so.

---

## 10. Fuel Module

### 10.1 Vehicles

Fields: name, manufacturer, model, fuel type, licence plate, initial odometer, notes.

- Multiple vehicles per household
- Deletion: a vehicle with fuel entries is **archived**, not deleted (`archivedAt`). Archived vehicles are hidden from entry forms but retained in history and statistics. Hard delete is offered only when the vehicle has zero entries, or via an explicit "delete vehicle and all N entries" confirmation typed by the user.

### 10.2 Fuel entry

Fields: date, vehicle, odometer, fuel price, litres, total paid, **full tank (yes/no)**, **missed entries since last (yes/no)**, station, notes.

### 10.3 Value derivation

The user enters **any two** of {price, litres, total}; the third is computed live and marked as derived.

- `litres = totalPaid / fuelPrice`
- `totalPaid = fuelPrice × litres`
- `fuelPrice = totalPaid / litres`

If the user enters **all three** and they disagree, the entry is **saved anyway** with a non-blocking warning. Pumps round, and the receipt is the source of truth — blocking here would train users to enter fiction. A warning is shown when the discrepancy exceeds 0.5% or 2 minor currency units, whichever is larger.

`derivedField` records which value was computed, so re-editing the entry recomputes the same field rather than guessing.

### 10.4 Consumption calculation (normative)

This is the core value of the module and the thing a spreadsheet gets wrong. It must be implemented exactly as specified, in `modules/fuel/domain/consumption.ts`, as pure functions.

**Definitions.** For a given vehicle, order entries by `odometer` ascending, tie-broken by `date` then `createdAt`.

A **segment** is the span from one `isFullTank` entry (exclusive) to the next `isFullTank` entry (inclusive).

For a segment ending at full-tank entry *E* and beginning at the previous full-tank entry *S*:

- `distance = odometer(E) − odometer(S)`
- `litres = Σ litres of every entry after S through E` (this correctly includes intervening partial fills)
- `cost = Σ totalPaid of those same entries`
- `consumption (L/100km) = litres / distance × 100`
- `costPerKm = cost / distance`

**A segment is invalid and must be excluded if any of the following hold:**
- either boundary entry is not a full tank
- any entry within the segment has `missedEntries = true`
- `distance ≤ 0` (odometer not increasing — data error or odometer reset)
- the segment spans the vehicle's first-ever entry

**Vehicle aggregates are distance-weighted, never a mean of segment means:**

```
averageConsumption = Σ(segment litres) / Σ(segment distance) × 100
averageCostPerKm   = Σ(segment cost)   / Σ(segment distance)
```

**Transparency requirement.** Wherever a consumption or cost-per-km figure is displayed, the UI must disclose its basis — "based on 14 of 21 entries" — with a tooltip explaining which entries were excluded and why. Showing a confidently wrong number is worse than the spreadsheet.

**Insufficient data.** A vehicle with fewer than two valid full-tank entries shows an explanatory empty state, not `0` and not `—`.

### 10.5 Statistics

Total spending, total litres, monthly/yearly spending, monthly/yearly litres, average fuel price (litre-weighted, not a mean of prices), average consumption, cost per km, cost per 100 km, total distance.

### 10.6 Charts

Fuel price history, monthly spending, monthly litres, odometer/mileage over time, average consumption trend by segment.

---

## 11. Utilities Module (Electricity in MVP)

Generalised so that §17 utilities are configuration, not new code.

### 11.1 Utility account

A household has one or more accounts, each of a `utilityType`. The MVP enables only `ELECTRICITY`; the others exist in the enum but are hidden behind a feature flag.

Fields: type, name ("Home electricity"), provider, account number, meter number, tracks-readings flag, unit, notes, archived.

### 11.2 Bill

Fields: account, period from, period to, issue date, due date, amount, payment date, invoice number, notes.

- **Payment status is derived, never stored:**
  - `PAID` — `paymentDate` is not null
  - `OVERDUE` — unpaid and `dueDate < today`
  - `UNPAID` — otherwise
- `year` is **not** stored; it is derived from `periodFrom` and indexed as needed
- `@@unique([accountId, periodFrom, periodTo])` prevents duplicate entry and duplicate import

### 11.3 Meter readings

Zero or more readings per bill, one per tariff band.

**Confirmed for this household: electricity is billed dual-tariff, and the bill carries meter readings.** Dual tariff is therefore the MVP default path, not an optional branch — the electricity account is seeded with `tracksReadings = true`, `unit = KWH`, and the bill form renders `HIGH` and `LOW` reading pairs by default.

- Bands: `HIGH` / `LOW` for dual-tariff electricity; `SINGLE` retained for single-rate accounts and future utilities
- Per band: previous reading, current reading, consumption (derived and stored), unit
- Validation:
  - `currentReading ≥ previousReading` unless `meterRollover` is set
  - on a dual-tariff account, **both** bands are required — a bill with only one band is rejected, since a missing band silently understates consumption and inflates price per kWh
  - `SINGLE` and `HIGH`/`LOW` are mutually exclusive on the same bill
- An account may have `tracksReadings = false` (internet, mobile), in which case the bill has no readings and consumption metrics are hidden rather than shown as zero

Derived metrics: **kWh consumed** (high + low), **effective price per kWh** (`amount / totalConsumption`), **per-band consumption**, and the **high/low usage ratio** — the last being the metric that tells the household whether shifting load into the low-tariff window is worth it.

**Entry ergonomics.** The previous reading for each band pre-fills from the preceding bill on the same account, so a normal month is four numbers plus an amount.

### 11.4 Statistics

Current month, current year, total paid, total unpaid, count and value of overdue bills, next payment due, average monthly bill, highest bill, lowest bill, average price per kWh, total kWh by year.

### 11.5 Charts

Monthly expenses, yearly expenses, paid vs. unpaid, expense trend, **kWh consumption vs. cost** (dual axis), high/low tariff split.

---

## 12. Dashboard

**Household header:** current month total across all modules, current year total, outstanding unpaid utilities.

**Vehicle summary** (per vehicle, plus combined): total spent, total litres, average fuel price, average consumption *(with basis disclosure per §10.4)*, cost per km, cost per 100 km, total distance, last refuel date and amount.

**Electricity summary:** current month, current year, unpaid invoice count and total, next payment due with days remaining, total yearly expense, year-over-year delta.

**Recent activity:** latest fuel entries and latest bills, each attributed to the member who added it.

**Empty states:** the dashboard must be useful and welcoming with zero data — prompting the first vehicle and first bill, not rendering a grid of zeros.

---

## 13. Search, Filtering & Tables

Filters: vehicle, utility account, month, year, date range, payment status, full-tank-only, added-by member.

All tables: server-side sorting, filtering and pagination via TanStack Table. Filter state is reflected in the URL query string so a filtered view is shareable and survives refresh.

**Mobile:** tables collapse to card lists below the `md` breakpoint. Horizontal scrolling of a data table on a phone is not acceptable — entries are logged at the pump.

---

## 14. Import & Export

### 14.1 Import (Phase 4)

**Formats:** XLSX and CSV.

> Legacy `.xls` is dropped from the MVP. It is a distinct binary format requiring separate handling, and its presence in the source data is unconfirmed. **Action required:** provide representative sample spreadsheets before this phase begins — the column-mapping design depends on them.

**Workflow:** Upload → **Column mapping** → Preview → Validation → Confirmation → Import.

The column-mapping step was absent from v1.0 and is the substance of the feature: the user maps their spreadsheet's headers onto the target fields, with the mapping remembered per household for re-import.

**Parsing requirements — the actual difficulty:**
- **Decimal comma**: `1.234,56` and `1,45` must parse correctly. This is the default in sr/mk locales and will be present in the source files.
- **CSV delimiter detection**: `;` is the norm when the decimal separator is `,`
- **Excel serial dates**, plus ambiguous `dd/mm` vs `mm/dd` — resolved explicitly in the mapping step, never guessed
- **Encoding**: UTF-8 and Windows-1250, BOM handling
- **Duplicate detection** against natural keys (§10, §11.2) with per-row skip/overwrite
- Row-level validation with a downloadable error report; a partially invalid file imports its valid rows if the user confirms
- Import runs in a transaction per batch and is fully reversible via an import log

**Library note:** the `xlsx` package on the public npm registry is stale; SheetJS distributes current versions from its own CDN. Pin deliberately and document the source.

### 14.2 Export

**MVP:** Excel (XLSX) and CSV, honouring the active filters, the user's locale and the household currency.

**PDF: deferred to post-MVP.** It is the heaviest dependency in the list and requires an embedded font subset — the standard PDF font set cannot render `ć`, `č`, `đ`, and the report would silently mangle Serbian text. XLSX and CSV cover the actual need.

**Full data export** (owner only, all household data as XLSX) is required for MVP as part of §19 — this is distinct from filtered report export.

---

## 15. Database Model

PostgreSQL via Prisma. Abbreviated for readability; audit columns (`createdAt`, `updatedAt`) are on every model.

```prisma
enum Role            { OWNER MEMBER }
enum Locale          { EN SR_LATN }
enum Currency        { EUR MKD }
enum FuelType        { PETROL DIESEL LPG CNG ELECTRIC HYBRID }
enum UtilityType     { ELECTRICITY WATER GAS INTERNET MOBILE }
enum TariffBand      { SINGLE HIGH LOW }
enum MeasurementUnit { KWH M3 }
enum DerivedField    { NONE FUEL_PRICE LITERS TOTAL_PAID }

model Household {
  id        String   @id @default(cuid())
  name      String
  currency  Currency @default(MKD)
  members   User[]
  // + invitations, vehicles, fuelEntries, utilityAccounts, utilityBills
}

model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  name                String
  passwordHash        String
  locale              Locale    @default(EN)
  role                Role      @default(MEMBER)
  householdId         String
  household           Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  failedLoginAttempts Int       @default(0)
  lockedUntil         DateTime?
  lastLoginAt         DateTime?
  @@index([householdId])
}

model Invitation {
  id              String   @id @default(cuid())
  householdId     String
  email           String
  tokenHash       String   @unique   // SHA-256; raw token never stored
  role            Role     @default(MEMBER)
  expiresAt       DateTime
  acceptedAt      DateTime?
  createdByUserId String
  @@index([householdId])
}

model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
}

model Vehicle {
  id              String    @id @default(cuid())
  householdId     String
  name            String
  manufacturer    String?
  model           String?
  fuelType        FuelType
  licensePlate    String?
  initialOdometer Int       @default(0)   // km
  notes           String?
  archivedAt      DateTime?
  fuelEntries     FuelEntry[]
  @@index([householdId, archivedAt])
}

model FuelEntry {
  id              String       @id @default(cuid())
  householdId     String                          // denormalised: see §6.4
  vehicleId       String
  createdByUserId String
  date            DateTime     @db.Date           // calendar date: see §9.2
  odometer        Int                             // whole km
  fuelPrice       Decimal      @db.Decimal(10, 3)
  liters          Decimal      @db.Decimal(10, 3)
  totalPaid       Decimal      @db.Decimal(12, 2)
  currency        Currency
  isFullTank      Boolean      @default(true)     // required for §10.4
  missedEntries   Boolean      @default(false)    // breaks the segment chain
  derivedField    DerivedField @default(NONE)
  station         String?
  notes           String?
  @@unique([vehicleId, date, odometer])           // import dedup key
  @@index([householdId, date])
  @@index([vehicleId, odometer])
}

model UtilityAccount {
  id             String           @id @default(cuid())
  householdId    String
  utilityType    UtilityType
  name           String
  provider       String?
  accountNumber  String?
  meterNumber    String?
  tracksReadings Boolean          @default(false)
  unit           MeasurementUnit?
  archivedAt     DateTime?
  bills          UtilityBill[]
  @@index([householdId, utilityType])
}

model UtilityBill {
  id              String    @id @default(cuid())
  householdId     String
  accountId       String
  createdByUserId String
  periodFrom      DateTime  @db.Date
  periodTo        DateTime  @db.Date
  issueDate       DateTime? @db.Date
  dueDate         DateTime  @db.Date
  amount          Decimal   @db.Decimal(12, 2)
  currency        Currency
  paymentDate     DateTime? @db.Date              // null => unpaid; status derived
  invoiceNumber   String?
  notes           String?
  readings        UtilityBillReading[]
  @@unique([accountId, periodFrom, periodTo])
  @@index([householdId, periodFrom])
  @@index([householdId, paymentDate])
}

model UtilityBillReading {
  id              String          @id @default(cuid())
  billId          String
  band            TariffBand      @default(SINGLE)
  previousReading Decimal         @db.Decimal(12, 3)
  currentReading  Decimal         @db.Decimal(12, 3)
  consumption     Decimal         @db.Decimal(12, 3)
  unit            MeasurementUnit
  meterRollover   Boolean         @default(false)
  @@unique([billId, band])
}
```

Auth.js `Account` and `Session` tables are included per the Prisma adapter, enabling future OAuth without a migration.

**Cascade rules:** deleting a household cascades to everything. Deleting a vehicle or utility account is restricted while children exist — the application offers archive, or an explicitly confirmed cascade (§10.1).

---

## 16. Server Interface

**Change from v1.0.** v1.0 specified a REST API. With App Router + RSC, that means writing every read twice — once as an endpoint, once as a component fetch — for no consumer, since no mobile client is in scope (§2.1).

**MVP approach:**

| Concern | Mechanism |
|---|---|
| Reads | React Server Components calling `modules/*/server/queries.ts` |
| Mutations | Server Actions in `modules/*/server/actions.ts` |
| Auth | Auth.js at `/api/auth/[...nextauth]` |
| Import upload | Route Handler `POST /api/import` (multipart) |
| Export download | Route Handler `GET /api/export` (streaming) |

> Note on v1.0 §16: `POST /api/auth/login` and `/api/auth/logout` were listed as endpoints to build. Auth.js owns `/api/auth/*` and provides sign-in/sign-out itself; only registration and invite acceptance are ours.

**Every Server Action must:** resolve the session server-side, re-verify household membership and role against the database, parse input with the shared Zod schema, execute via the household-scoped repository, and `revalidatePath` on success.

**Contracts.** Actions return a discriminated union — `{ ok: true, data }` or `{ ok: false, error, fieldErrors? }`. `fieldErrors` are i18n message *keys*, never pre-translated strings, so the client renders them in the user's locale.

**Should a REST API become necessary**, the `server/queries.ts` and `server/actions.ts` surfaces are the layer to expose. No rewrite is implied by this decision.

---

## 17. UX/UI

Reference points: Notion, Linear, Stripe Dashboard, Vercel.

- Minimalist, generous whitespace, large cards
- Light and dark mode, respecting `prefers-color-scheme` with a manual override
- Lucide icons
- Considered empty states throughout — first-run, no-results-for-filter, and insufficient-data-for-metric are three different states with three different messages
- Optimistic UI on mutations, with rollback and a clear error toast on failure
- Forms optimised for phone entry: numeric keypads (`inputMode="decimal"`), sensible defaults (today's date, last-used vehicle, odometer pre-filled above the previous reading), minimal required fields
- Destructive actions require confirmation naming the specific object and the count of affected records

**Accessibility (WCAG 2.1 AA):** keyboard-navigable throughout, visible focus rings, labelled form controls, 4.5:1 contrast minimum, live-region announcements for async results.

> **Known tension:** Recharts has weak accessibility. Every chart must therefore be accompanied by an accessible tabular representation of the same data — visually hidden or behind a "view as table" toggle. Charts must not be the sole carrier of information, and must not use colour alone to distinguish series.

---

## 18. Non-Functional Requirements

Absent from v1.0 entirely.

**Performance.** Dashboard interactive within 2s on a mid-range phone over 4G. Table pagination and filter response under 300ms server-side. Statistics are computed via SQL aggregation, not by loading all rows into memory.

**Scale.** Design target: 10 years of history — roughly 2,000 fuel entries and 500 bills per household. This is small; correctness and clarity take priority over optimisation, but N+1 queries in list views are still not acceptable.

**Browsers.** Current and previous major versions of Chrome, Firefox, Safari and Edge. iOS Safari and Chrome Android explicitly included. No IE11.

**Security.** HTTPS only; `Secure`/`HttpOnly`/`SameSite=Lax` cookies; CSRF protection on Server Actions (Next.js built-in); Content-Security-Policy header; no secrets in client bundles; file uploads capped at 10 MB and validated by content type; Prisma parameterisation throughout (no raw SQL string interpolation); dependency audit in CI.

**Reliability.** Server-side error logging with request correlation IDs. No stack traces or Prisma errors surfaced to the client. Unhandled errors render a localised error boundary.

**Configuration.** All environment variables validated by a Zod schema at boot; the application refuses to start with an invalid or incomplete configuration rather than failing at first request.

---

## 19. Backup & Recovery

**A first-class requirement, not an operational footnote.** Moving off Excel means moving from a file the household can copy and email to a database they cannot. If data loss is possible, this application is a downgrade regardless of its features.

- **Automated:** nightly `pg_dump`, 30-day retention, stored off the application host
- **Restore:** a documented, **tested** restore procedure — an untested backup is not a backup. Restoring into a clean environment is part of the Phase 0 exit criteria.
- **User-facing:** owner-triggered "export all household data" to XLSX, on demand, containing every record in a re-importable shape (§14.2). This is the household's own copy and their escape hatch.
- **Migrations:** all schema changes via Prisma migrations, committed, forward-only, tested against a production-shaped dump before deployment.

---

## 20. Testing Strategy

| Layer | Tool | Requirement |
|---|---|---|
| Domain logic | Vitest | **90%+ coverage, mandatory.** Consumption segmentation (§10.4), value derivation (§10.3), payment-status derivation, money arithmetic, date normalisation. Pure functions, no mocks needed. |
| Validation | Vitest | Every Zod schema: boundaries, decimal-comma input, negative and zero values |
| Data access | Vitest + test DB | Household scoping — **explicit tests proving cross-household reads return nothing** |
| Server Actions | Vitest | Auth guards, role enforcement, error contracts |
| Import parsing | Vitest | Fixture files: decimal comma, `;` delimiter, Excel serials, Windows-1250, malformed rows |
| Critical flows | Playwright | Register → create household → invite → add vehicle → log refuel → see consumption on dashboard |
| i18n | Custom CI check | Key parity between locales; no hardcoded user-facing strings |
| Accessibility | axe-core in Playwright | Zero critical violations on every page |

**Reference dataset.** A hand-verified fixture of ~30 fuel entries across two vehicles — including partial fills, a missed entry, and an odometer anomaly — with independently calculated expected consumption figures. Passing this is the definition of "consumption works". This must be built during Phase 1, before the calculation code.

---

## 21. Implementation Phases

### Phase 0 — Foundation
Repository, tooling, Docker Compose Postgres, Prisma schema and initial migration, seed script. Auth.js with credentials, registration bootstrap, invitations, household creation, member management, protected routes, rate limiting. next-intl wiring with both locales. Currency formatting utilities. shadcn/ui setup, app shell, navigation, theme toggle. CI: lint, typecheck, test, i18n parity. Backup and **tested restore**.

**Exit criteria:** two users share a household, sign in, see an empty dashboard in their own languages, and the database can be dropped and restored from backup.

> Sequencing note: i18n, currency and household scoping are all in Phase 0 by design. Each is prohibitively expensive to retrofit — i18n because it touches every string, household scoping because it touches every query.

### Phase 1 — Fuel
Vehicle CRUD with archiving. Fuel entry CRUD with live derivation. The consumption engine and its reference dataset (§20). Fuel tables with filter, sort, pagination, and mobile card layout. Fuel statistics and charts.

**Exit criteria:** the reference dataset produces hand-verified figures; basis disclosure is visible on every derived metric.

### Phase 2 — Electricity
Utility account CRUD. Bill CRUD with meter readings and dual tariff. Derived payment status and overdue detection. Bill tables, filters, statistics and charts including kWh vs. cost.

**Exit criteria:** a year of real bills entered and reconciled against the existing spreadsheet.

### Phase 3 — Dashboard
Cross-module aggregation, KPI cards, recent activity with attribution, empty and insufficient-data states, mobile layout, accessible chart tables.

### Phase 4 — Import & Export
XLSX/CSV import with column mapping, preview, validation, duplicate detection and reversible batches. XLSX/CSV export honouring filters and locale. Full household data export.

**Blocked on:** representative sample spreadsheets (§14.1).

### Post-MVP backlog
PDF export with embedded fonts · additional utilities (water, gas, internet, mobile) · OAuth providers · currency conversion · multi-household · vehicle servicing, insurance, registration · budgets · receipt capture.

---

## 22. Acceptance Criteria

Replacing v1.0's unverifiable criteria ("works flawlessly", "clean, maintainable and production-ready") with testable ones.

**Functional**
1. Two users in one household sign in independently and both see and edit the same vehicles, entries and bills.
2. An owner invites a member by email; the invite expires after 7 days; an accepted invite cannot be reused.
3. A user in `sr-Latn` and a user in `en` see the same data in their own language, with correctly pluralised Serbian counts and locale-correct dates, numbers and currency.
4. Fuel entry accepts any two of {price, litres, total} and computes the third; entering all three with a discrepancy warns without blocking.
5. **Consumption matches the reference dataset exactly**, correctly excluding partial-fill and missed-entry segments, and discloses its basis in the UI.
6. A dual-tariff electricity bill records high and low readings and reports kWh and effective price per kWh.
7. Payment status and overdue state are correct relative to today's date, with no stored status column.
8. XLSX and CSV import correctly parses decimal commas, `;` delimiters, Excel serial dates and Windows-1250 encoding; duplicates are detected; a partial import is reversible.
9. XLSX and CSV export reflects active filters, user locale and household currency.
10. Changing household currency while monetary records exist is blocked with an explanatory message.

**Quality**
11. Domain-logic test coverage ≥ 90%; full suite green in CI.
12. Automated tests prove a user cannot read or mutate another household's records by ID.
13. Zero critical axe-core violations on every page; all primary flows completable by keyboard alone.
14. CI fails on any missing translation key; a repository scan finds no hardcoded user-facing strings.
15. Every screen is usable at 375px width with no horizontal page scroll; data tables render as cards on mobile.
16. `tsc --noEmit` and `eslint` pass with zero errors and zero `any` at module boundaries.
17. A production backup restores into a clean environment with zero data loss, demonstrated end to end.
18. Dashboard is interactive within 2s on a mid-range phone over throttled 4G.

---

## 23. Open Questions

1. **Hosting target** — managed Postgres (Neon/Supabase) versus a self-hosted VPS or home server? Determines the backup mechanism in §19 and the deployment pipeline. *(Does not block Phase 0.)*
2. **SMTP provider** — configured, or ship with manual invite-link sharing and owner-initiated password reset (§6.2)?
3. **Sample spreadsheets** — required before Phase 4 (§14.1). Also worth reviewing early: they may reveal fields this spec omits.
4. **Historical data volume** — how many years of fuel and electricity records are being migrated?

### Resolved

| Question | Answer | Affects |
|---|---|---|
| Language pairing — Serbian alongside MKD, no Macedonian | Intentional | §7 |
| Multi-user shape | **Shared household**, not isolated tenants | §6, §15 — the largest change in v1.1 |
| Database | **PostgreSQL** | §3, §9, §15 |
| Electricity tariff | **Dual-tariff with meter readings on the bill** | §11.3, §11.4, §11.5 |
| Household currency | **MKD** by default, EUR selectable | §8, §15 |
