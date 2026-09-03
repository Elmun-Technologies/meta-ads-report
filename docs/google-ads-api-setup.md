# Google Ads API — ulash bo'yicha qo'llanma (Sof-Expo Command Center)

Maqsad: **real Google Ads hisobingizdan to'liq batafsil (detail) analitikani** dashboard'ga
tortish — kampaniya + reklama (ad) + kunlik trend + keyword/qurilma segmentlari.

> Bu hujjat — *noldan boshlash uchun* majburiy qo'llanma. Google Ads API
> credential'larini (developer token + OAuth) **kod yozilishidan avval**, qo'lda,
> Google tizimida tayyorlash kerak. Bu jarayon Google'ning tasdiqlashini o'z ichiga
> oladi va bir necha kunga cho'zilishi mumkin.

---

## 0. Nega bu kerak (qisqacha arxitektura)

Dashboard hozir Google ma'lumotini faqat **snapshot fayl** orqali ko'radi
(`server/data/snapshots/google_*.json`). Bu — ma'lum bir paytda eksport qilingan
"kampaniya darajasidagi" jadval. Batafsil (ad/kunlik/keyword) analitika va **jonli**
yangilanish uchun esa Google Ads API'ga to'g'ridan-to'g'ri ulanish kerak.

Google Ads API ishlashi uchun **2 turdagi identifikator** zarur:

| Nima | Nima vazifa qiladi | Qayerdan olinadi |
|---|---|---|
| **Developer token** | Ilovangizni (bu dashboard) Google Ads API'ga ulaydi. MCC ga bog'lanadi. | Google Ads Menedjer (MCC) → Admin → API Center |
| **OAuth 2.0** (`client_id` + `client_secret` + `refresh_token`) | Sizning Google Ads hisobingiz nomidan so'rov yuborishga ruxsat beradi. | Google Cloud Console → API & Services |

Muhim: **Developer token dastlab "Test access" darajasida bo'ladi** — u faqat
Google'ning test (sinov) hisoblarida ishlaydi. **Haqiqiy (production) hisobingiz**
bilan ishlash uchun Google uni alohida **tasdiqlashi (approve)** kerak.

---

## 1-qadam — Google Cloud Console'da loyiha va OAuth yaratish (≈30 daqiqa)

Bu — `client_id`, `client_secret` va keyin `refresh_token` olish joyi.

1. **[console.cloud.google.com](https://console.cloud.google.com)** ga kiring.
2. **Yangi loyiha** yarating (masalan `sof-expo-ads-dashboard`). Billing majburiy emas
   (Google Ads API bepul, lekin Cloud proyektlari soni cheklangan).
3. **API Library** → qidiruv: `Google Ads API` → topib, **Enable** tugmasini bosing.
   To'g'ridan-to'g'ri havola:
   `https://console.cloud.google.com/apis/library/googleads.googleapis.com`
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app** (token'ni qo'lda olish eng oson shunda).
   - Nom bering va **Create** ni bosing.
5. **Download JSON** tugmasini bosing — `client_secret_*.json` fayl tushadi.
   Ichida: `client_id`, `client_secret`, `redirect_uris`.

> ⚠️ Bu fayl — **maxfiy**. Uni hech qachon repoga (`git`) qo'ymang va hech kimga
> yubormang. Faqat sizda va (kerak bo'lsa) kod xizmatida (Vercel env) saqlanadi.
>
> Agar "OAuth consent screen" haqida ogohlantirsa — uni "External / Testing" rejimida
> sozlang va o'z Google hisobingizni **test user** sifatida qo'shing (avtorizatsiya
> vaqtida ruxsat shu orqali beriladi).

---

## 2-qadam — Google Ads Menedjer (MCC) va Developer Token (asosiy qiyin qism)

### 2a. Menedjer (MCC) hisobi
Sizda **MCC hisob bor** ekanini aytdingiz — zo'r. MCC raqamini bilish kerak
(masalan `123-456-7890`). Kampaniyalar turadigan **customer ID**'lar ham kerak.

### 2b. Developer token olish
1. Google Ads'da **Menedjer (MCC)** hisobiga kiring.
2. **Tools & Settings (Asboblar va sozlamalar) → Setup → API Center** ga o'ting.
3. **Apply for Developer Token** tugmasini bosing va arizani to'ldiring.
   - Use case sifatida: *"Automated reporting and performance analytics for our own
     Google Ads accounts (internal dashboard)."* — "umumiy data analysis" yozmang,
     rad etilishi mumkin.
   - Biznes ma'lumotlari, kontakt, kutilayotgan API hajmini to'ldiring.
4. Arizani yuboring. Token'ga darhol ega bo'lasiz, lekin u **Pending approval** va
   **Test access** darajasida bo'ladi.

### 2c. Production (real hisob) uchun tasdiqlash
Google'ning talablari (tasdiqlash ≈ 5–14 ish kuni):
- Menedjer hisobda **$1,000 dan ortiq tarixiy xarajat** (managed accountlar bo'yicha).
- Amaldagi **to'lov usuli** (karta/bank).
- Hisobda **policy buzilishi** bo'lmasligi.
- To'liq biznes ma'lumotlari.

> Token tasdiqlanguncha real (production) hisob bilan ishlay olmaysiz — faqat
> **test MCC** + test accountlarda. Shu sababli **kodni avval test rejimida**
> qurishni tavsiya qilamiz, tasdiq kelgach production'ga o'tamiz.

---

## 3-qadam — Refresh token olish (OAuth avtorizatsiya)

Developer token + OAuth client bo'lgach, bir marta Google'da **ruxsat berib**,
`refresh_token` olish kerak. Bu token ilovaga sizning nomingizdan (har doim,
parolsiz) so'rov yuborish imkonini beradi.

Biz loyihaga **`scripts/google-ads-oauth.ts`** deb kichik vosita qo'shamiz. Ish:
1. `client_id`, `client_secret` va istalgan `redirect_uri` berasiz.
2. U brauzerda ochiladigan avtorizatsiya havolasini chiqaradi.
3. Google'da ruxsat bergach, sahifa `redirect_uri` ga o'tadi — undagi **auth code**'ni
   vosita `refresh_token`'ga almashtiradi va ekranga chop etadi.
4. Shu `refresh_token`'ni xavfsiz saqlaysiz (Vercel env / `.env`).

> Refresh token olish uchun Google Ads API'ni **Google Ads hisobi bilan** bog'liq
> ekanini tekshirish uchun API'ga birinchi marta "test" so'rov yuborish kerak bo'ladi
> (Google Ads API "Gads API consent" talab qiladi). Kod buni hisobga oladi.

---

## 4-qadam — Nima qilib, qayerda saqlash (Vercel uchun qaror)

Eslatma: sizning loyihangiz **Vercel serverless** rejimida ishlaydi. Vercel funksiyalari
**doimiy ishlaydigan server emas** va `server/data/snapshots/` papkasi runtime'da
**faqat o'qish** rejimida (fayl yozib, keyingi so'rovda o'qish ishlamaydi). Google Ads
API esa maxfiy `refresh_token` + doimiy/server tomonida bajariladigan so'rov talab qiladi.

Shuning uchun **2 variant** bor — qaysi biri sizga mos, o'shani tanlaymiz:

### Variant A — Sxedulangan "pull + snapshot" (Vercel bilan eng mos)
- Kod **Google Ads API'dan to'liq detail'ni tortadigan** buyruq bo'ladi
  (`scripts/pull-google-ads.ts`).
- Bu buyruq har kuni masalan **GitHub Action** yoki tashqi cron
  (cron-job.org) orqali ishga tushadi: API'dan o'qiydi → `google_<id>_<davr>.json`
  snapshot yozadi → **repoga commit + push** qiladi → Vercel avtomatik redeploy qiladi.
- Natija: dashboard'da to'liq detail ko'rinadi; yangilanish "kunlik / har soat" bo'ladi.
- Refresh token faqat ushbu pull ishlaydigan joyda (GitHub Secrets) saqlanadi.

### Variant B — Doimiy server (eng "jonli")
- Loyihani **Railway / Render / VPS** kabi doimiy hosting'ga ko'chirish
  (`pnpm start`, port 3000). Unda SSE live-sync, fs.watch, so'rov bo'yicha pull
  hammasi ishlaydi va har 10–30 daqiqada yangilanadi.
- Dashboard hozir *serverless* deb sozlangan; bu variantda uni server rejimiga
  o'tkazamiz.

> **Tavsiya:** katta data kerak bo'lsa va "yaxshi, har kuni yangilansin" desangiz →
> **A**. Haqiqiy real-time (minutlab) kerak bo'lsa → **B**.

---

## 5-qadam — Kod integratsiyasi (biz bajaramiz)

Credential'lar va hosting qarori aniq bo'lgach, men kodda quyidagilarni quraman:

1. **`shared/googleAdsApi.ts`** — Google Ads API client (OAuth refresh + GAQL).
   Quyidagi GAQL so'rovlarini qo'llab-quvvatlaydi:
   - Kampaniya darajasi (`campaign`, `metrics.cost_micros`, `metrics.clicks`,
     `metrics.impressions`, `metrics.conversions`, `metrics.all_conversions`, ...)
   - Reklama (ad) darajasi (`ad_group_ad` + `ad_group_campaign`)
   - Kunlik trend (`segments.date`)
   - Segmentlar (`segments.device`, `segments.keyword`)
2. **`scripts/pull-google-ads.ts`** — API'dan tortib, `google_<id>_<davr>.json`
   snapshot shaklida yozadi (variant A).
3. **Normalizer'ni kengaytirish** — yangi rich snapshot formatini
   `NormalizedSnapshot` ga: creatives (ad'lar), age, va yangi `daily`/segment
   maydonlariga aylantiradi.
4. **UI'ni kengaytirish** — Google uchun kampaniya → ad, kunlik trend charti,
   qurilma/keyword segmentlarini ko'rsatadigan ko'rinish.
5. **`.env.example`** — barcha kerakli o'zgaruvchilar ro'yxati.

Kodni **test MCC + test accountda** sinashdan boshlaymiz (token tasdiqlanmasa ham
test ishlaydi), keyin production'ga o'tamiz.

---

## Zarur o'zgaruvchilar (yakuniy holat)

```
GOOGLE_ADS_DEVELOPER_TOKEN=...          # MCC → API Center
GOOGLE_ADS_CLIENT_ID=...                # Google Cloud → OAuth client
GOOGLE_ADS_CLIENT_SECRET=...            # Google Cloud → OAuth client
GOOGLE_ADS_REFRESH_TOKEN=...            # 3-qadam
GOOGLE_ADS_MANAGER_ID=1234567890        # MCC customer id
GOOGLE_ADS_CUSTOMER_IDS=111,222,333     # Analitika kerak bo'lgan customer id'lar
GOOGLE_ADS_USE_TEST_ACCOUNT=false       # test rejimda true
```

---

## Xavfsizlik — MUHIM

- `client_secret`, `refresh_token`, `developer_token` — **maxfiy**. `git`'ga **hech
  qachon** qo'ymang.
- `.env` va Vercel/GitHub **Secrets** da saqlang.
- Refresh token boshqa birov qo'liga tushsa — Google Cloud'da uni bekor qiling.
- Ushbu loyiha kodida maxfiy qiymat yo'qligini har doim tekshiramiz.

---

## Keyingi qadamlar (ro'yxat)

- [ ] **1-qadam**: Google Cloud loyiha + OAuth client (client_id/secret) yaratish
- [ ] **2-qadam**: MCC'dan developer token olish va (production uchun) ariza topshirish
- [ ] **3-qadam**: Refresh token olish
- [ ] **Variant A/B** bo'yicha hosting qarori
- [ ] Men kodni test rejimida quraman va test accountda sinaymiz
- [ ] Production accountga o'tish (token tasdiqlangach)
