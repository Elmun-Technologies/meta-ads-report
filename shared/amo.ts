/**
 * AmoCRM integratsiya qatlami:
 *   normalizeAmoExport — AmoCRM eksportini (webhook/API/MCP orqali olingan JSON) CrmData'ga aylantiradi
 *   matchLeadsToAds    — lead'larni utm_campaign bo'yicha Meta kampaniyalariga bog'laydi
 *   buildCrmAnalytics  — stage funnel, konversiyalar, CPQL, ROAS, manba kesimi
 *
 * AmoCRM hali ulanmagan bo'lsa ham UI bu funksiyalarsiz ishlaydi (empty state).
 */
import type { CampaignNode, CrmData, CrmLead, CrmSourceRow, CrmStage, CrmStageKind, CrmStageStat, CreativeNode, NormalizedSnapshot } from "./types";

type RawRow = Record<string, any>;
export interface RawAmoStage {
  id: number | string;
  name: string;
  pipeline_id: number | string;
  sort?: number;
  status?: { kind?: string; name?: string } | string;
  is_final?: boolean;
}
export interface RawAmoExport {
  account?: { name?: string; id?: string; subdomain?: string; currency?: string };
  pipelines?: { id: number | string; name: string; is_main?: boolean }[];
  stages?: RawAmoStage[];
  leads?: RawRow[];
  syncedNote?: string;
}

const stageKind = (raw: RawAmoStage): CrmStageKind => {
  const status = typeof raw.status === "object" ? raw.status : null;
  const kind = status?.kind ?? (typeof raw.status === "string" ? raw.status : "");
  const name = `${raw.name} ${status?.name ?? ""}`.toLowerCase();
  if (kind === "won" || name.includes("успешно") || name.includes("won") || name.includes("yutuq") || name.includes("bitim")) return "won";
  if (kind === "lost" || name.includes("проигр") || name.includes("lost") || name.includes("yo'qot") || name.includes("mag'lub")) return "lost";
  if (kind === "in_progress" || name.includes("perexod") || name.includes("transition")) return "in_progress";
  return "in_progress";
};

export function normalizeAmoExport(raw: RawAmoExport, opts: { syncedAt: string; file?: string }): CrmData {
  const pipelines = new Map<string, string>((raw.pipelines ?? []).map((p) => [String(p.id), p.name]));
  const stages: CrmStage[] = (raw.stages ?? []).map((s) => ({
    id: String(s.id),
    name: s.name,
    pipeline: pipelines.get(String(s.pipeline_id)) ?? "—",
    sort: Number(s.sort ?? 0),
    kind: stageKind(s),
  }));
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const leads: CrmLead[] = (raw.leads ?? []).map((l) => {
    const utm = l.utm ?? {};
    const stage = stageById.get(String(l.stage_id)) ?? stageById.get(String(l.status_id));
    return {
      id: String(l.id),
      name: l.name ?? `Lead #${l.id}`,
      createdAt: l.created_at ?? "",
      updatedAt: l.updated_at ?? "",
      stageId: stage?.id ?? "",
      stageName: stage?.name ?? l.status_name ?? "—",
      pipeline: stage?.pipeline ?? "—",
      price: Number(l.price ?? 0),
      responsible: l.responsible ?? l.responsible_user ?? null,
      contactName: l.contact?.name ?? null,
      phone: l.contact?.phone ?? null,
      utmCampaign: utm.utm_campaign ?? l.utm_campaign ?? null,
      utmContent: utm.utm_content ?? l.utm_content ?? null,
      utmSource: utm.utm_source ?? l.utm_source ?? null,
      campaignId: null,
      creativeId: null,
      history: Array.isArray(l.history)
        ? l.history.map((h: RawRow) => ({ at: String(h.at ?? h.created_at ?? ""), stage: String(h.stage ?? h.status_name ?? "") }))
        : [],
      lossReason: l.loss_reason ?? null,
    } satisfies CrmLead;
  });

  return {
    account: raw.account?.name ?? raw.account?.subdomain ?? "AmoCRM",
    currency: raw.account?.currency ?? "UZS",
    syncedAt: opts.syncedAt,
    sourceLabel: `AmoCRM snapshot${opts.file ? ` · ${opts.file}` : ""}`,
    stages: stages.sort((a, b) => a.pipeline.localeCompare(b.pipeline) || a.sort - b.sort),
    leads,
    matchedLeads: 0,
    unmatchedLeads: leads.length,
  };
}

/* ------------------------------------------------------------------ */
/* Match: UTM → Meta kampaniya/kreativ                                 */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matchLeadsToAds(crm: CrmData, snapshot: NormalizedSnapshot | null): CrmData {
  if (!snapshot) return crm;
  const byId = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const byName = new Map(snapshot.campaigns.map((c) => [norm(c.originalName), c]));
  const byCanon = new Map(snapshot.campaigns.map((c) => [norm(c.name), c]));

  const creativesByCampaign = new Map<string, CreativeNode[]>();
  for (const cr of snapshot.creatives) {
    const list = creativesByCampaign.get(cr.campaignId) ?? [];
    list.push(cr);
    creativesByCampaign.set(cr.campaignId, list);
  }

  let matched = 0;
  const leads = crm.leads.map((lead) => {
    const utm = lead.utmCampaign ? norm(lead.utmCampaign) : null;
    let campaign: CampaignNode | undefined;
    if (utm) {
      campaign = byId.get(lead.utmCampaign!) ?? byName.get(utm) ?? byCanon.get(utm);
      if (!campaign) {
        // qisman moslash: kampaniya nomi utm ichida
        campaign = snapshot.campaigns.find((c) => utm.includes(norm(c.originalName)) || norm(c.originalName).includes(utm));
      }
    }
    let creativeId: string | null = null;
    if (campaign) {
      matched += 1;
      const list = creativesByCampaign.get(campaign.id) ?? [];
      const uc = lead.utmContent ? norm(lead.utmContent) : null;
      const creative = uc ? list.find((cr) => cr.id === lead.utmContent || norm(cr.originalName) === uc || norm(cr.name) === uc) : undefined;
      creativeId = creative?.id ?? null;
    }
    return { ...lead, campaignId: campaign?.id ?? null, creativeId };
  });

  return { ...crm, leads, matchedLeads: matched, unmatchedLeads: leads.length - matched };
}

/* ------------------------------------------------------------------ */
/* Lifecycle analitikasi                                               */
/* ------------------------------------------------------------------ */

const DAY = 86400000;

/** Lead qaysi bosqichlardan o'tgan (history + hozirgi) */
const stagesReached = (lead: CrmLead): Set<string> => {
  const set = new Set<string>(lead.history.map((h) => h.stage));
  if (lead.stageName) set.add(lead.stageName);
  return set;
};

export function buildStageFunnel(crm: CrmData, snapshot: NormalizedSnapshot | null): CrmStageStat[] {
  const spentTotal = snapshot ? snapshot.campaigns.filter((c) => crm.leads.some((l) => l.campaignId === c.id)).reduce((s, c) => s + c.metrics.spend, 0) : 0;
  const totalLeads = crm.leads.length || 1;

  const now = Date.now();
  const stats: CrmStageStat[] = crm.stages.map((stage) => {
    const reachedLeads = crm.leads.filter((l) => stagesReached(l).has(stage.name) || l.stageId === stage.id);
    const inStageNow = crm.leads.filter((l) => l.stageId === stage.id);
    const days = inStageNow
      .map((l) => {
        const lastChange = l.history.length ? new Date(l.history[l.history.length - 1].at).getTime() : new Date(l.createdAt).getTime();
        return Number.isNaN(lastChange) ? null : (now - lastChange) / DAY;
      })
      .filter((d): d is number => d != null);
    return {
      stage,
      reached: reachedLeads.length,
      conversionFromPrev: null,
      costPerLead: reachedLeads.length ? (spentTotal * (reachedLeads.length / totalLeads)) / reachedLeads.length : null,
      avgDaysInStage: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
      totalPrice: reachedLeads.reduce((s, l) => s + (l.price || 0), 0),
    };
  });

  // Asosiy pipeline bo'yicha konversiyalar (won/lost dan oldingi ketma-ket bosqichlar)
  const pipeline = stats.filter((s) => s.stage.kind === "in_progress" || s.stage.kind === "new");
  let prev: number | null = null;
  for (const stat of pipeline) {
    stat.conversionFromPrev = prev && prev > 0 ? (stat.reached / prev) * 100 : null;
    prev = stat.reached;
  }
  return stats;
}

export interface CrmSummary {
  totalLeads: number;
  inProgress: number;
  won: number;
  lost: number;
  winRate: number | null;
  revenue: number;
  lostValue: number;
  pipelineValue: number;
  /** Reklama sarfi (match bo'lgan kampaniyalar) */
  spend: number;
  costPerWon: number | null;
  /** Cost per qualified lead — final bosqichlarga yetgan yetmaganidan qat'i nazar, won+lost */
  cpql: number | null;
  roas: number | null;
  avgCycleDays: number | null;
}

export function buildCrmSummary(crm: CrmData, snapshot: NormalizedSnapshot | null): CrmSummary {
  const won = crm.leads.filter((l) => crm.stages.find((s) => s.id === l.stageId)?.kind === "won");
  const lost = crm.leads.filter((l) => crm.stages.find((s) => s.id === l.stageId)?.kind === "lost");
  const inProgress = crm.leads.filter((l) => {
    const kind = crm.stages.find((s) => s.id === l.stageId)?.kind;
    return kind !== "won" && kind !== "lost";
  });
  const matchedIds = new Set(crm.leads.filter((l) => l.campaignId).map((l) => l.campaignId));
  const spend = snapshot ? snapshot.campaigns.filter((c) => matchedIds.has(c.id)).reduce((s, c) => s + c.metrics.spend, 0) : 0;

  const cycleDays = won
    .map((l) => (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);

  const decided = won.length + lost.length;
  return {
    totalLeads: crm.leads.length,
    inProgress: inProgress.length,
    won: won.length,
    lost: lost.length,
    winRate: decided ? (won.length / decided) * 100 : null,
    revenue: won.reduce((s, l) => s + (l.price || 0), 0),
    lostValue: lost.reduce((s, l) => s + (l.price || 0), 0),
    pipelineValue: inProgress.reduce((s, l) => s + (l.price || 0), 0),
    spend,
    costPerWon: won.length ? spend / won.length : null,
    cpql: decided ? spend / decided : null,
    roas: spend > 0 && won.length ? won.reduce((s, l) => s + (l.price || 0), 0) / spend : null,
    avgCycleDays: cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null,
  };
}

/** Manba kesimi: kampaniyalar bo'yicha lead taqdiri + unmatched bucket */
export function buildSourceRows(crm: CrmData, snapshot: NormalizedSnapshot | null): CrmSourceRow[] {
  const kindOf = (stageId: string) => crm.stages.find((s) => s.id === stageId)?.kind ?? "in_progress";
  const rows = new Map<string, CrmSourceRow>();

  const ensure = (key: string, label: string, kind: "campaign" | "unmatched"): CrmSourceRow => {
    let row = rows.get(key);
    if (!row) {
      row = { key, label, kind, leads: 0, inProgress: 0, won: 0, lost: 0, revenue: 0, spend: 0, costPerWon: null, roas: null };
      rows.set(key, row);
    }
    return row;
  };

  for (const lead of crm.leads) {
    const campaign = lead.campaignId ? snapshot?.campaigns.find((c) => c.id === lead.campaignId) : null;
    const row = campaign ? ensure(campaign.id, campaign.originalName, "campaign") : ensure("unmatched", "Manbasi aniqlanmagan (UTM yo'q)", "unmatched");
    row.leads += 1;
    const kind = kindOf(lead.stageId);
    if (kind === "won") {
      row.won += 1;
      row.revenue += lead.price || 0;
    } else if (kind === "lost") row.lost += 1;
    else row.inProgress += 1;
  }

  const out = [...rows.values()];
  for (const row of out) {
    if (row.kind === "campaign" && snapshot) {
      row.spend = snapshot.campaigns.find((c) => c.id === row.key)?.metrics.spend ?? 0;
    }
    row.costPerWon = row.won ? row.spend / row.won : null;
    row.roas = row.spend > 0 && row.revenue > 0 ? row.revenue / row.spend : null;
  }
  return out.sort((a, b) => b.leads - a.leads);
}
