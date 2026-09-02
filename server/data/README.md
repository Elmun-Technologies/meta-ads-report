# Snapshot data layer

Bu papka — dashboardning yagona ma'lumot manbasi (`server/data/snapshots/`).

## Qanday ishlaydi

- Server shu papkadagi `.json` fayllarni o'qiydi va eng yangisini (mtime bo'yicha) normalizatsiya qilib API orqali beradi.
- Fayl papkaga tushgan zahoti (qayta yozilsa ham) server `/api/stream` (SSE) orqali barcha ochiq dashboardlarga `sync` signali yuboradi — UI avtomatik yangilanadi. **Hech qanday sahifani yangilash shart emas.**
- Snapshot formati — Meta Ads MCP qaytargan xom eksport: `{ account, summary, campaigns, age, ads, adInsights, limitations }`.

## Yangi snapshot qo'shish (masalan MCP orqali)

1. Xom eksportni shu papkaga yozing: `meta_<account-id>_<period>.json`
2. Server avtomatik tarzda uni topadi (`GET /api/refresh` chaqirilsa ham bo'ladi) va UI live yangilanadi.

## Yangi platforma ulash (Google Ads, Yandex Direct)

`server/index.ts` ichidagi `CONNECTORS` ro'yxatiga yangi connector qo'shing:

```ts
{
  id: "google-ads",
  resolve: (accountId?: string) => normalizeGoogleAdsExport(raw, {...}), // shared/googleAds.ts
}
```

Normalizer `shared/types.ts` dagi `NormalizedSnapshot`ni qaytarsa, UI hech qanday o'zgartirishsiz yangi platformani ko'rsatadi (platform switcher, KPI, jadvallar — hammasi umumiy model ustida ishlaydi).
