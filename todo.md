# V2 Command Center — bajarilgan va keyingi qadamlar

## Bajarildi (V2 qayta qurish)

- [x] Ko'p platformali arxitektura: shared/types + shared/normalize (Meta tayyor, Google/Yandex uchun interfeys).
- [x] API server: /api/snapshot, /api/connections, /api/health, /api/refresh + SSE /api/stream.
- [x] Real-time: fs.watch + SSE push, polling fallback, live indikator, syncedAt.
- [x] Yangi UI: dark/light "command center" dizayn tizimi (Inter + JetBrains Mono).
- [x] Sahifalar: Boshqaruv, Kampaniyalar, Kreativlar, Auditoriya, Lead Explorer, Integratsiyalar.
- [x] Avtomatik xulosa dvigateli (7 turdagi real hisoblangan insightlar, o'zbekcha).
- [x] ⌘K command palette, CSV eksport, detail drawer, skeleton/error holatlar.
- [x] jsdom smoke-test (scripts/smoke-render.ts) — 21 tekshiruv.

## Bajarildi (V2.1 — signal dvigateli)

- [x] Signal markazi: qoidalar dvigateli (lead'siz sarf, DISAPPROVED, CPL regressiya, charchash, pauza, zaif CTR, scale imkoniyati) — qo'ng'iroq ikonkasi + Overview paneli.
- [x] Statistik anomaliya deteksiya (robust MAD z-score ≥ 2): CPL/CPM/CTR/Frequency outayerlari.
- [x] Pacing va prognoz: kunlik sarf/lead, 30 kunlik prognoz, scale what-if (+$100 → +N lead).
- [x] Taqqoslash sahifasi: Expo benchmark, account benchmark (o'rtachadan yuqorida/pastda), A/B davrlar (2+ snapshot kelganda avtomatik yonadi).
- [x] Hisobot sahifasi: chop etiladigan executive brief (print/PDF CSS bilan).
- [x] Kampaniyalar jadvaliga CPL vs o'rtacha benchmark ustuni.
- [x] /api/snapshots + ?file= — snapshot ro'yxati va fayl bo'yicha olish.

## Bajarildi (V2.2 — AmoCRM lead lifecycle)

- [x] shared/amo.ts: normalizer + UTM matchlash (utm_campaign → Meta kampaniya/kreativ) + lifecycle analitikasi.
- [x] /pipeline sahifasi: CRM KPI (won/lost/win rate/ROAS/cost per WON/sikl), bosqich
      voronkasi (har qadamda konversiya + tannarx + o'tirgan kuni), kanban doska,
      manba atributsiyasi (qaysi kampaniya haqiqatan bitim berdi).
- [x] Lead drawer: bosqichlar tarixi + reklama manbasi (match) + yo'qotish sababi.
- [x] Overview'da yopiq sikl paneli (CRM ulanganda ROAS/cost per WON ko'rinadi).
- [x] Server: GET /api/crm + AmoCRM connection (kind: crm); amo\_\*.json papkaga
      tushganda hammasi avtomatik yonadi (fs.watch → SSE).
- [x] Command palette'da CRM leadlar qidiruvi.
- [x] amo_demo_test.json — DEMO (real ulanishda o'chiriladi).

## Bajarildi (V2.3 — tushunarli UI + statik deploy)

- [x] Dizayn tizimi qayta yozildi: gradient/glow/neon o'rniga tekis fon, bitta aksent rang, 1px chiziqlar, zich tipografika.
- [x] Barcha atamalar o'zbekcha + inglizcha qavsda: Murojaatlar (Leads), Murojaat narxi (CPL), Bosish ulushi (CTR), Takroriylik (Frequency).
- [x] `Term` komponenti — har bir metrika yonida “?” belgisi, bosganda oddiy tilda izoh (18 ta atama lug'ati).
- [x] Har sahifa tepasida `PageHint` — “bu sahifada nima ko'rasiz” (9 ta sahifa).
- [x] Menyu nomlari sodda va izohli: Umumiy natijalar, Kampaniya tuzilmasi, Murojaat yo'li (CRM), Ulanishlar; har birida tooltip.
- [x] Sarlavhalar savol shaklida: “Pul qaysi kampaniyaga ketdi?”, “Qayerda odam yo'qotilmoqda?”, “Qaysi reklama haqiqatan bitim berdi?”.
- [x] Vercel/static deploy: `scripts/build-static-data.ts` → `data/bootstrap.json`; API javob bermasa client shu fayldan o'qiydi (bo'sh ekran yo'q).
- [x] `/api/health?debug=1` — DATA_DIR, cwd, fayllar ro'yxati (serverless diagnostikasi).
- [x] Smoke-test yangi matnlarga moslashtirildi — 34/34 PASS.

## Bajarildi (V2.4 — Google Ads API asosi, Variant A)

- [x] `shared/googleAdsApi.ts` — Google Ads **REST client** (OAuth refresh_token →
      access_token, GAQL `searchStream`). Kampaniya + reklama (ad) + kunlik + qurilma +
      kalit so'z o'lchamlari uchun GAQL so'rovlari.
- [x] `scripts/pull-google-ads.ts` (`pnpm google:pull`) — API'dan tortib,
      `google_<cid>_<sana>.json` batafsil snapshot yozadi (Vercel/statik uchun mos).
- [x] `scripts/google-ads-oauth.ts` (`pnpm google:oauth`) — refresh token olish vositasi.
- [x] `shared/generic.ts` kengaytirildi: `ads[]` → kampaniyalarga **creatives**;
      `cost_micros` endi kattaligidan qat'iy nazar to'g'ri 1e6 bo'linadi.
- [x] `scripts/google-normalizer-check.ts` (`pnpm google:test:normalize`) — 14 PASS
      offline tekshiruv.
- [x] `.env.example` + `docs/google-ads-api-setup.md` (to'liq sozlash qo'llanmasi) +
      `server/data/README.md` (batafsil pull formati).
- [ ] (Keyingi) Kredensial tayyorlangach: test MCC'da `pnpm google:pull` sinash.
- [ ] (Keyingi) Google uchun UI: platform switcher + ad/kunlik/qurilma/keyword ko'rinishi.

## Keyingi (V3 yo'l xaritasi)

- [x] Google Ads connector (generic normalizer, `google_*.json` snapshot) — real SOF EXPO eksporti bilan tekshirildi.
- [ ] Yandex Direct API connector (valyuta konvertatsiyasi bilan).
- [ ] Ko'p kabinet: bitta platformada bir nechta account switcher.
- [ ] Kunlik timeseries (insights time_increment=1 bilan) → trend chartlar va davrlararo taqqoslash.
- [ ] Alertlar: CPL/CTR chegara buzilganda bildirishnoma (browser notification).
- [ ] Lead sifati integratsiyasi (CRM webhook → lead status qayta hisoblash).
- [ ] Foydalanuvchi rollari va ko'p til (uz/en/ru).

## Bajarildi (V3 — real-time + yagona oyna, 2026-09-16)

- [x] **Real-time sync dvigateli** (`server/sync.ts`): Meta Graph API / Google Ads API /
      TGStat'dan har SYNC_INTERVAL_SEC da avtomatik pull; `POST /api/sync` — qo'lda
      hoziroq tortish; scheduler faqat "server" rejimida (serverless'da on-demand).
- [x] **Meta Graph API puller** (`shared/metaApi.ts`): kampaniya + ad + yosh kesimi +
      summary — normalizeMetaExport formatida (MCP eksportiga muhtojlik yo'q).
- [x] **AmoCRM webhook** (`/api/webhooks/amocrm`): leads.add/status/update parsing,
      UTM/telefon ajratish, store'ga upsert — leadlar real-time CRM'ga tushadi.
- [x] **Jonli harakat feed'i**: activity log (store) + SSE `activity` eventlari +
      Overview'da "Hoziroq nima bo'ldi?" paneli.
- [x] **Yagona oyna kesimi**: /api/snapshot?platform=all endi `platforms[]` qaytaradi —
      har platformaning sarf/murojaat/CPL/qamrovi; Overview'da "Pul qaysi kanalga
      ketayapti?" paneli (stacked bar + jadval + auto chip).
- [x] **Prisma → JSON store** (`server/store.ts`): tashqi DB yo'q, serverless'da ham
      ishlaydi, prisma engine yuklashga bog'liqlik yo'q. store.json gitignore'da.
- [x] **UI to'liq o'zbekchaga qaytarildi** (ruscha qoldiqlar 10+ sahifadan olib tashlandi).
- [x] **Live indikator**: LIVE + keyingi syncgacha countdown (Topbar/Sidebar), tab
      fokusda darhol yangilanish, polling fallback 60s→30s.
- [x] Sync state endpointlari: `GET /api/sync`, `GET /api/activity`, SSE `sync_state`.
- [x] Smoke-test 36 tekshiruvga kengaytirildi (jonli harakat + platforma kesimi) — 36/36.
- [x] .env.example: META_*, TGSTAT_TOKEN, SYNC_INTERVAL_SEC valyutalar.

### Keyingi qadamlar
- [ ] Kredensiallar berilgach: Meta/Google real pull'ni ishlab ko'rish.
- [ ] Kunlik timeseries (time_increment=1) → trend chartlar.
- [ ] Browser notification (kritik signallar desktop'ga).
- [ ] Ko'p kabinet tanlagich Google/Yandex uchun.

## Bajarildi (V3.1 — kunlik trend, offline to'liq, real-time toastlar)

- [x] Kunlik timeseries (time_increment=1): Meta Graph API puller kunlik kesimni
      tortadi → NormalizedSnapshot.daily → Overview'da "Kunlik dinamika" charti
      (sarf ustunlari + murojaatlar chizigi). Yagona oynada platformalar bo'yicha
      sanaga jamlanadi. Mavjud snapshot fayllarida daily yo'q — panel faqat
      real-time rejimda ko'rinadi (taxminiy ma'lumot o'ylab topilmaydi).
- [x] /offline sahifasi to'liq ishlaydi: manbalar ro'yxati (sarf/murojaat/CPL),
      har bir manbaga inline murojaat qo'shish formasi, oxirgi murojaatlar jadvali,
      real-time yangilanish (SSE lastEventAt orqali).
- [x] Real-time toastlar: yangi murojaat / bosqich o'zgarishi / xato hodisalari
      desktop bildirishnomasi sifatida ko'rinadi (faqat obunadan keyingi
      hodisalar — server replayi toast qilmaydi).
- [x] /telegram sahifasi ham real-time hodisalarda avtomatik qayta yuklanadi.
- [x] Smoke-test 39 tekshiruvga kengaytirildi (kunlik trend + offline sahifa) — 39/39.

## Bajarildi (V3.2 — bildirishnomalar, shaffoflik, hisobot kesimi)

- [x] Desktop bildirishnomalari (Browser Notification API): AlertsMenu'dagi
      qo\'ng\'iroq tugmasi ostida kalit — yoqilganda kritik signallar, xatolar va
      yangi murojaatlar desktop\'ga keladi (fon rejimidagi tab uchun ham).
      Ruxsat faqat foydalanuvchi xohishi bilan so\'raladi.
- [x] Overview\'da "Nima ma\'lum, nima noma\'lum?" shaffoflik paneli: har manba
      uchun ✓ mavjud ma\'lumotlar / ✕ yo\'q metrikalar (har birining sababi
      tooltip\'da) — "nega bu raqam yo\'q" savoli yopildi.
- [x] Hisobot (Report) sahifasiga platformalar kesimi jadvali — rahbariyat
      bir qarashda pul qaysi kanalga ketganini ko\'radi (2+ manba ulanganda).
- [x] Smoke-test 40 tekshiruvga kengaytirildi (shaffoflik paneli) — 40/40.

## Bajarildi (V3.3 — ko\'p kabinet, parol himoyasi)

- [x] Ko\'p kabinet birlashtirish: bir platformaning BARCHA hisob fayllari
      (meta_<act>/google_<cid>/yandex_<login>) avtomatik jamlanadi — har
      kabinetdan eng yangi fayl olinadi, kampaniyalar/sarf/leadlar qo\'shiladi,
      nomi "Google Ads — 2 kabinet" ko\'rinishida. Ulanishlar sahifasida
      barcha kabinetlar ro\'yxati. Oldin faqat eng yangi bitta fayl o\'qilar,
      qolgan kabinetlar ma\'lumoti yo\'qolardi.
- [x] Parol himoyasi (DASHBOARD_PASSWORD): butun /api/* HMAC-cookie sessiya
      ostiga o\'tadi, brauzerda login ekrani. Statik zaxira (bootstrap.json)
      401 holatda ishlatilmaydi — himoya chetlab o\'tilmaydi.
      /api/health ochiq (monitoring), webhooklar alohida: WEBHOOK_SECRET
      qo\'yilganda ?secret=... talab qiladi.
- [x] Session: 30 kun, HttpOnly cookie, timing-safe parol tekshiruvi.
