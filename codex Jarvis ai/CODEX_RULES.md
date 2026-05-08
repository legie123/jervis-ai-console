# Codex Rules For This Project

## Active Working Directory

Always work from:

```bash
cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
```

## Do Not Touch By Default

```text
../src/
../server/
../vite.config.js
../graphify-out/
.antigravity/
node_modules/
data/ runtime records unless task requires it
```

## Before Editing

```bash
git status --short
rg "TODO|DANGEROUS|confirmation|WhatsApp|ElevenLabs|webhook" src command-center test
npm test
```

## After Editing

```bash
npm test
npm run build
```

If command-center changed:

```bash
npm run test:command-center
npm run healthcheck:command-center
```

## Truth Labels

- REAL = verified working.
- PARTIAL = working but incomplete.
- MOCK = fake/demo.
- BROKEN = does not work.
- DANGEROUS = can affect accounts, money, external messages, secrets, or data loss.
- UNVERIFIED = not checked.

