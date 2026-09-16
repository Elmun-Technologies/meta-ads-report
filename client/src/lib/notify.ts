/**
 * Desktop bildirishnomalari (Browser Notification API).
 *
 * Nima uchun: dashboard fon rejimida (boshqa tabda) turganda ham kritik
 * signallar va yangi murojaatlar ko'rinadi. Foydalanuvchi ozi yoqadi
 * (AlertsMenu'dagi qo'ng'iroq tugmasi ostidagi kalit) — hech kimdan
 * ruxsat so'ralmaydi.
 *
 * Saqlash: localStorage["desktop-notifications"] = "1" | "0"
 * Ruxsat: Notification.permission (browser beradi)
 */

const STORAGE_KEY = "desktop-notifications";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled(): boolean {
  if (!notificationsSupported()) return false;
  return (
    localStorage.getItem(STORAGE_KEY) === "1" &&
    Notification.permission === "granted"
  );
}

/** Foydalanuvchi yoqdi — browserdan ruxsat so'raymiz. Natija: yoqildimi-yo'qmi */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  if (permission !== "granted") return false;
  localStorage.setItem(STORAGE_KEY, "1");
  return true;
}

export function disableNotifications(): void {
  localStorage.setItem(STORAGE_KEY, "0");
}

/** Ruxsat berilgan bo'lsa xabar chiqaradi (aks holda jimgina o'tadi) */
export function desktopNotify(title: string, body?: string): void {
  if (!notificationsEnabled()) return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.svg",
      tag: `ads-${Date.now()}`,
    });
    // 6 sekunddan keyin yopiladi (browserga bog'liq, best-effort)
    setTimeout(() => n.close(), 6000);
  } catch {
    /* Notification constructor ba'zi muhitlarda cheklangan — jim o'tamiz */
  }
}
