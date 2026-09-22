# Paras AI

Paras AI is an agent-first app builder: describe an app, let the coding agent plan it, create/edit project files, and keep the project persisted in PostgreSQL.

## Current agent capabilities
- Signup/login/logout with HTTP-only sessions
- Persistent projects in PostgreSQL
- Replit-style agent workspace UI
- Autonomous coding loop using the OpenAI Responses API
- Tool calls for `list_files`, `read_file`, `write_file`, and `delete_file`
- Project file persistence in PostgreSQL
- Agent run history and summaries
- File browser and code preview
- Existing Android build queue API retained for the next build-worker stage

## Roadmap
### V1 — Agent core
Idea → AI plan → files → summary.

### V2 — Coding workspace
Live file diffs, richer project templates, preview, and iterative edit requests.

### V3 — Verification
Sandboxed command/test tools, error capture, automatic retry and self-healing.

### V4 — Build & GitHub
Real Android/Web builds, GitHub commits/branches, Railway deployment and artifact links.

### V5 — Full app factory
Persistent workspaces, templates/plugins, visual editor, multi-agent tasks, billing and production artifact storage.

## Run
```bash
bun install
bun run start
```

Required Railway environment variables:
```text
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
PORT=3000
```

`OPENAI_API_KEY` is intentionally never committed to GitHub. Without it, the agent UI can load but an AI run will return a configuration error.
