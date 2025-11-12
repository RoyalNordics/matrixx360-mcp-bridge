MatriXx360 – Master Build Specification
Full system specification for the Facility Management platform.

⸻

MatriXx360 is a multi-tenant Facility Management system that manages customers, locations, services, vendors, and operational transitions within a single architecture.

FLOW SUMMARY
	1.	Create Customer → define contracts and organization.
	2.	Add Locations → assign FM staff and contacts.
	3.	Attach Service Modules → define operational categories (cleaning, canteen, elevators…).
	4.	Assign Vendors → connect approved suppliers with competencies.
	5.	Execute Transition → move customer from onboarding to operational status.
	6.	Monitor Dashboard → compliance, KPIs, SLA, performance.
	7.	Configure Settings → categories, validation rules, permissions.

⸻

ARCHITECTURE
Frontend: React + Vite + TypeScript
Backend: Express.js + Prisma + PostgreSQL
Validation: Zod schemas
Auth: Header-based RBAC (x-tenant-id, x-user-role)
Hosting: Render
CI/CD: Auto-Commit + Auto-Deploy (OpenAI → Git → Render)

⸻

CUSTOMER MODULE
Purpose: Manage FM customers, contracts, and organization structure.
Fields: id, name, cvr, contractNumber, startDate, endDate, status (ACTIVE | ONBOARDING | ENDED), organizationStructure (JSON), primaryContactId, createdAt, updatedAt
Relations: hasMany → Location, Transition, Document
Rules: Customer must exist before creating locations.

⸻

LOCATION MODULE
Purpose: Manage customer sites and personnel.
Fields: id, name, address, postalCode, city, country, customerId (FK), siteManagerId (FK), status (ACTIVE | INACTIVE), createdAt, updatedAt
Relations: belongsTo → Customer; hasMany → ServiceModule, Transition
Rules: Each active location must have at least one active service module.

⸻

SERVICE MODULE
Purpose: Represent each FM service.
Fields: id, name, category, subCategory, locationId (FK), vendorId (FK), status (PENDING | ACTIVE | OUT_OF_SERVICE), docStatus (OK | MISSING | EXPIRED | PENDING), criticality (LOW | MEDIUM | HIGH), nextServiceDate, lastServiceDate, serviceLog (JSON), createdAt, updatedAt
Relations: belongsTo → Location, Vendor; hasMany → Document
Rules: Valid vendor and docStatus=OK before activation. nextServiceDate ≥ lastServiceDate.

⸻

VENDOR MODULE
Purpose: Manage suppliers and capabilities.
Fields: id, name, cvr, contactPerson, email, phone, status (PREFERRED | APPROVED | PENDING), competencies (JSON), approvedCategories (array), createdAt, updatedAt
Relations: hasMany → ServiceModule, Document
Rules: Competency must match module category. Only one primary vendor per module.

⸻

TRANSITION MODULE
Purpose: Control onboarding to operational readiness.
Fields: id, customerId, locationId, startDate, endDate, status (IN_PROGRESS | READY | COMPLETED), responsibles (JSON), createdAt, updatedAt
Relations: belongsTo → Customer, Location; hasMany → ServiceModule
Rules: All modules must have status=ACTIVE and docStatus=OK before READY.

⸻

DASHBOARD / COMPLIANCE MODULE
Purpose: Show overall performance and compliance metrics.
Aggregated data: complianceScore, totalVendors, missingDocuments, overdueServices, transitionReadiness, activeModules, inactiveModules
Features: Export CSV/PDF, KPI/SLA display, vendor performance.

⸻

SETTINGS MODULE
Purpose: Configure categories, roles, and validation logic.
Functions: Define service and vendor categories, configure required fields per category, manage user roles (ADMIN, FM_MANAGER, SITE_MANAGER, CLIENT, VENDOR), set KPI/SLA thresholds and validation templates.

⸻

DEPENDENCY MAP
Customer – none
Location – depends on Customer
ServiceModule – depends on Location and Vendor
Vendor – depends on Settings
Transition – depends on Customer, Location, ServiceModule
Dashboard – aggregates all modules
Settings – global configuration

⸻

WORKFLOW LOGIC
	1.	Customer onboarding: create customer → add locations → add service modules.
	2.	Operational readiness: validate each module; if valid, activate.
	3.	Transition: all modules validated → mark READY → move to operational.
	4.	Monitoring: dashboard aggregates KPI, SLA, compliance.
	5.	Continuous improvement: failed validations create new tasks.

⸻

BUILD & DEPLOY LOGIC
Build flow: read Bible & tasks, execute sequentially, run TS validation and tests, if all green → commit and deploy.
Commit policy: trigger after each completed task or ≥10 modified files. Branch: main. Message: “Auto-commit: [task-id] – all tests green ✅”.
Deploy policy: trigger after successful commit, only if test coverage ≥95 %, call render_deploy().

⸻

TESTING
Unit tests: routes, validation, middleware.
Integration: relationships, dependency flow.
E2E: onboarding → transition completion.
Error contract: { ok:false, errors:[{ code:“VALIDATION_ERROR”, field:“vendorId”, message:“Vendor not found” }] }

⸻

AUTO-COMMIT LOOP
If testsPass → git_commit_and_push(branch:“main”, commitMessage:“Auto-commit: task complete ✅”, files:modifiedFiles) → render_deploy().
Else retry three times, then log failure and continue.

⸻

API ROUTES (examples)
POST /api/customers
GET /api/locations/:id/modules
POST /api/modules/:id/activate
POST /api/vendors/:id/assignments
GET /api/dashboard/compliance

⸻

REPORTING
Compliance report → missing docs, overdue services.
Transition readiness → percent modules ready.
Vendor performance → KPI and SLA adherence.
Export → CSV or PDF.

⸻

ROLES & PERMISSIONS
ADMIN – full CRUD + settings.
FM_MANAGER – manage customers, locations, modules.
SITE_MANAGER – manage assigned sites.
VENDOR – manage assigned modules, upload docs.
CLIENT – read-only.

⸻

FILE STRUCTURE
/src/routes
/src/controllers
/src/middleware
/src/prisma
/src/tests
/src/utils
/src/types
/docs/matrixx360_master_spec.md

⸻

PURPOSE
MatriXx360 unifies all FM processes in one environment.
It provides customer and contract control, service and vendor management, compliance and KPI visibility, and automated testing, commit, and deployment through OpenAI automation.
Objective: deliver a self-maintaining FM ecosystem that continuously validates, commits, and deploys itself through AI-driven automation.
