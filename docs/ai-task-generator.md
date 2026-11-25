# AI Task Generator

The Task Agent turns a natural-language request into editable task drafts. It opens by default in `/ai-workspace`. The agent selector in `/ai-assistant` and `/ai-workspace` can switch between the chat assistant and the Task Agent. The link beside the selector opens the chosen agent in a new tab. Both composers support Ctrl+Enter. Drafts live in `ai_task_drafts` and are applied when an authorized user confirms them.

## How it works

1. The browser sends `POST /api/ai/task-generator` with a workspace ID and a prompt (8–2000 characters).
2. The server checks the session, workspace membership and edit role.
3. The server builds a small context: project IDs/names, department IDs/names and workspace member IDs/names. No task text, comments or settings are sent.
4. The server calls an OpenAI-compatible `/chat/completions` endpoint with a strict JSON schema and a 25 s timeout.
5. The response is parsed and validated with Zod, unknown project/assignee IDs are dropped, and deadlines are normalized.
6. Up to 10 drafts are stored with `state = draft` and returned to the UI.
7. The user edits or rejects drafts.
8. `POST /api/ai/task-generator/publish` creates real tasks inside a transaction. Repeating the call returns the same `publishedTaskId`s.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ai/task-generator?workspaceId=…` | Pending drafts + provider status |
| `POST` | `/api/ai/task-generator` | Generate task drafts, review statuses, or draft requested changes |
| `PATCH` | `/api/ai/task-generator/[id]` | Edit a pending draft |
| `DELETE` | `/api/ai/task-generator/[id]` | Reject a draft |
| `POST` | `/api/ai/task-generator/publish` | Publish 1–50 drafts idempotently |

All endpoints require an authenticated workspace member. `owner`, `admin` and `member` can generate; edits, rejection and publication are limited to the author or workspace owner/admin. `viewer` is read-only. All context is filtered by server-side scope. Global admins are treated as workspace admins.

## Environment

```env
AI_API_KEY=<server-side key>
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4.1-mini
```

- The key is read only in server code.
- `AI_BASE_URL` must be OpenAI-compatible.
- `AI_MODEL` is any model the provider exposes.
- Without `AI_API_KEY` (or with `AI_MOCK=1`) the generator uses a deterministic local mock and the UI shows **Demo mode**.

### Provider and model choice

The default provider is OpenRouter because it exposes an OpenAI-compatible API and lets the model be changed without touching code. The default model is `openai/gpt-4.1-mini`: reliable structured output, low latency, and roughly **$0.40 / 1M input tokens + $1.60 / 1M output tokens** (provider pricing can change). A typical ten-task request stays well below **$0.01**.

Other compatible options can be selected through `AI_MODEL`, for example a Gemini Flash or DeepSeek model available on the same provider.

## Mock mode

Mock mode is not a real model. It reads the requested count, matches a department by name/keyword, uses the first matching project and builds template tasks with dates in the next days. The UI labels it **Demo mode** and every generation response carries `mode: "mock"`.

## Limits and safety

- Prompt: 8–2000 characters.
- Maximum 10 tasks per generation.
- Maximum 30 draft rows per user per rolling minute, checked again transactionally before inserting a batch.
- 25-second provider timeout.
- Strict JSON schema + Zod validation.
- Only IDs supplied by the server are accepted; invalid assignees are nulled and invalid projects fall back to allowed projects.
- The system prompt tells the model to treat the user request as data, not as a schema/permission override.
- Publishing is always a separate authorized server action.

## Testing

Tests run against the Turso test data with the demo account and are cleaned up afterwards.

| Scenario | Result |
|---|---|
| One task from a short prompt | Pass |
| Ten drafts in one request | Pass |
| Edit title/priority/deadline before publishing | Pass |
| Reject draft | Pass |
| Viewer cannot generate/publish (`403`) | Pass |
| Invalid assignee rejected (`403`) | Pass |
| Ambiguous prompt falls back to defaults | Pass |
| Provider unavailable (`502 AI_NETWORK_ERROR`) | Pass |
| Invalid provider JSON (`502 AI_INVALID_JSON`) | Pass |
| Provider rate limit (`429 AI_RATE_LIMIT`) | Pass |
| Duplicate publish returns the same task ID | Pass |
| Prompt over 2000 chars (`422`) | Pass |
| Local rate limit after 30 drafts (`429`) | Pass |

## Known prototype limitations

- In-memory provider retries are not implemented; a failed generation must be retried by the user.
- The rate limit is stored in the database per user, not per IP.
- The generator receives estimated open-task workload and filters exact normalized titles already present in the visible task/draft scope. Semantic deduplication and full staffing/shift capacity are not implemented.
- Drafts are only visible in the workspace; there is no notification when another admin publishes them.
- Model output quality depends on the selected provider/model.
- Real-model mode has not been exercised with a production key in this environment; the tested path is the clearly marked mock mode plus mocked provider responses.

## Future organizational hierarchy

The current permission boundary is workspace-level. The planned extension:

1. Reporting relations and `self`/`team`/`workspace` scopes are now stored per workspace membership.
2. Build the allowed department/project/member context from the actor’s scope instead of the whole workspace.
3. Add `scope` metadata to drafts (`departmentId`, `teamId`, `requestedBy`).
4. Enforce scope again at publish time, not only in the prompt.
5. Add approval rules for cross-department drafts and audit events.
6. Let directors generate for allowed departments, managers for their department, supervisors for their team, and employees only for themselves.

## Current implementation notes (2026-11-12)

The organizational tree and server-side scopes are implemented. Publication records confirmedById/confirmedAt and generation mode/model. Project and department consistency is enforced; dates are strictly parsed in the actor timezone and provider deadlines outside today…+21 days are not accepted as suggestions. Human approval remains mandatory. Task history records AI publication. Historical test results above are not a claim that a live production model was tested in this environment. `npm test` supplies disposable-database regression tests for permissions and idempotent publication.

## AI Workspace (status-change drafts, 2026-11-21)

The drafts pipeline now covers two draft kinds (`ai_task_drafts.action_type`):

- `create_task` — the original flow described above.
- `update_status` — a proposed status transition for an existing task (`target_task_id`, `suggested_status`, `suggested_reason`).

Both kinds live on the dedicated **AI Workspace** page (`/ai-workspace`, sidebar item "ИИ-воркспейс"). The embedded generator was moved off the AI Assistant page.

### How status review works

1. `POST /api/ai/task-generator` with `{"workspaceId": "...", "mode": "status-review"}`.
2. The server loads up to 30 open tasks inside the caller's task scope and asks the provider for 1–10 suggestions (strict JSON schema, same retry/fallback behavior as task generation).
3. Suggestions are validated server-side: unknown task IDs are dropped, no-op transitions are skipped, `completed` is only suggested for tasks without `requiresReview`, `blocked` requires a reason, and an identical pending proposal for the same task+status is not duplicated.
4. Drafts appear in the AI Workspace; the user can edit the suggested status/reason, then **Apply** one draft, apply all drafts, or reject.
5. Applying runs through the regular task engine: plain transitions go via `updateTask` (permissions, history, timers, notifications), `blocked` goes via the workflow action (`block`) and therefore requires a reason. Publishing is idempotent via `publishedTaskId`.

### Hard limits

- The AI may only propose `todo`, `queued`, `in_progress`, `completed` (non-review tasks) and `blocked`. `under_review` and `cancelled` are workflow-governed and stay manual-only (`aiProposableStatuses` in `src/lib/domain.ts`).
- A `completed` suggestion for a `requiresReview` task is rejected at publish time (`TASK_REVIEW_REQUIRED`).
- The same rolling rate limit (30 drafts/minute/user) covers both draft kinds.
- Mock mode is deterministic and clearly labelled; nothing is applied to real tasks without an explicit human confirmation.

## Requested changes (2026-11-25)

In the Task Agent, choose **Change tasks**, then describe a status or deadline change (for example, “Move the request form task to tomorrow”). `POST /api/ai/task-generator` accepts `{workspaceId, mode: "actions", prompt}` and returns editable `update_status` or `update_deadline` drafts. This mode requires a configured AI provider. The chat assistant answers questions and helps with planning.

- The provider receives at most 30 scoped tasks. The server validates returned IDs and statuses, limits suggested deadlines to today through 365 days ahead, skips matching pending proposals, and enforces the shared draft quota.
- Applying a batch runs task updates, workflow transitions, activity records and draft publication in one transaction. The task engine checks permissions such as `changeDeadline` at publication. `publishedTaskId` makes repeated confirmation idempotent.
