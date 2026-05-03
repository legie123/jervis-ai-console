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

Expose `GET/POST /webhooks/whatsapp` publicly with ngrok or deployment, then set that callback URL in Meta App Dashboard.

## Endpoints

- `GET /health` checks service state.
- `GET /webhooks/whatsapp` verifies Meta webhook subscription.
- `POST /webhooks/whatsapp` receives inbound messages and statuses.
- `GET /api/whatsapp/messages` lists stored inbound messages.
- `POST /api/whatsapp/drafts` creates a reply draft.
- `GET /api/whatsapp/drafts` lists drafts.
- `POST /api/whatsapp/drafts/:id/confirm` sends one pending draft.

## Safety

Outbound WhatsApp is DANGEROUS external communication. This bridge never auto-sends. A reply must be drafted first, then confirmed.

In production, `WHATSAPP_APP_SECRET` is required so webhook signatures can be verified.
