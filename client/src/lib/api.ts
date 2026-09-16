/**
 * API bilan ishlash yordamchilari — xatolarni ODAM TILIDA ko'rsatish uchun.
 *
 * Nega bu fayl kerak: ilgari «App ID / App Secret» ni saqlashda server javob
 * bermasa (yoki route bo'lmasa) foydalanuvchi faqat «Server xatosi (404)» ni
 * ko'rardi — nima buzilganini va nima qilishni bilmas edi. 404 deyarli har doim
 * bitta narsani anglatadi: browser'dagi so'rov Express serverga YETIB BORMAGAN.
 *
 * Holatlar va ularning tuzatilishi:
 *   1) Javob HTML (404/405)  → sayt statik rejimda: /api/* ni ushlaydigan server
 *      yo'q (GitHub Pages / Netlify statik / Vercel'da funksiya deploy bo'lmagan).
 *   2) Javob JSON, lekin 404 → server eski versiyada (route yo'q) — qayta deploy.
 *   3) 5xx + JSON emas       → dev'da faqat web server ishga tushgan (API o'chiq).
 *   4) Javob 401             → DASHBOARD_PASSWORD yoqilgan, avval parol bilan kirish kerak.
 *   5) fetch'ning o'zi uzildi → API server umuman ishga tushmagan.
 */

/** Server holati — /api/health javobi */
export interface ApiHealth {
  /** /api/health JSON javob berdimi */
  ok: boolean;
  /** "server" (uzoq muddatli) yoki "serverless" (Vercel) */
  mode?: string;
  /** Nima xato — tushunarli matn */
  error?: string;
}

/** Statik rejim uchun umumiy tushuntirish (banner + toast'da ishlatiladi) */
export const STATIC_MODE_HINT =
  "Bu sayt statik rejimda ochilgan — /api/* so'rovlarini ushlaydigan server yo'q, shuning uchun " +
  "kalitlarni saqlab bo'lmaydi. Yechim: loyihani server bilan ishga tushiring (`pnpm dev` — lokal, " +
  "`pnpm build && pnpm start` — production, Vercel'da esa api/ serverless funksiyasi deploy " +
  "bo'lganini tekshiring) yoki kalitlarni .env fayliga yozing (META_APP_ID / META_APP_SECRET) va " +
  "serverni qayta ishga tushiring.";

/**
 * /api/health ni tekshirish — API umuman tirikmi?
 * Hech qachon exception tashlamaydi: natija `ok: false` bo'lib qaytadi.
 */
export async function probeApiHealth(): Promise<ApiHealth> {
  try {
    const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("application/json")) {
      // 5xx + JSON emas: dev proxy (vite) API serverga ulanmagan — ECONNREFUSED
      if (res.status >= 500) {
        return {
          ok: false,
          error:
            `API server javob bermadi (${res.status}). Dev rejimda web (3000) va api (3001) alohida ishlaydi — ` +
            "ikkalasini birga ko'tarish uchun `pnpm dev` ni ishlating (`pnpm dev:web` yolg'iz /api ni ishlamaydigan qoldiradi).",
        };
      }
      return {
        ok: false,
        error:
          res.status === 404
            ? "Server /api/health ni topmadi (404) — sayt statik rejimda yoki server eski versiyada."
            : `Server kutilmagan javob berdi (${res.status}, ${type || "content-type yo'q"}).`,
      };
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; mode?: string };
    return { ok: data?.ok !== false, mode: data?.mode };
  } catch {
    return {
      ok: false,
      error:
        "API serverga ulanib bo'lmadi — u ishga tushmagan (dev rejimda `pnpm dev` web va api ni " +
        "birga ko'taradi; faqat `pnpm dev:web` ishlatilsa /api ishlamaydi).",
    };
  }
}

/**
 * HTTP xatosini tushunarli matnga aylantirish.
 * `data` — javob JSON bo'lsa uning mazmuni, aks holda bo'sh obyekt.
 */
export function httpErrorMessage(res: Response, data: unknown, what: string): string {
  const body = (data ?? {}) as { error?: string; hint?: string; authRequired?: boolean };
  const type = res.headers.get("content-type") ?? "";
  const isJson = type.includes("application/json");

  if (res.status === 401 || body.authRequired) {
    return "Avval parol bilan kirish kerak (DASHBOARD_PASSWORD yoqilgan) — sahifani yangilab, login oynasidan kiring.";
  }
  // JSON javob keldi — serverning o'zi aniq xato yozgan (bizning route'lar shunday qiladi)
  if (isJson && body.error) return body.hint ? `${body.error} — ${body.hint}` : body.error;

  // JSON emas (HTML 404/405 sahifasi) → so'rov Express'ga yetib bormagan
  if (!isJson) {
    if (res.status === 404 || res.status === 405) {
      return `${what}: server bu manzilni topmadi (${res.status}, javob HTML). ${STATIC_MODE_HINT}`;
    }
    if (res.status >= 500) {
      return `${what}: API server javob bermadi (${res.status}). Dev rejimda \`pnpm dev\` ni ishlating — u web va api serverlarni birga ko'taradi.`;
    }
    return `${what}: server kutilmagan javob berdi (${res.status}, JSON emas).`;
  }
  return `${what}: server xatosi (${res.status}).`;
}

/**
 * POST + JSON — xato bo'lsa tushunarli Error tashlaydi.
 * Tarmoq xatosi (server o'chiq) ham alohida xabarga aylanadi.
 */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error(
      `Server bilan aloqa yo'q (${url}). API server ishga tushmagan: dev rejimda \`pnpm dev\` ni ` +
        "ishlating (u web + api ni birga ko'taradi)."
    );
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("application/json")
    ? await res.json().catch(() => ({}))
    : ((await res.text().catch(() => "")) as unknown);
  if (!res.ok) throw new Error(httpErrorMessage(res, data, "So'rov bajarilmadi"));
  return data as T;
}
