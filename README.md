# Jarvis WhatsApp Bridge

REAL: WhatsApp Business Cloud API bridge.

This does not read a personal WhatsApp inbox. Official Meta access is for a WhatsApp Business phone number connected to Cloud API. Incoming messages arrive through webhooks. Outgoing messages are sent through Graph API.

## Flow

Presence -> Context recall -> Risk check -> Action draft -> Confirm -> Execute -> Log.

## Run

```bash
npm install
cp .env.example .env
npm start
```

## Command Center UI

REAL: Local JARVIS Command Center is included in `command-center/`.

Run it from this project:

```bash
npm run start:command-center
```

Then open:

```text
http://127.0.0.1:4317
```

This is separate from the WhatsApp bridge process on port `8787`.
Outbound WhatsApp remains confirmation-gated.

To use the full local bridge:

```bash
npm start
npm run start:command-center
```

Command Center connects to the bridge at `http://127.0.0.1:8787` by default.
Override with `JARVIS_WHATSAPP_BRIDGE_URL`.

Bridge send is DANGEROUS external communication and requires:

```text
CONFIRM_BRIDGE_SEND
```

Expose `GET/POST /webhooks/whatsapp` publicly with ngrok or deployment, then set that callback URL in Meta App Dashboard.

## Endpoints

- `GET /health` checks service state.
- `GET /webhooks/whatsapp` verifies Meta webhook subscription.
- `POST /webhooks/whatsapp` receives inbound messages and statuses.
- `GET /api/whatsapp/messages` lists stored inbound messages.
- `POST /api/whatsapp/drafts` creates a reply draft.
- `GET /api/whatsapp/drafts` lists drafts.
- `POST /api/whatsapp/drafts/:id/confirm` sends one pending draft.
- `POST /api/voice/speech` creates local speech audio through ElevenLabs.
- `GET /api/voice/speech` lists generated speech records.
- `GET /audio/speech/:file` serves generated audio files.

## Safety

Outbound WhatsApp is DANGEROUS external communication. This bridge never auto-sends. A reply must be drafted first, then confirmed.

In production, `WHATSAPP_APP_SECRET` is required so webhook signatures can be verified.

ElevenLabs TTS is DANGEROUS third-party text transfer. Do not send secrets, private client data, or trading account details as speech input.

## ElevenLabs

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`, then:

```bash
curl -X POST http://localhost:8787/api/voice/speech \
  -H "Content-Type: application/json" \
  -d '{"text":"Salut. JARVIS este conectat la ElevenLabs."}'
```

The response returns `speech.audioUrl`, a local MP3 URL.

Optional alternate voice:

```bash
ELEVENLABS_ALT_VOICE_ID=2ajXGJNYBR0iNHpS4VZb
```

Use it with:

```bash
curl -X POST http://localhost:8787/api/voice/speech \
  -H "Content-Type: application/json" \
  -d '{"text":"Test voce alternativa.","voice":"alternate"}'
```

## Clone a Private Voice

REAL: Uses ElevenLabs Instant Voice Clone API.

DANGEROUS: Clone only your own voice or a voice you have explicit permission to clone.

Put clean audio samples in a local folder, then run:

```bash
npm run voice:clone -- \
  --name "Jarvis Private Voice" \
  --files ./samples/voice-1.wav,./samples/voice-2.mp3 \
  --description "Private Romanian Jarvis voice" \
  --labels '{"language":"ro","accent":"romanian"}' \
  --consent
```

The script prints `voice_id`. Put that ID in `.env`:

```bash
ELEVENLABS_VOICE_ID=new_voice_id_here
```
