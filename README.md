# Paras AI

AI-assisted mobile app builder foundation.

## V1 — Core
- Signup, login and logout
- PostgreSQL users, projects and sessions
- HTTP-only session authentication
- Health endpoint

## V2 — Builder
- Natural-language idea to app specification
- Screen and feature inference
- Project dashboard APIs
- Generated Flutter/Dart code preview
- Project update/delete APIs

## V3 — Build system
- PostgreSQL build queue/history
- Build status APIs
- GitHub Actions Android APK + AAB workflow
- Workflow artifacts

## V4 — Product operations
- Settings/configuration status
- Admin statistics
- Persistent build records
- Environment-based secrets

## V5 — Expansion
Ready to connect:
- Real LLM provider via OPENAI_API_KEY
- GitHub automation via GITHUB_TOKEN
- Automated workflow dispatch/artifact linking
- Visual screen editor/live preview
- Billing/subscriptions
- Self-healing retries
- Artifact storage

## Run
```bash
bun install
bun run start
```

Environment:
```
DATABASE_URL=postgresql://...
PORT=3000
ADMIN_EMAIL=admin@example.com
OPENAI_API_KEY=...
GITHUB_TOKEN=...
```

## Android builds
GitHub Actions → **Paras AI Android Build** → Run workflow.

Inputs:
- app_name
- screens

Outputs:
- release APK
- release AAB

No secret keys are committed to this repository.
