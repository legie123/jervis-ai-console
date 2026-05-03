# JARVIS Realtime Console

JARVIS is a browser-based realtime voice operations console. The browser owns microphone capture, WebRTC, remote audio playback, transcript rendering, and tool-result forwarding. The server owns `OPENAI_API_KEY`, mints short-lived Realtime client secrets, and exposes a small safe tool layer.

## OpenAI guidance used

- Realtime WebRTC is the right browser path for low-latency speech-to-speech sessions: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Realtime conversations support session-level tools via `session.tools`, model function calls, `function_call_output`, and a follow-up `response.create`: https://developers.openai.com/api/docs/guides/realtime-conversations
- Model guidance was checked against the models catalog. `gpt-realtime-1.5` is the preferred voice model for audio in, audio out; `gpt-realtime-mini` is listed as deprecated in the current catalog: https://developers.openai.com/api/docs/models

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment:

   ```bash
   cp .env.example .env
   ```

3. Add your server-only key:

   ```bash
   OPENAI_API_KEY=
   JARVIS_TOKEN=change-me-local-only
   VITE_JARVIS_TOKEN=change-me-local-only
   ELEVENLABS_API_KEY=
   ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
   ELEVENLABS_MODEL=eleven_flash_v2_5
   ```

4. Start local development:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://localhost:5173
   ```

Local access notes:

- The API now requires `X-Jarvis-Key`, supplied by the browser from `VITE_JARVIS_TOKEN`.
- The local server binds to loopback only.
- `/api/realtime-token` is rate-limited.

## Terminal Obsidian helper

A local helper script is available for simple note capture/search against the JARVIS Obsidian vault:

```bash
./scripts/jarvis-obsidian-terminal.sh --text "Creeaza notita: Idei Trade AI"
./scripts/jarvis-obsidian-terminal.sh --text "Cauta notita: Trade"
./scripts/jarvis-obsidian-terminal.sh --audio /path/to/input.wav
```

Notes:

- Default vault path: `data/obsidian-vault`
- Supported commands: `Creeaza notita:` and `Cauta notita:`
- For audio transcription you need a local `whisper-cli` or `whisper` command installed
- The script writes an audit trail to `data/obsidian-vault/jarvis-terminal.log`

## What is operational now

- Realtime voice conversation over WebRTC.
- Audio input from the browser microphone and audio output from the model.
- Low-latency turn detection with semantic VAD and interruption.
- Text transcript display when server transcript events are available.
- Typed fallback commands work without voice through `/api/jarvis/command`, and use the Realtime data channel when a voice session is live.
- Persistent audit log stored in `data/jarvis-audit.json`.
- Local reminder records stored in `data/jarvis-schedule.json`.
- Server-minted short-lived client secrets; the browser never receives `OPENAI_API_KEY`.
- Realtime function calling bridge for safe local tools.
- Max Operator mode for aggressive planning, drafting, and safe local tool execution.
- Mandatory Obsidian subsystem for local Markdown vault export and plugin catalog lookup.
- Mandatory Graphify subsystem for project-map status, graph report reading, and command proposals.
- Local non-sensitive note memory stored in `data/jarvis-memory.json`.
- UI states for standby, linking, online, muted, recovering, and errors.

## Tool layer

The model can call these safe tools:

- `get_local_time`: returns current date/time.
- `remember_note`: stores a short non-sensitive local note.
- `recall_notes`: retrieves recent or matching local notes.
- `make_task_plan`: converts an objective into an operational checklist.
- `create_local_reminder`: stores a local reminder record without notifying external people or services.
- `get_capabilities`: reports what this build can and cannot do.
- `risk_assessment`: classifies whether an action is direct, confirmation-gated, handoff-only, or disallowed.
- `draft_action`: prepares messages, plans, checklists, or command proposals without executing them.
- `search_obsidian_plugins`: searches the local `obsidian-releases` community plugin catalog.
- `obsidian_status`: checks the local vault and plugin catalog.
- `export_obsidian_note`: writes Markdown into `data/obsidian-vault`.
- `graphify_status`: inspects the local Graphify repo and this project's `graphify-out` outputs.
- `graphify_command_proposal`: prepares exact Graphify commands without running third-party code.
- `graphify_read_report`: reads `graphify-out/GRAPH_REPORT.md` when a graph already exists.

The client listens for function call events, calls `/api/jarvis/tool`, sends a `function_call_output` item back over the data channel, then triggers another `response.create` so JARVIS can answer in voice using the tool result. Without a live voice session, text commands go to `/api/jarvis/command`, which parses intent, applies risk gates, executes only safe local tools, and appends the result to `/api/jarvis/audit`.

## Guardrails

Max Operator mode does not mean silent unsafe execution. JARVIS can draft, plan, and prepare these actions, but the app must add explicit confirmation gates before enabling:

- Sending messages, emails, comments, or forms.
- Deleting files, notes, emails, meetings, or cloud data.
- Purchases, banking, subscriptions, or financial actions.
- Installing software or running generated/downloaded scripts.
- Account changes, permission changes, OAuth/API key creation, or password workflows.
- Reading or transmitting sensitive data such as credentials, contact info, payment data, medical/legal data, precise location, logs, browser history, or clipboard contents.

## Developer notes

### Latency

- Keep WebRTC for browser audio. It avoids manual audio chunking and lets model audio arrive as a remote media stream.
- Keep spoken answers short. Tool output should be summarized, not read as a long dump.
- Use headphones during testing to reduce echo and false VAD triggers.
- `semantic_vad` is enabled with `interrupt_response: true` for natural turn-taking.

### Session lifecycle

- The browser asks `/api/realtime-token` for a fresh short-lived client secret.
- The browser creates an `RTCPeerConnection`, adds the microphone track, creates an SDP offer, and posts that SDP to `/v1/realtime/calls`.
- Ending the session closes the data channel, peer connection, and microphone tracks.
- Reconnect mints a fresh client secret and starts a new session.
- Realtime sessions are temporary; do not reuse old client secrets.

### Permissions

- Microphone access requires browser permission. `localhost` is allowed for development.
- Autoplay can be blocked until a user gesture. The app starts from a button click, which normally satisfies that requirement.
- If permission is denied, reset site permissions in the browser and reconnect.

### Error recovery

- `RTCPeerConnection.connectionState` drives the signal display.
- `failed` or `disconnected` states trigger a short reconnect attempt.
- Token, SDP, and Realtime event errors surface in the UI.
- Missing `OPENAI_API_KEY` is detected before microphone permission is requested.

### Obsidian and Graphify

- Obsidian data comes from `../3rd_party_repos/obsidian-releases`.
- JARVIS exports notes to `data/obsidian-vault`, which can be opened as an Obsidian vault.
- Graphify is discovered at `../3rd_party_repos/graphify`.
- JARVIS can inspect Graphify availability and prepare commands.
- Running the Graphify executable is intentionally not automatic because it executes third-party Python code. Ask JARVIS for the command proposal, then explicitly confirm if you want it run.

## Validation checklist

- Page loads at `http://localhost:5173` and shows `JARVIS`.
- `/api/config` returns model, voice, key readiness, and tool names.
- `/api/jarvis/status` reports server, Realtime, memory, audit, Obsidian, and Graphify status.
- `/api/jarvis/command` accepts a typed fallback command and returns intent, risk, status, and audit event.
- `/api/jarvis/audit` returns recent audit events.
- Missing `OPENAI_API_KEY` shows a clear error before any microphone prompt.
- Microphone permission appears only after pressing Start JARVIS with a configured key.
- A live session reaches Online and plays model audio.
- Voice interruption works while JARVIS is speaking.
- ElevenLabs preview requires `ELEVENLABS_API_KEY`; without it the panel shows `Requires setup`.
- User transcript and assistant transcript appear when transcript events are emitted.
- Typed fallback command works while offline and while the session is live.
- Asking “what time is it?” triggers the time tool and returns a voice answer.
- Asking “can you do this without limits?” triggers risk assessment when the next action could affect the outside world.
- Asking for a risky action produces a draft or handoff path rather than silent execution.
- Asking for Obsidian plugins returns results from the local Obsidian releases catalog.
- Asking to save a mission note exports Markdown into the local Obsidian vault.
- Asking for Graphify status reports whether `graphify-out` exists.
- Saying “remember that...” stores a local note and updates the Memory panel.
- “Amintește-mi...” creates a local reminder without notifying anyone externally.
- Saying “what do you remember?” recalls local notes.
- Reconnect creates a new session and restores audio.
- Ending the session stops microphone capture.
