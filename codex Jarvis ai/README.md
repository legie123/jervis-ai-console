# Codex Jarvis Code AI

Acesta este spatiul de lucru Codex pentru nucleul real JERVIS.

## Local Project

```bash
cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
```

## GitHub

```text
https://github.com/legie123/jervis-ai-console.git
```

Remote:

```bash
origin https://github.com/legie123/jervis-ai-console.git
```

Branch curent:

```bash
codex/whatsapp-cloud-run-live
```

## Important

Nucleul proiectului este:

```text
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI
```

Nu trata folderul parinte `TRADE AI` ca nucleu principal pentru JERVIS.

## Run

Bridge WhatsApp / ElevenLabs:

```bash
npm start
```

Command Center UI:

```bash
npm run start:command-center
```

Deschide:

```text
http://127.0.0.1:4317
```

Bridge API:

```text
http://127.0.0.1:8787
```

## Test

```bash
npm test
npm run build
npm run test:command-center
npm run healthcheck:command-center
```

## Main Areas

```text
src/
src/whatsapp/
src/elevenlabs/
command-center/
command-center/apps/operator/
command-center/apps/web/
command-center/packages/
data/
test/
scripts/
samples/
```

## Safety

- Nu printa `.env`.
- Nu hardcoda API keys.
- Nu trimite WhatsApp/email/external messages fara confirmation gate.
- Nu clona voce fara consimtamant explicit.
- Nu atinge `.antigravity`.
- Nu sterge date din `data/` fara confirmare.
- Nu rescrie munca lui Claude.

## Current Truth

REAL:
- WhatsApp Business Cloud bridge exista in `src/`.
- Command Center exista in `command-center/`.
- ElevenLabs TTS exista in `src/elevenlabs/`.
- Tests exista pentru drafts, ElevenLabs, webhook, safety, scheduler, Graphify, Obsidian.

PARTIAL:
- Integrarea UI premium din root `TRADE AI/src` nu este mutata automat aici.
- Root-ul `TRADE AI` are modificari Codex anterioare si trebuie tratat separat.

BROKEN WATCH:
- Daca `localhost:5173` merge, acela este root console, nu nucleul `Jarvis AI`.
- Pentru nucleul `Jarvis AI`, foloseste `8787` bridge si `4317` command-center.

