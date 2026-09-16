/**
 * Platformalarni ulash "retsepti" — server va client BIR xil ro'yxatdan foydalanadi.
 *
 * Nega bu fayl kerak: ilgari «Ulash» tugmasi faqat .env da app kalitlari bo'lsa
 * ishlar edi (aks holda `disabled`) — foydalanuvchi tugmani bosolmas, nima yetish-
 * mayotganini ham aniq ko'rolmas edi. Endi:
 *
 *   1) APP kalitlari — UI'dan kiritiladi (server/data/store.json ga yoziladi,
 *      serverni qayta ishga tushirish shart emas). .env ham avvalgidek ishlaydi.
 *   2) TOKEN bilan ulash — app yaratmasdan ham hisobni ulash mumkin (masalan
 *      Meta System User tokeni yoki AmoCRM integratsiya kaliti).
 *
 * Har bir platforma uchun: qaysi maydonlar kerak, ular qayerdan olinadi,
 * qaysi biri maxfiy (client'ga faqat niqoblangan ko'rinishi qaytadi).
 */
import { PLATFORM_META } from "./types";

export type OAuthPlatformId = "meta" | "google-ads" | "amocrm";

export const OAUTH_PLATFORM_IDS: OAuthPlatformId[] = ["meta", "google-ads", "amocrm"];

/** Platforma bo'yicha app kalitlari (maydon nomi → qiymat). Server tomonda saqlanadi. */
export type AppCreds = Record<string, string>;

/** store.json dagi `oauthApps` bo'limi — UI'dan kiritilgan app kalitlari */
export interface StoredApps {
  meta?: AppCreds;
  "google-ads"?: AppCreds;
  amocrm?: AppCreds;
}

/** App kaliti maydoni (OAuth dialog uchun kerak) */
export interface AppFieldSpec {
  /** store'dagi kalit nomi */
  key: string;
  /** .env dagi muqobil nomi (ikkalasi bo'lsa .env ustuvor emas — store yangiroq) */
  env: string;
  label: string;
  /** Maxfiy — client'ga faqat niqoblangan qiymat qaytadi */
  secret?: boolean;
  /** Bo'sh qoldirish mumkin (masalan manager id) */
  optional?: boolean;
  placeholder?: string;
  /** Qayerdan olinadi — bitta aniq jumla */
  help: string;
}

/** "Token bilan ulash" formasi maydoni */
export interface ManualFieldSpec {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  help: string;
  multiline?: boolean;
}

export interface PlatformSetupSpec {
  id: OAuthPlatformId;
  name: string;
  logo: string;
  color: string;
  /** Asosiy tugma yozuvi */
  button: string;
  /** OAuth dialog nima beradi (qisqa izoh) */
  oauthHint: string;
  /** App kalitlari qayerdan olinadi — bosqichlar */
  appSteps: string[];
  appFields: AppFieldSpec[];
  /** Redirect URI (provider sozlamasiga yoziladi) — /api/oauth/<id>/callback */
  callbackPath: string;
  /** Token bilan ulash — app yaratishga vaqt yo'q bo'lganda */
  manual: {
    title: string;
    hint: string;
    steps: string[];
    fields: ManualFieldSpec[];
  } | null;
  docs?: { label: string; url: string };
}

export const OAUTH_SETUP: Record<OAuthPlatformId, PlatformSetupSpec> = {
  meta: {
    id: "meta",
    name: "Facebook / Instagram",
    logo: "f",
    color: PLATFORM_META.meta.color,
    button: "Facebook bilan ulash",
    oauthHint:
      "Barcha reklama kabinetlaringiz (aktlar) topiladi — xohlaganingizni yoqib/o'chirib qo'yasiz.",
    appSteps: [
      "developers.facebook.com → My Apps → «Create App» → tur: Business.",
      "App'ga «Facebook Login» va «Marketing API» mahsulotlarini qo'shing.",
      "Facebook Login → Settings → Valid OAuth Redirect URIs ga pastdagi callback URL'ni yozing.",
      "App Dashboard'dan App ID va App Secret ni ko'chirib, bu yerga qo'ying.",
    ],
    appFields: [
      {
        key: "appId",
        env: "META_APP_ID",
        label: "App ID",
        placeholder: "1234567890123456",
        help: "App Dashboard → chap tepada «App ID» (raqamli).",
      },
      {
        key: "appSecret",
        env: "META_APP_SECRET",
        label: "App Secret",
        secret: true,
        placeholder: "App Settings → Basic → App Secret",
        help: "App Settings → Basic → «App Secret» (Show tugmasi orqali).",
      },
    ],
    callbackPath: "/api/oauth/meta/callback",
    manual: {
      title: "Access token bilan ulash",
      hint: "App yaratishga vaqt yo'qmi? Tayyor token bilan ham ulanadi — kabinetlar avtomatik topiladi.",
      steps: [
        "Meta Business Suite → Business Settings → Users → System Users → «Generate token» (huquq: ads_read).",
        "Yoki Graph API Explorer'da o'z profilingiz uchun token oling (ads_read ruxsati bilan).",
        "Tokenni pastga qo'ying — «Tekshirish va ulash» barcha kabinetlaringizni o'zi topadi.",
      ],
      fields: [
        {
          key: "accessToken",
          label: "Access token",
          secret: true,
          multiline: true,
          placeholder: "EAAB… (uzun satr)",
          help: "ads_read huquqi bo'lgan long-lived token yoki System User tokeni.",
        },
        {
          key: "adAccountId",
          label: "Kabinet ID (ixtiyoriy)",
          optional: true,
          placeholder: "act_1234567890 yoki 1234567890",
          help: "Bo'sh qoldirsangiz — tokenga tegishli BARCHA kabinetlar topiladi.",
        },
      ],
    },
    docs: {
      label: "Meta app yaratish",
      url: "https://developers.facebook.com/docs/apps/create",
    },
  },
  "google-ads": {
    id: "google-ads",
    name: "Google Ads",
    logo: "G",
    color: PLATFORM_META["google-ads"].color,
    button: "Google bilan ulash",
    oauthHint: "Google hisobingizdagi barcha Ads kabinetlar (customer id) topiladi.",
    appSteps: [
      "console.cloud.google.com → loyiha → «APIs & Services» → «Google Ads API» ni yoqing.",
      "OAuth consent screen'ni sozlang (External, test user sifatida o'z emailingiz).",
      "Credentials → «Create credentials» → OAuth client ID (Web application) → redirect URI qo'shing.",
      "Google Ads → Tools → API Center → Developer token oling (Test access ham ishlaydi).",
    ],
    appFields: [
      {
        key: "clientId",
        env: "GOOGLE_ADS_CLIENT_ID",
        label: "OAuth Client ID",
        placeholder: "1234-abc.apps.googleusercontent.com",
        help: "Google Cloud Console → Credentials → OAuth 2.0 Client ID.",
      },
      {
        key: "clientSecret",
        env: "GOOGLE_ADS_CLIENT_SECRET",
        label: "OAuth Client Secret",
        secret: true,
        placeholder: "GOCSPX-…",
        help: "O'sha OAuth client'ning «Client secret» qiymati.",
      },
      {
        key: "developerToken",
        env: "GOOGLE_ADS_DEVELOPER_TOKEN",
        label: "Developer token",
        secret: true,
        placeholder: "Google Ads → API Center",
        help: "Google Ads (MCC) → Tools → API Center → Developer token.",
      },
      {
        key: "managerId",
        env: "GOOGLE_ADS_MANAGER_ID",
        label: "Manager (MCC) ID",
        optional: true,
        placeholder: "1234567890",
        help: "Agar kabinetlar MCC ostida bo'lsa — MCC customer id (raqamlarsiz).",
      },
    ],
    callbackPath: "/api/oauth/google-ads/callback",
    manual: {
      title: "Refresh token bilan ulash",
      hint: "OAuth dialog'ni ochmasdan, tayyor refresh token bilan ulanish (pnpm google:oauth ham shu tokenni beradi).",
      steps: [
        "Terminalda: pnpm google:oauth — browser ochiladi, ruxsat berasiz, refresh token chiqadi.",
        "Yoki Google OAuth Playground orqali oling (scope: https://www.googleapis.com/auth/adwords).",
        "Refresh token + client id/secret ni pastga qo'ying — kabinetlar ro'yxati avtomatik topiladi.",
      ],
      fields: [
        {
          key: "refreshToken",
          label: "Refresh token",
          secret: true,
          multiline: true,
          placeholder: "1//0g…",
          help: "Offline ruxsat (access_type=offline, prompt=consent) bilan olingan refresh token.",
        },
        {
          key: "customerIds",
          label: "Customer ID'lar (ixtiyoriy)",
          optional: true,
          placeholder: "1234567890, 0987654321",
          help: "Bo'sh qoldirsangiz — hisobingizdagi barcha kabinetlar (listAccessibleCustomers) olinadi.",
        },
        {
          key: "developerToken",
          label: "Developer token (ixtiyoriy)",
          secret: true,
          optional: true,
          placeholder: "App kalitlarida saqlangan bo'lsa — shart emas",
          help: "Google Ads → API Center. Yuqorida saqlangan bo'lsa qayta kiritish shart emas.",
        },
      ],
    },
    docs: {
      label: "docs/google-ads-api-setup.md",
      url: "https://github.com/Elmun-Technologies/meta-ads-report/blob/main/docs/google-ads-api-setup.md",
    },
  },
  amocrm: {
    id: "amocrm",
    name: "AmoCRM",
    logo: "A",
    color: "#8b5cf6",
    button: "AmoCRM hisobini ulash",
    oauthHint: "Leadlar har sync'da to'g'ridan-to'g'ri API'dan tortiladi — webhook shart emas.",
    appSteps: [
      "AmoCRM → Sozlamalar (⚙) → Integratsiyalar → «Yaratish» → «Integratsiya» turi.",
      "Redirect URI sifatida pastdagi callback URL'ni yozing.",
      "Yaratilgan integratsiyaning «Client ID» va «Client Secret» ini ko'chiring.",
      "Ulanish uchun AmoCRM subdomeningizni ham kiriting (masalan: sofexpo).",
    ],
    appFields: [
      {
        key: "clientId",
        env: "AMOCRM_CLIENT_ID",
        label: "Client ID (integration id)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        help: "AmoCRM → Sozlamalar → Integratsiyalar → yaratilgan integratsiya → Client ID.",
      },
      {
        key: "clientSecret",
        env: "AMOCRM_CLIENT_SECRET",
        label: "Client Secret",
        secret: true,
        placeholder: "AmoCRM → Integratsiyalar → Client Secret",
        help: "O'sha integratsiyaning maxfiy kaliti.",
      },
    ],
    callbackPath: "/api/oauth/amocrm/callback",
    manual: {
      title: "API kaliti (token) bilan ulash",
      hint: "Integratsiya yaratish o'rniga tayyor «API kalitlari» tokenini ishlatsangiz ham bo'ladi.",
      steps: [
        "AmoCRM → Sozlamalar → Integratsiyalar → «API kalitlari» (yoki mavjud integratsiya).",
        "Uzun muddatli access tokenni ko'chiring (huquqlar: Leads + Contacts, o'qish).",
        "Subdomain va tokenni pastga qo'ying — leadlar shu zahoti tortiladi.",
      ],
      fields: [
        {
          key: "subdomain",
          label: "Subdomain",
          placeholder: "sofexpo (sofexpo.amocrm.ru)",
          help: "AmoCRM hisobingiz manzilining birinchi qismi.",
        },
        {
          key: "accessToken",
          label: "Access token",
          secret: true,
          multiline: true,
          placeholder: "eyJ0eXAi…",
          help: "Integratsiya / API kalitlari bo'limidagi access token.",
        },
        {
          key: "refreshToken",
          label: "Refresh token (ixtiyoriy)",
          secret: true,
          optional: true,
          multiline: true,
          placeholder: "Bo'lsa — token avtomatik yangilanadi",
          help: "Berilsa, token muddati tugaganda server o'zi yangilaydi (app kalitlari kerak).",
        },
      ],
    },
    docs: {
      label: "AmoCRM API hujjatlari",
      url: "https://www.amocrm.ru/developers/content/integrations/api",
    },
  },
};

export function setupSpec(id: string): PlatformSetupSpec | null {
  return (OAUTH_SETUP as Record<string, PlatformSetupSpec>)[id] ?? null;
}

/** Callback URL — provider sozlamasiga yoziladigan manzil (host client'da ma'lum) */
export function callbackUrl(origin: string, id: OAuthPlatformId): string {
  return `${origin.replace(/\/$/, "")}${OAUTH_SETUP[id].callbackPath}`;
}
