# Snapshot data layer

Bu papka — dashboardning yagona ma'lumot manbasi (`server/data/snapshots/`).

> ⚠️ `amo_demo_test.json` — bu DEMO fayl (xayriy leadlar), Lead Lifecycle sahifasini
> ko'rsatish uchun. Real AmoCRM ulanganda **o'chirib tashlang**.

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

## AmoCRM ulash (lead lifecycle — reklamadan bitimgacha)

`amo_<hisob>_<davr>.json` nomli fayl shu papkaga tushganda `/pipeline` sahifasi avtomatik yonadi.
Matchlash **utm_campaign** bo'yicha: Meta'da UTM shabloniga `utm_campaign={{campaign.id}}` qo'ying —
lead aynan shu kampaniyaga bog'lanadi va cost-per-WON / ROAS hisoblanadi.

```json
{
  "account": { "name": "Sof-Expo AmoCRM", "subdomain": "sofexpo", "currency": "UZS" },
  "pipelines": [{ "id": 1, "name": "Savdo" }],
  "stages": [
    { "id": 101, "name": "Yangi lead", "pipeline_id": 1, "sort": 1 },
    { "id": 102, "name": "Sifatli lead", "pipeline_id": 1, "sort": 2 },
    { "id": 103, "name": "Muzokara", "pipeline_id": 1, "sort": 3 },
    { "id": 104, "name": "Muvaffaqiyatli", "pipeline_id": 1, "sort": 4, "status": { "kind": "won" } },
    { "id": 105, "name": "Yopilgan", "pipeline_id": 1, "sort": 5, "status": { "kind": "lost" } }
  ],
  "leads": [
    {
      "id": 90001,
      "name": "OOO Chorrak",
      "created_at": "2026-08-05T10:12:00+05:00",
      "updated_at": "2026-08-14T09:00:00+05:00",
      "stage_id": 104,
      "price": 12000000,
      "responsible": "Nazir",
      "contact": { "name": "Alisher", "phone": "+998901234567" },
      "utm": { "utm_source": "facebook", "utm_campaign": "6939006462536", "utm_content": "creative#1" },
      "history": [{ "at": "2026-08-05T10:12:00+05:00", "stage": "Yangi lead" }],
      "loss_reason": null
    }
  ]
}
```

- `stages[].status.kind`: `won` / `lost` / `in_progress` (bo'lmasa nomi bo'yicha aniqlanadi)
- `leads[].utm.utm_campaign` — Meta kampaniya **ID** yoki nomi (match uchun kritik)
- `leads[].history` — bosqichlar tarixi (ihtiyoriy, lekin velocity uchun foydali)
- Fayl tushganda fs.watch → SSE → `/pipeline` va Overview' dagi lifecycle paneli o'zi yangilanadi
