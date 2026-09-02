import type { ReactNode } from "react";
import { HelpCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Atamalar lug'ati — har bir metrikaning oddiy tildagi izohi.
 * UI'da nom yonidagi kichik "?" belgisi orqali ko'rsatiladi.
 */
export const TERMS: Record<string, { uz: string; en: string; body: string }> = {
  spend: {
    uz: "Sarf",
    en: "Spend",
    body: "Shu davrda reklamaga ketgan jami pul.",
  },
  leads: {
    uz: "Murojaatlar",
    en: "Leads",
    body: "Forma to‘ldirgan, xabar yozgan yoki qo‘ng‘iroq qilgan odamlar soni.",
  },
  cpl: {
    uz: "Murojaat narxi",
    en: "Cost per lead (CPL)",
    body: "Sarf ÷ murojaatlar soni. Bitta mijoz murojaati qanchaga tushgani. Kam bo‘lsa — yaxshi.",
  },
  ctr: {
    uz: "Bosish ulushi",
    en: "CTR",
    body: "Reklamani ko‘rganlarning necha foizi bosgan. Meta’da o‘rtacha 0.9% — 1.5% hisoblanadi.",
  },
  cpc: {
    uz: "Bosish narxi",
    en: "CPC",
    body: "Har bir bosish uchun to‘langan o‘rtacha summa.",
  },
  cpm: {
    uz: "1000 ko‘rsatuv narxi",
    en: "CPM",
    body: "Reklama 1000 marta ko‘rsatilishi uchun to‘langan summa.",
  },
  reach: {
    uz: "Qamrov",
    en: "Reach",
    body: "Reklamani ko‘rgan noyob (takrorsiz) odamlar soni.",
  },
  impressions: {
    uz: "Ko‘rsatuvlar",
    en: "Impressions",
    body: "Reklama necha marta ekranda chiqqan — bir odam bir necha marta ko‘rishi ham kiradi.",
  },
  clicks: {
    uz: "Bosishlar",
    en: "Clicks",
    body: "Reklamadagi har qanday bosish (havola, rasm, tugma, profil). Havola bosish alohida hisoblanadi.",
  },
  linkClicks: {
    uz: "Havola bosishlar",
    en: "Link clicks",
    body: "Faqat havola (sayt/landing) ustiga bosishlar — murojaatgacha bo‘lgan asosiy yo‘l.",
  },
  landingPageViews: {
    uz: "Sahifaga o‘tish",
    en: "Landing page views",
    body: "Bosib o‘tgan va sahifa to‘liq ochilgan holatlar soni.",
  },
  frequency: {
    uz: "Takroriylik",
    en: "Frequency",
    body: "Bitta odam reklamani o‘rtacha necha marta ko‘rgan. 3 va undan yuqori bo‘lsa — auditoriya charchaydi.",
  },
  engagement: {
    uz: "Interaksiya",
    en: "Post engagement",
    body: "Reaksiya, komment, saqlash va bosishlar yig‘indisi.",
  },
  videoViews: {
    uz: "Video ko‘rish",
    en: "Video views",
    body: "Video kamida 30 soniya (yoki oxirigacha) ko‘rilgan holatlar.",
  },
  messaging: {
    uz: "Suhbatlar",
    en: "Messaging conversations",
    body: "Reklamadan boshlangan yozishma (Messenger/Instagram Direct) soni.",
  },
  expo: {
    uz: "Expo",
    en: "Expo",
    body: "Kampaniya nomidan ajratib olingan ko‘rgazma/yo‘nalish nomi — sarf shu kesimda guruhlanadi.",
  },
  utm: {
    uz: "UTM belgisi",
    en: "UTM",
    body: "Reklama havolasidagi kichik belgi. U orqali CRM’dagi murojaat qaysi kampaniyadan kelgani aniqlanadi.",
  },
  roas: {
    uz: "Qaytim",
    en: "ROAS",
    body: "Har 1 birlik sarfga qancha tushum qaytgani. 1.0 dan yuqori bo‘lsa — reklama o‘zini oqlaydi.",
  },
  winRate: {
    uz: "Yutuq ulushi",
    en: "Win rate",
    body: "Yakunlangan murojaatlarning necha foizi haqiqiy bitimga aylangan.",
  },
  costPerWon: {
    uz: "Bitim tannarxi",
    en: "Cost per WON",
    body: "Sarf ÷ yutilgan bitimlar soni. Haqiqiy mijoz narxi.",
  },
  stage: {
    uz: "Bosqich",
    en: "CRM stage",
    body: "Murojaatning AmoCRM’dagi joylashuvi: yangi → bog‘lanildi → taklif → bitim/yopildi.",
  },
  pacing: {
    uz: "Sarf sur’ati",
    en: "Pacing",
    body: "Kuniga o‘rtacha qancha sarflanayotgani va shu sur’atda oy oxiriga qancha bo‘lishi.",
  },
  anomaly: {
    uz: "G‘ayrioddiy qiymat",
    en: "Anomaly",
    body: "Ko‘rsatkich boshqa kampaniyalarga nisbatan keskin farq qilganda (statistik chetlanish) belgilanadi.",
  },
  benchmark: {
    uz: "Taqqoslash",
    en: "Benchmark",
    body: "Kampaniya ko‘rsatkichining hisob bo‘yicha o‘rtachaga nisbatan farqi.",
  },
};

export function Term({
  id,
  children,
  label,
}: {
  id: keyof typeof TERMS | string;
  children?: ReactNode;
  label?: string;
}) {
  const term = TERMS[id];
  if (!term) return <>{children ?? label ?? id}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="term">
          {children ?? label ?? term.uz}
          <HelpCircle size={11} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="tip-box" sideOffset={6}>
        <b>
          {term.uz}{" "}
          <span style={{ color: "var(--text-3)", fontWeight: 500 }}>
            ({term.en})
          </span>
        </b>
        {term.body}
      </TooltipContent>
    </Tooltip>
  );
}

/** Sahifa tepasidagi qisqa yo'riqnoma — "bu sahifada nima ko'rasiz" */
export function PageHint({ children }: { children: ReactNode }) {
  return (
    <div className="page-hint">
      <Info size={14} />
      <div>{children}</div>
    </div>
  );
}
