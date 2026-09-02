# Meta Ads Avgust 2026 Dashboard — Dizayn qarorlari

## Variantlar

### Theme Name: Editorial Ledger
**Very Brief Intro:** Jurnalistik hisobot estetikasi: issiq qog‘oz fon, kuchli serif sarlavhalar, qora siyoh va qizil signal ranglari. Dashboardni oddiy spreadsheet emas, rahbariyat o‘qiydigan tahliliy briefingga aylantiradi.
**Probability:** 0.03

### Theme Name: Signal Room
**Very Brief Intro:** Tungi operatsion markaz uslubi: chuqur navy fon, amber signal ranglari va zich, ammo o‘qilishi oson analytics panellari. Qarorlar, ogohlantirishlar va real vaqt monitoringi hissini beradi.
**Probability:** 0.08

### Theme Name: Field Notes
**Very Brief Intro:** Zamonaviy biznes-reportaj uslubi: och kulrang fon, kobalt siyoh, limon rangli aksentlar, qo‘lda chizilgandek marker chiziqlari va asimmetrik bloklar. Raqamlarni insoniy va tez tushuniladigan qiladi.
**Probability:** 0.06

## Tanlangan yondashuv: Editorial Ledger

### Design Movement
Swiss editorial design va zamonaviy business intelligence reporting aralashmasi: qat’iy tipografik ierarxiya, ko‘p nafas oladigan whitespace, jadvalni markazga emas, hikoyaga xizmat qildirish.

### Core Principles
1. Har bir raqam qaror kontekstida ko‘rsatiladi: KPI yonida qisqa izoh va signal mavjud.
2. Spreadsheet zichligini kamaytirish uchun katta typographic numerals, rangli progress barlar va aniq ustunlar ishlatiladi.
3. Vizual ritm editorial: chap tomonda doimiy sidebar, asosiy kontentda katta sarlavha va asimmetrik chart bloklari.
4. Rang faqat ma’no uchun ishlatiladi: kobalt — asosiy natija, vermilion — xavf yoki sust signal, sage — samaradorlik, parchment — ish maydoni.

### Color Philosophy
Parchment fon ko‘zni charchatmaydi va hisobotni “print-ready” ko‘rsatadi. Ink charcoal matn uchun maksimal o‘qilish beradi. Signature kobalt aksent ishonch va nazoratni bildiradi; vermilion faqat muammo yoki kreativ fatigue signalini ko‘rsatadi, shuning uchun rangli shovqin paydo bo‘lmaydi.

### Layout Paradigm
Chapda 240px editorial rail: hisob nomi, davr, report navigation va “data confidence” paneli. O‘ngda notekis 12-ustunlik ish maydoni: birinchi qatorda executive narrative va KPI ledger, keyin spend/lead charti, so‘ng creative ranking va audience breakdown. Jadval alohida “Creative Ledger” ko‘rinishida ochiladi.

### Signature Elements
1. Sarlavhalarda ingichka vermilion underline va margin note raqamlari.
2. KPI kartalarida kichik “signal chip”lar: Efficient, Watch, Scale test.
3. Chartlarda qog‘ozga bosilgan siyoh teksturasi hissi beruvchi juda yengil noise va gridline’lar.

### Interaction Philosophy
Interaksiyalar tahlilni tezlashtiradi: campaign qatorini bosganda detail drawer ochiladi; KPI ustiga hover qilinganda formula va interpretation paydo bo‘ladi; “Show only lead campaigns” va “Sort by” filtrlari jadvalni darhol o‘zgartiradi.

### Animation
Kirish animatsiyasi 180ms editorial reveal: sarlavha va KPI bloklari yengil translate-y bilan ketma-ket chiqadi. Hoverda faqat transform va opacity transition; chart bars 240ms ease-out bilan o‘sadi. Reduced-motion rejimi barcha entrance motion’ni o‘chiradi.

### Typography System
Sarlavhalar uchun **DM Serif Display**, interfeys va raqamlar uchun **IBM Plex Sans**. H1 48/52, section title 24/28, KPI value 32/36 semibold, table 13/18, annotation 11/16 uppercase tracking. Raqamlar tabular-nums bilan tekislanadi.

### Brand Essence
Sof-Expo reklama qarorlarini tez va ishonchli qilish uchun qurilgan avgust performance room — raqamni actionga aylantiradigan dashboard. Personality: **aniq, tahliliy, xotirjam**.

### Brand Voice
Headline’lar qisqa va qaror markazli: “Qayerga pul ketdi?” va “Qaysi creative signal berdi?”. CTA va microcopy buyruqboz emas, yo‘naltiruvchi: “Creative detailni oching”, “Lead narxini ko‘ring”.

### Wordmark & Logo
Logo sifatida uchta gorizontal ledger chizig‘i va ulardan birini kesib o‘tuvchi kichik vermilion marker belgisi ishlatiladi. Bu “hisobot + signal” g‘oyasini ifodalaydi va hech qanday matnga bog‘liq emas.

### Signature Brand Color
**Ledger Cobalt — #274C77**. Bu rang moliyaviy nazorat, aniqlik va professional ishonchni bildiradi; qog‘oz rang fonida kuchli, ammo agressiv ko‘rinmaydi.

## Data model

Dashboard quyidagi real API ma’lumotlaridan foydalanadi: account summary, 19 ta campaign row, campaign ID, campaign name, Spend, Impressions, Reach, Frequency, Clicks (all), Link clicks, CTR, CPC, CPM, Leads, Cost per lead, Landing page views, Messaging conversations started, yosh segmentlari va API cheklovlari. Creative detail mavjud ad-level ro‘yxat orqali ko‘rsatiladi; creative nomi va statusi qaytgan joyda beriladi, qaytmagan metriclar esa “Data not available” sifatida ko‘rsatiladi. Hech qanday demo yoki uydirma natija qo‘shilmaydi.

## Style Decisions

- Desktopda chap editorial rail non-negotiable: account, period, navigation va data confidence shu vertikal ledger spine’da yashaydi.
- Sof-Expo markasi plain textdan oldin ko‘rinadi; uchta ledger chizig‘i va vermilion marker asosiy brend signali bo‘lib qoladi.
- Vermilion faqat risk, fatigue, alert yoki editorial underline signali uchun ishlatiladi; cobalt strukturaviy navigatsiya va asosiy urg‘u rangidir.
- Spend charti ranked comparison sifatida ishlaydi; u faqat bezak emas, qaysi kampaniyaga pul ko‘proq ketganini tez o‘qitishi kerak.

---

## V2 qaror (2026-09): Ads Command Center

Editorial Ledger konseptsi V2 da **Ads Command Center**ga almashtirildi — sabab: loyiha ko'p platformali (Google Ads, Yandex Direct) real-time monitoringga evolyutsiya qilmoqda.

- Dizayn: tungi "command center" (default) + yorug' tema, Inter + JetBrains Mono, tabular numerals.
- Rang faqat ma'no uchun: accent=asosiy, cyan=leads, violet=CPL, good/warn/risk=signal.
- Arxitektura: UI endi statik JSON import qilmaydi — /api/snapshot + SSE live sync (server/data/snapshots papkasi fs.watch bilan kuzatiladi).
- Ko'p platforma: shared/types.ts umumiy model; yangi MCP connector shu modelga normalize qilinadi.
