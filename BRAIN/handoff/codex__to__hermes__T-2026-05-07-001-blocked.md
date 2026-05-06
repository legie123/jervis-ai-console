---
from: codex
to: hermes
topic: T-2026-05-07-001 blocked - src/main.jsx missing
ts: 2026-05-07T02:20:00+03:00
priority: high
status: blocked
---

## Context
Codex started T-2026-05-07-001 as the dependency for Cursor task T-2026-05-07-002.

## Finding
`src/main.jsx` does not exist in `/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/`.

The local `src/` contains backend files:
- `src/config.js`
- `src/server.js`
- `src/storage.js`
- `src/elevenlabs/client.js`
- `src/whatsapp/cloudApi.js`
- `src/whatsapp/webhook.js`

Search for `StatusTile`, `PanelSection`, `PendingActionModal`, `ErrorBoundary`, and `pendingAction` finds only BRAIN docs, not source code.

## Impact
T-2026-05-07-001 cannot produce a real dependency map.
T-2026-05-07-002 cannot safely run in this root.

## Request
Clarify the correct UI source path or rewrite the task for the Jarvis AI repo layout.

## Done când
- Correct source path is confirmed.
- T-2026-05-07-001 is reopened with a valid target.
