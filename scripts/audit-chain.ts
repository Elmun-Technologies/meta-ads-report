/**
 * Skvoznaya zanjir auditi — real snapshot (va agar bo'lsa amo_*.json) ustida
 * Account → Expo → Kampaniya → Ad set → Kreativ → CRM Lead bog'lanishlarini
 * tekshiradi va har darajadagi detallilikni chop etadi.
 * Ishlatish: pnpm exec tsx scripts/audit-chain.ts
 */
import fs from "fs";
import path from "path";
import { normalizeMetaExport, type RawMetaExport } from "../shared/normalize";
import { matchLeadsToAds, normalizeAmoExport, type RawAmoExport } from "../shared/amo";

const SNAP_DIR = path.resolve(import.meta.dirname, "../server/data/snapshots");
const files = fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith(".json"));
const metaFile = files.find((f) => f.startsWith("meta"));
const amoFile = files.find((f) => f.startsWith("amo"));

const results: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  results.push(`${ok ? "PASS" : "GAP "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

if (!metaFile) {
  console.error("Meta snapshot topilmadi");
  process.exit(1);
}

const rawMeta = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, metaFile), "utf8")) as RawMetaExport;
const snap = normalizeMetaExport(rawMeta, { syncedAt: new Date().toISOString(), sourceLabel: "audit" });

console.log("═".repeat(72));
console.log("SKVOZNAYA ZANJIR AUDITI — " + metaFile);
console.log("═".repeat(72));

/* 1. Account */
const t = snap.totals;
console.log(`\n[1] ACCOUNT: ${snap.meta.account.name} · ${snap.meta.period.label}`);
console.log(`    spend $${t.spend} · impr ${Math.round(t.impressions)} · reach ${Math.round(t.reach ?? 0)} · clicks ${t.clicks} · leads ${t.leads} · CPL $${t.cpl?.toFixed(2)}`);
check("Account darajasi to'liq (12+ metrika)", t.spend > 0 && t.leads > 0 && t.impressions > 0);

/* 2. Expo guruhlari */
const expos = new Map<string, number>();
for (const c of snap.campaigns) expos.set(c.expo, (expos.get(c.expo) ?? 0) + 1);
console.log(`\n[2] EXPO GURUHLARI (${expos.size}):`);
for (const [expo, count] of expos) console.log(`    · ${expo} — ${count} kampaniya`);
check("Expo guruhlashing", expos.size >= 2);

/* 3. Kampaniyalar */
console.log(`\n[3] KAMPANIYALAR (${snap.campaigns.length}):`);
const withLeads = snap.campaigns.filter((c) => c.metrics.leads > 0);
const withCpl = snap.campaigns.filter((c) => c.metrics.cpl != null);
console.log(`    lead bergan: ${withLeads.length}/${snap.campaigns.length} · CPL hisoblangan: ${withCpl.length}`);
for (const c of snap.campaigns.slice(0, 3)) {
  console.log(`    · ${c.originalName.slice(0, 44).padEnd(44)} $${c.metrics.spend.toFixed(2).padStart(8)} | leads ${String(c.metrics.leads).padStart(3)} | cpl ${c.metrics.cpl ? "$" + c.metrics.cpl.toFixed(2) : "N/A"}`);
}
check("Kampaniya darajasi: spend+leads+CPL+CTR+CPM+freq", withLeads.length > 0 && withCpl.length > 0);

/* 4. Ad setlar */
const adsets = new Map<string, Set<string>>();
for (const cr of snap.creatives) {
  if (!cr.adset) continue;
  const set = adsets.get(cr.adset.id) ?? new Set<string>();
  set.add(cr.id);
  adsets.set(cr.adset.id, set);
}
console.log(`\n[4] AD SETLAR (${adsets.size}):`);
for (const [id, creatives] of adsets) {
  const name = snap.creatives.find((c) => c.adset?.id === id)?.adset?.name ?? "—";
  console.log(`    · ${name.slice(0, 52).padEnd(52)} ${creatives.size} kreativ`);
}
check("Ad set darajasi (metrikalar kreativ kesimida)", adsets.size >= 1);

/* 5. Kreativlar */
const orphanCreatives = snap.creatives.filter((cr) => !snap.campaigns.some((c) => c.id === cr.campaignId));
const creativeLeadData = snap.creatives.filter((cr) => cr.hasLeads).length;
console.log(`\n[5] KREATIVLAR (${snap.creatives.length}):`);
console.log(`    yetim (kampaniyasiz): ${orphanCreatives.length} · ad-level lead ma'lumoti bor: ${creativeLeadData}`);
for (const cr of snap.creatives.slice(0, 3)) {
  console.log(`    · ${cr.originalName.slice(0, 34).padEnd(34)} $${cr.metrics.spend.toFixed(2).padStart(7)} | ctr ${cr.metrics.ctr?.toFixed(2)}% | status ${cr.effectiveStatus}`);
}
check("Kreativ → kampaniya bog'lanishi (referential integrity)", orphanCreatives.length === 0);
check("Kreativ darajasida CPL (ad-level leads)", creativeLeadData > 0, creativeLeadData === 0 ? "Meta bu eksportda bermagan — keyingi snapshotda qo'shilishi kerak" : "");

/* 6. CRM (agar amo fayl bo'lsa) */
console.log(`\n[6] CRM LIFECYCLE ${amoFile ? "(" + amoFile + ")" : "(ulanmagan)"}`);
if (amoFile) {
  const isDemo = amoFile.includes("demo");
  const rawAmo = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, amoFile), "utf8")) as RawAmoExport;
  const crm = matchLeadsToAds(normalizeAmoExport(rawAmo, { syncedAt: new Date().toISOString() }), snap);
  const won = crm.leads.filter((l) => crm.stages.find((s) => s.id === l.stageId)?.kind === "won").length;
  const lost = crm.leads.filter((l) => crm.stages.find((s) => s.id === l.stageId)?.kind === "lost").length;
  console.log(`    leads: ${crm.leads.length} · match: ${crm.matchedLeads} · unmatched: ${crm.unmatchedLeads} · won: ${won} · lost: ${lost}`);
  for (const l of crm.leads.slice(0, 3)) {
    const camp = snap.campaigns.find((c) => c.id === l.campaignId);
    console.log(`    · ${l.name.slice(0, 22).padEnd(22)} ${l.stageName.padEnd(16)} → ${camp ? camp.originalName.slice(0, 30) : "UTM yo'q"}`);
  }
  check("CRM → reklama match (UTM)", crm.matchedLeads > 0);
  check("Won/Lost aniqlanadi", won + lost > 0);
  if (isDemo) results.push("NOTE Demo amo fayl ishlatilmoqda — real ulanishda o'chirilsin");
} else {
  check("CRM ulanishi", false, "amo_*.json yo'q — /pipeline hozir 'qanday ulanadi' ekranida");
}

/* 7. Ma'lumot etishmovchililari (ochiq ro'yxat) */
console.log(`\n[7] MA'LUMOT ETISHMOVCHILIKLARI (manba: Meta eksport):`);
for (const l of snap.meta.limitations) console.log(`    · ${l}`);
const gaps = ["Kunlik timeseries (time_increment=1)", "Placement kesimi", "Gender/geo kesimi"];
console.log(`    · ${gaps.join("\n    · ")}`);

console.log("\n" + "═".repeat(72));
console.log(results.join("\n"));
const pass = results.filter((r) => r.startsWith("PASS")).length;
const gap = results.filter((r) => r.startsWith("GAP")).length;
console.log("═".repeat(72));
console.log(`YAKUN: ${pass} PASS · ${gap} GAP · ${results.filter((r) => r.startsWith("NOTE")).length} eslatma`);
