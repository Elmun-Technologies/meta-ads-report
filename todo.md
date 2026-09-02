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

## Keyingi (V3 yo'l xaritasi)

- [ ] Google Ads MCP normalizer + connector (snapshot shu papkaga tushadi).
- [ ] Yandex Direct API connector (valyuta konvertatsiyasi bilan).
- [ ] Ko'p kabinet: bitta platformada bir nechta account switcher.
- [ ] Kunlik timeseries (insights time_increment=1 bilan) → trend chartlar va davrlararo taqqoslash.
- [ ] Alertlar: CPL/CTR chegara buzilganda bildirishnoma (browser notification).
- [ ] Lead sifati integratsiyasi (CRM webhook → lead status qayta hisoblash).
- [ ] Foydalanuvchi rollari va ko'p til (uz/en/ru).
