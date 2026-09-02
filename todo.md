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

## Keyingi (V3 yo'l xaritasi)

- [ ] Google Ads MCP normalizer + connector (snapshot shu papkaga tushadi).
- [ ] Yandex Direct API connector (valyuta konvertatsiyasi bilan).
- [ ] Ko'p kabinet: bitta platformada bir nechta account switcher.
- [ ] Kunlik timeseries (insights time_increment=1 bilan) → trend chartlar va davrlararo taqqoslash.
- [ ] Alertlar: CPL/CTR chegara buzilganda bildirishnoma (browser notification).
- [ ] Lead sifati integratsiyasi (CRM webhook → lead status qayta hisoblash).
- [ ] Foydalanuvchi rollari va ko'p til (uz/en/ru).
