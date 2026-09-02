# Sof-Expo · Ads Command Center

Ko'p platformali (Meta / Google Ads / Yandex Direct) real-time reklama analitikasi dashboardi — to'liq skvoznaya tahlil: kabinet → kampaniya → ad set → kreativ → lead.

## Ishga tushirish

```bash
pnpm install
pnpm dev        # API (3001) + Vite dev server (3000) birga
pnpm build      # production build → dist/
pnpm start      # production: bitta serverda client + API (port 3000)
pnpm check      # typecheck
pnpm smoke      # jsdom render smoke-test (barcha sahifalar + drawer + ⌘K)
```

## Arxitektura

```
server/data/snapshots/*.json   ← MCP/connector eksportlari shu yerga tushadi
        │  (fs.watch — darhol sezadi)
server/index.ts                ← Connector layer + API + SSE
        │   GET /api/snapshot?platform=meta     → NormalizedSnapshot
        │   GET /api/connections                → platforma/kabinet holati
        │   GET /api/stream                     → SSE live-sync kanali
        │   POST /api/refresh                   → barcha clientlarga push
shared/types.ts                ← umumiy ko'p platformali domen modeli
shared/normalize.ts            ← Meta xom eksport → NormalizedSnapshot
client/src/                    ← UI: faqat umumiy model bilan ishlaydi
```

### Real-time qanday ishlaydi

1. Snapshot papkaga tushgan zahoti `fs.watch` sezadi → SSE orqali `sync` eventi barcha ochiq dashboardlarga ketadi → UI **avtomatik** yangilanadi (sahifani yangilash shart emas).
2. SSE ishlamasa (korporativ tarmoq va h.k.) — 60 soniyali polling fallback.
3. Har snapshot fayl o'zgarishi `syncedAt` sifatida UI'da ko'rinadi.

### Yangi platforma ulash (Google Ads, Yandex Direct)

1. `shared/` ga yangi normalizer qo'shing (masalan `googleAds.ts`) — u xom eksportni `NormalizedSnapshot`ga aylantirsin (namuna: `normalize.ts`).
2. `server/index.ts` dagi `CONNECTORS` ro'yxatiga connector qo'shing.
3. UI hech qanday o'zgartirish talab qilmaydi: platforma switcher, KPI, jadvallar — hammasi umumiy model ustida.

Batafsil: `server/data/README.md` va dashboarddagi **Integratsiyalar** sahifasi.

## UI tuzilishi

| Sahifa | Nima bor |
|---|---|
| `/` Boshqaruv | KPI ledger (6 karta), avtomatik xulosa dvigateli, skvoznaya voronka, spend/leads/CPL chartlari, top kreativ |
| `/campaigns` | Saralanadigan ledger jadval: filtrlar, Expo guruhlash, CSV eksport, detail drawer |
| `/creatives` | Kreativ reytingi (spend/CTR/clicks), CTR liderlari charti |
| `/audience` | Yosh segmentlari: spend/leads chart, CPL kesimi, to'liq jadval |
| `/leads` | Expo → Kampaniya → Ad set → Kreativ hierarxiyasi |
| `/pipeline` | **Lead Lifecycle (AmoCRM)**: CRM KPI (won/lost/win rate/ROAS/cost per WON), bosqich voronkasi (har qadamda konversiya+tannarx), kanban doska, manba atributsiyasi |
| `/compare` | Davrlararo taqqoslash + Expo/account benchmark |
| `/report` | Chop etiladigan executive brief (PDF) |
| `/connections` | Platforma va CRM ulanishlari, texnik arxitektura, manba cheklovlari |

**⌘K / Ctrl+K** — command palette: sahifalar, kampaniya/kreativ qidiruvi, tema almashish, sync.
**Tema** — dark (default) / light, `localStorage`da saqlanadi.

## printsip: faqat real ma'lumot

Dashboardda hech qanday demo/yolg'on raqam yo'q. Qaytmagan metrikalar `N/A` deb ko'rsatiladi, manba cheklovlari esa `Integratsiyalar` sahifasida ochiq yozilgan.
