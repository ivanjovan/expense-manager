# Software Requirements Specification (SRS)

# Personal Expense & Utility Tracker (Working Title)

> Version: 1.0 (MVP)

## 1. Vision

Build a modern, responsive web application that replaces Excel
spreadsheets used to track:

-   Vehicle fuel expenses
-   Electricity bills

The application must provide a significantly better user experience than
Excel while being designed around a **modular architecture**, allowing
future modules to be added without major refactoring.

The MVP focuses only on **Fuel Tracking** and **Electricity Tracking**.

------------------------------------------------------------------------

# 2. Goals

-   Replace manual Excel tracking
-   Reduce manual calculations
-   Provide meaningful insights through dashboards and charts
-   Offer an excellent desktop and mobile experience
-   Support multiple users
-   Be modular and easily extensible
-   Be production-ready

------------------------------------------------------------------------

# 3. Technology Stack

## Frontend

-   Next.js
-   React
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   React Hook Form
-   Zod
-   TanStack Table
-   Recharts

## Backend

-   Next.js API Routes
-   Prisma ORM

## Database

-   SQLite

## Authentication

-   Auth.js (NextAuth)
-   Email/password authentication
-   bcrypt password hashing

------------------------------------------------------------------------

# 4. Core Principles

-   Modular architecture
-   Responsive-first
-   Mobile-friendly
-   Reusable components
-   Strong typing
-   Clean Architecture
-   SOLID where appropriate
-   Accessibility
-   High usability

------------------------------------------------------------------------

# 5. Modular Architecture

    app/
      dashboard/
      vehicles/
        fuel/
      utilities/
        electricity/
      settings/
      shared/
      components/
      services/
      lib/
      hooks/
      types/

Each module must encapsulate: - UI - Services - Validation - Database
access - Charts

Future modules should be plug-and-play.

------------------------------------------------------------------------

# 6. Authentication

Features: - Register - Login - Logout - Session management - Protected
routes

Architecture should be ready for future OAuth providers.

------------------------------------------------------------------------

# 7. Internationalization (i18n) & Localization (l10n)

Internationalization must be implemented from the beginning.

Recommended library: - next-intl

Supported languages: - English (default) - Serbian (Latin)

Requirements: - No hardcoded UI strings - Every label, button, menu,
validation message and notification must be translatable - Language
switcher in Settings - Persist selected language per user

Architecture must allow adding new languages without changing business
logic.

Localization requirements: - Localized date formatting - Localized
number formatting - Localized currency formatting - Locale-aware sorting
where applicable

------------------------------------------------------------------------

# 8. Currency Support

User configurable currency.

Initially supported: - EUR (€) - MKD (ден)

Use Intl.NumberFormat.

Currency must automatically be reflected in: - Dashboard - Statistics -
Reports - Tables - Charts - Exported files

Architecture must support adding more currencies.

------------------------------------------------------------------------

# 9. Dashboard

Vehicle summary: - Total spent - Total liters - Average fuel price -
Average consumption - Cost per km - Cost per 100 km - Last refuel

Electricity summary: - Current month - Current year - Unpaid invoices -
Next payment - Total yearly expenses

Recent activity: - Latest fuel entries - Latest electricity bills

------------------------------------------------------------------------

# 10. Fuel Module

Support multiple vehicles.

Vehicle: - Name - Manufacturer - Model - Fuel type - Notes

Fuel entry: - Date - Vehicle - Odometer - Fuel price - Total paid -
Liters

Automatic calculations: - Price + Total = Liters - Price + Liters =
Total

Statistics: - Total spending - Total liters - Monthly/yearly spending -
Monthly/yearly liters - Average fuel price - Average consumption - Cost
per km - Cost per 100 km

Charts: - Fuel price history - Monthly spending - Monthly liters -
Mileage - Average consumption

------------------------------------------------------------------------

# 11. Electricity Module

Fields: - Period From - Period To - Year - Amount - Payment status - Due
date - Payment date - Notes

Statistics: - Current month - Current year - Total paid - Total unpaid -
Average monthly bill - Highest bill - Lowest bill

Charts: - Monthly expenses - Yearly expenses - Paid vs unpaid - Expense
trend

------------------------------------------------------------------------

# 12. Import & Export

Import: - XLSX - XLS - CSV

Workflow: 1. Upload 2. Preview 3. Validation 4. Confirmation 5. Import

Export: - Excel - CSV - PDF

------------------------------------------------------------------------

# 13. Search & Filtering

Support: - Vehicle - Month - Year - Date range - Payment status

All tables: - Sorting - Filtering - Pagination

------------------------------------------------------------------------

# 14. UX/UI

Inspired by: - Notion - Linear - Stripe Dashboard - Vercel

Requirements: - Minimalistic design - Large cards - Plenty of
whitespace - Responsive layout - Fast interactions - Light & Dark mode -
Lucide icons - Excellent empty states - Optimized forms

------------------------------------------------------------------------

# 15. Database Model (High-Level)

## User

-   id
-   name
-   email
-   passwordHash
-   language
-   currency
-   createdAt

## Vehicle

-   id
-   userId
-   name
-   manufacturer
-   model
-   fuelType
-   notes

## FuelEntry

-   id
-   vehicleId
-   date
-   odometer
-   fuelPrice
-   liters
-   totalPaid

## ElectricityBill

-   id
-   userId
-   periodFrom
-   periodTo
-   year
-   amount
-   paymentStatus
-   dueDate
-   paymentDate
-   notes

------------------------------------------------------------------------

# 16. REST API

Authentication: - POST /api/auth/register - POST /api/auth/login - POST
/api/auth/logout

Vehicles: - GET/POST /api/vehicles - GET/PUT/DELETE /api/vehicles/{id}

Fuel: - GET/POST /api/fuel - GET/PUT/DELETE /api/fuel/{id}

Electricity: - GET/POST /api/electricity - GET/PUT/DELETE
/api/electricity/{id}

Settings: - GET /api/settings - PUT /api/settings

------------------------------------------------------------------------

# 17. Future Modules

Vehicles: - Service history - Insurance - Registration - Tires - Repairs

Utilities: - Water - Gas - Internet - Mobile

Finance: - Income - Expenses - Budget

Home: - Maintenance - Appliances

------------------------------------------------------------------------

# 18. Acceptance Criteria

The MVP is complete when: - Multi-user authentication works - Fuel
tracking is complete - Electricity tracking is complete - Dashboard
displays meaningful KPIs - Interactive charts work - Excel import/export
works - PDF/CSV export works - English and Serbian are fully localized -
EUR and MKD are supported - Responsive UI works flawlessly - Modular
architecture allows adding future modules with minimal changes - Code is
clean, maintainable and production-ready
