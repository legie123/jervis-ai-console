# JARVIS Command Center pe Cloud.ru (orientare)

Cloud.ru **nu înlocuiește** un laptop care rulează supervizorul local; oferă resurse în cloud. Pentru UI-ul Vite ai două variante realiste.

## 1) Site static gratuit (Object Storage / hosting static)

Potrivit pentru **demo UI** sau documentație. Pașii tipici (numele exacte din consolă pot varia — vezi documentația Cloud.ru: *Static Website Hosting*, *OBS*, *free tier Evolution*):

1. Creezi un **bucket** Object Storage cu acces public la citire (policy „public read” pentru obiectele site-ului).
2. Activezi **Static website hosting**: document rădăcină `index.html`.
3. Local, din `command-center/`:
   - dacă API-ul operatorului rămâne pe alt server (VPS), build cu originea API setată la URL-ul public HTTPS al operatorului:

   ```bash
   export VITE_OPERATOR_API_ORIGIN="https://API-UL-TAU:PORT"
   npm run build
   ```

4. Încarci conținutul din `apps/web/dist/` în bucket (index.html, assets/, etc.).

**Important:** browserul va apela API-ul de pe **domeniu diferit** față de site. Operatorul trebuie să trimită header CORS:

```bash
export JARVIS_CORS_ALLOW_ORIGIN="https://URL-UL-SITE-ULUI-STATIC"
export JARVIS_HTTP_HOST=0.0.0.0
export PORT=4317
node apps/operator/src/server.js
```

(`JARVIS_CORS_ALLOW_ORIGIN` trebuie să fie **exact** origin-ul site-ului static, inclusiv `https` și fără slash final, ex. `https://my-bucket.website.cloud.ru`.)

Securitate: nu expune operatorul la internet fără TLS în față (reverse proxy), token-uri și reguli de firewall.

## 2) O singură mașină (VM Evolution / alt VPS) — același origin

Cel mai simplu pentru **produs complet** (UI + `/api`): rulezi operatorul care servește deja build-ul din `apps/web/dist` când există.

```bash
export JARVIS_HTTP_HOST=0.0.0.0
export PORT=4317
cd command-center
npm ci
npm run build
node apps/operator/src/server.js
```

Deschizi în browser `http://IP:4317/` (sau TLS la nginx). **Nu** ai nevoie de `VITE_OPERATOR_API_ORIGIN` nici de CORS dacă UI și API sunt același host.

## Free tier

Consultă documentația oficială **Cloud.ru Evolution — free tier** (credite, volum, condiții cont). OBS static + o VM mică pot intra în trial; limitele se schimbă — verifică înainte de producție.

## Legături utile (documentație Cloud.ru)

- [Static website hosting (OBS)](https://cloud.ru/docs/en/usermanual/obs/obs_03_0336?source-platform=Advanced)
- [Free tier Evolution](https://cloud.ru/docs/evolution/overview/topics/free-tier?source-platform=Evolution)
