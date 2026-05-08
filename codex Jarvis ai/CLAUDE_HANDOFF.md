# JERVIS Claude Handoff

Copy-paste this into Claude when working on JERVIS.

```md
Lucreaza pe nucleul real JERVIS:

LOCAL PATH:
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI

GITHUB:
https://github.com/legie123/jervis-ai-console.git

BRANCH:
codex/whatsapp-cloud-run-live

IMPORTANT:
Nu lucra in root-ul parinte ca nucleu principal:
/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI

Root-ul parinte poate contine consola Vite pe localhost:5173 si modificari Codex anterioare.
Nucleul proiectului cerut de Andrei este:
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI

RUN:
cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
npm start

COMMAND CENTER:
npm run start:command-center
open http://127.0.0.1:4317

BRIDGE API:
http://127.0.0.1:8787

TEST:
npm test
npm run build
npm run test:command-center
npm run healthcheck:command-center

PROJECT STRUCTURE:
src/                         main WhatsApp/ElevenLabs bridge
src/index.js                 bridge entrypoint
src/server.js                Express app
src/config.js                env/config loader
src/whatsapp/                WhatsApp Cloud logic
src/elevenlabs/              ElevenLabs TTS / voice logic
command-center/              local operator command center
command-center/apps/web/     web UI
command-center/apps/operator backend/operator tools
command-center/packages/     core packages
data/                        local runtime data
test/                        bridge tests
scripts/                     operational scripts
samples/                     voice sample area

SAFETY:
- Nu printa .env.
- Nu hardcoda secrete.
- Nu trimite WhatsApp live fara confirmation gate.
- Nu trimite text sensibil catre ElevenLabs fara confirmare.
- Nu sterge data/.
- Nu atinge .antigravity.
- Nu rescrie munca lui Codex sau Claude fara inspectie.
- Daca exista dirty files, lucreaza cu ele, nu le revertui.

PRODUCT:
JERVIS este operator real, nu demo.
Flow obligatoriu:
Presence -> Context recall -> Risk check -> Action draft -> Confirm -> Execute -> Log.

FINAL FORMAT:
VERDICT:
DONE:
TESTED:
RISK:
BROKEN:
NEXT:
```

