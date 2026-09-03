# Snapshot data layer

Bu papka — dashboardning yagona ma'lumot manbasi (`server/data/snapshots/`).

> ⚠️ `amo_demo_test.json` — bu DEMO fayl (xayriy leadlar), Lead Lifecycle sahifasini
> ko'rsatish uchun. Real AmoCRM ulanganda **o'chirib tashlang**.

## Fayl nomlash qoidalari (MCP/Manus uchun)

| Prefiks | Platforma | Taniladigan asosiy maydonlar |
|---|---|---|
| `meta_*.json` | Meta Ads (istalgan account) | account, summary, campaigns, age, ads, adInsights (MCP standart eksporti) |
| `google_*.json` | Google Ads | rows[]: campaign_name, cost_micros, clicks, impressions, conversions |
| `yandex_*.json` | Yandex Direct | rows[]: Name, Spend, Clicks, Impressions, Conversions |
| `amo_*.json` | AmoCRM (lead lifecycle) | account, pipelines, stages, leads[] (utm_campaign!) |

Bir nechta kabinet/davr — har biri alohida fayl (masalan `meta_act-111_jul.json`,
`meta_act-222_aug.json`): topbar'dagi **kabinet tanlagich** ulardan birini tanlaydi,
eng yangisi default. Google/Yandex hozir faqat eng yangi faylni ko'rsatadi.

### Google Ads namuna

```json
{
  "account_name": "Sof-Expo Google",
  "customer_id": "123-456-7890",
  "currency": "UZS",
  "period": "2026-09-01 — 2026-09-30",
  "rows": [
    { "campaign_id": "2001", "campaign_name": "Foodera | Search | UZ", "cost_micros": 45000000, "impressions": 52000, "clicks": 1800, "conversions": 42, "ctr": 3.46 }
  ]
}
```

### Google Ads API orqali batafsil pull (Variant A)

Google Ads API'dan **jonli, batafsil** ma'lumotni tortib, snapshot yozish ham mumkin —
`pnpm google:pull` (sozlash uchun `docs/google-ads-api-setup.md`). U har bir customer
uchun quyidagilarni tortadi va `google_<cid>_<sana>.json` shaklida yozadi:

```jsonc
{
  "source": "google-ads-api",
  "account_name": "...",
  "customer_id": "...",
  "currency": "USD",
  "period": "google_123_2026-09-03.json",
  "date_range": "last 30 days",
  "rows": [ /* kampaniya darajasi — legacy generic normalizer taniydi */ ],
  "campaigns": [ /* kampaniya + status + KPI */ ],
  "ads":      [ /* ad_group_ad darajasi → creatives ga bog'lanadi */ ],
  "daily":    [ /* kampaniya × kun — trend */ ],
  "devices":  [ /* kampaniya × qurilma */ ],
  "keywords": [ /* kalit so'z (Search) */ ]
}
```

- `rows[]` — kampaniya satrlari: `campaign_id, campaign_name, status, cost_micros,
  impressions, clicks, conversions, ctr`. Buni eski normalizer ham taniydi.
- `ads[]` — reklama darajasi: `campaign_id, ad_group_id/name, ad_id/name, status,
  cost_micros, impressions, clicks, conversions`. Kelganda normalizer ularni
  kampaniyalarga **creatives** (reklama) qilib bog'laydi.
- `daily`, `devices`, `keywords` — kunlik trend / qurilma / kalit so'z kesimlari
  (batafsil UI bularni ko'rsatadigan qo'shimcha — keyingi qadam).

### Yandex Direct namuna

```json
{
  "account_name": "Sof-Expo Yandex",
  "Login": "sof-expo-uz",
  "Currency": "UZS",
  "period": "2026-09-01 — 2026-09-30",
  "rows": [
    { "Id": "3001", "Name": "Foodera | Poisk", "Spend": 3200000, "Impressions": 41000, "Clicks": 1500, "Conversions": 30, "Ctr": 3.7 }
  ]
}
```

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
