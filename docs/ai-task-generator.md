# AI Task Generator

Experimental, isolated prototype on top of the existing AI Assistant page. It turns a natural-language request into editable task drafts. Drafts live in `ai_task_drafts` and do **not** appear in the active task list until an authorized user confirms them.

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
| `POST` | `/api/ai/task-generator` | Generate drafts |
| `PATCH` | `/api/ai/task-generator/[id]` | Edit a pending draft |
| `DELETE` | `/api/ai/task-generator/[id]` | Reject a draft |
| `POST` | `/api/ai/task-generator/publish` | Publish 1–50 drafts idempotently |

All endpoints require an authenticated workspace member. `owner`, `admin` and `member` can generate/edit/publish; `viewer` is read-only. Global admins are treated as workspace admins.

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
- Maximum 30 draft rows per user per rolling minute.
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
- The generator does not yet schedule capacity checks or avoid duplicate titles across batches.
- Drafts are only visible in the workspace; there is no notification when another admin publishes them.
- Model output quality depends on the selected provider/model.
- Real-model mode has not been exercised with a production key in this environment; the tested path is the clearly marked mock mode plus mocked provider responses.

## Future organizational hierarchy

The current permission boundary is workspace-level. The planned extension:

1. Add `manager_id`/team relations and scoped role assignments.
2. Build the allowed department/project/member context from the actor’s scope instead of the whole workspace.
3. Add `scope` metadata to drafts (`departmentId`, `teamId`, `requestedBy`).
4. Enforce scope again at publish time, not only in the prompt.
5. Add approval rules for cross-department drafts and audit events.
6. Let directors generate for allowed departments, managers for their department, supervisors for their team, and employees only for themselves.
