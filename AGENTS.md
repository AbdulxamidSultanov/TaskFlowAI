<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## TaskFlowAI business invariants

- Workspace membership is the organization boundary. Use server-side task/project/person scopes for every read and mutation; never rely on UI visibility for authorization.
- Keep task/tag/history writes in one transaction. Validate related workspace IDs, date ranges, dependency cycles and reporting cycles.
- Default development uses local SQLite. Do not run db:setup, db:seed or db:reset on an existing working database without an explicit request to erase it. db:migrate makes a verified local database backup; files need a separate backup.
- npm run dev/start also runs the reminder worker. Production requires a strong AUTH_SECRET and a persistent worker/storage deployment.
- Time/difficulty/reason analytics describe recorded work, not a score of employee worth. Never invent violation counts or causal explanations.
- Run npm test, npm run typecheck, npm run lint and npm run build after business-logic changes. Tests must use disposable databases.
- Current behavior and deployment limitations: docs/time-management.md.
