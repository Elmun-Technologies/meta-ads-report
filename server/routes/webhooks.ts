/**
 * AmoCRM webhooks — real-time lead yangilanishlari.
 *
 * AmoCRM sozlamalarida (Sozlamalar → Integratsiyalar → Webhook'lar) quyidagi
 * URL'ni ko'rsatasiz:
 *   https://<sizingiz>/api/webhooks/amocrm
 * 
 * Qo'llab-quvvatlanadigan eventlar (AmoCRM standart formati):
 *   leads.add    — yangi lead yaratildi
 *   leads.status — bosqich o'zgardi (won/lost/mover)
 *   leads.update — lead tahrirlandi
 *
 * Har bir webhook:
 *   1. Store'dagi leadni upsert qiladi (UTM maydonlari bilan)
 *   2. Activity feed'ga yozadi → SSE orqali barcha ochiq dashboardlar
 *      darhol ko'radi ("Yangi murojaat: ..." / "Bitim bo'ldi: ...")
 *   3. /api/crm javobiga kiradi — Pipeline sahifasi real-time yangilanadi
 */
import { Router } from "express";
import { broadcast } from "../app";
import { getStore, mutate, logActivity, type StoreLead } from "../store";

export const webhooksRouter = Router();

/** AmoCRM webhook lead obyekti */
interface AmoWebhookLead {
  id: string | number;
  name?: string;
  status_id?: string | number;
  pipeline_id?: string | number;
  price?: string | number;
  responsible_user_id?: string | number;
  created_at?: number;
  updated_at?: number;
  custom_fields?: { id: string | number; name?: string; code?: string; values: { value: string }[] }[];
}

/** custom_fields ichidan maydon qiymatini topadi (nom yoki kod bo'yicha) */
function fieldValue(lead: AmoWebhookLead, keys: string[]): string | null {
  for (const f of lead.custom_fields ?? []) {
    const name = `${f.name ?? ""} ${f.code ?? ""}`.toLowerCase();
    if (keys.some(k => name.includes(k))) {
      const v = f.values?.[0]?.value;
      if (v) return v;
    }
  }
  return null;
}

/** Leadni CRM ma'lumotiga aylantiradi */
function toStoreLead(l: AmoWebhookLead, existing?: StoreLead): StoreLead {
  const now = new Date().toISOString();
  const stageName =
    existing?.stageName && existing.stageId === String(l.status_id ?? existing.stageId)
      ? existing.stageName
      : stageLabel(String(l.status_id ?? ""));
  return {
    id: String(l.id),
    name: l.name ?? existing?.name ?? `Lead #${l.id}`,
    source: "amocrm",
    createdAt: existing?.createdAt ?? (l.created_at ? new Date(l.created_at * 1000).toISOString() : now),
    updatedAt: now,
    stageId: String(l.status_id ?? existing?.stageId ?? ""),
    stageName,
    pipeline: existing?.pipeline ?? "AmoCRM",
    price: Number(l.price ?? existing?.price ?? 0),
    responsible: existing?.responsible ?? null,
    contactName: fieldValue(l, ["ism", "name", "фио"]) ?? existing?.contactName ?? null,
    phone: fieldValue(l, ["phone", "телефон", "tel"]) ?? existing?.phone ?? null,
    utmCampaign: fieldValue(l, ["utm_campaign", "utm kampaniya"]) ?? existing?.utmCampaign ?? null,
    utmContent: fieldValue(l, ["utm_content"]) ?? existing?.utmContent ?? null,
    utmSource: fieldValue(l, ["utm_source"]) ?? existing?.utmSource ?? null,
    campaignId: existing?.campaignId ?? null,
    lossReason: existing?.lossReason ?? null,
    history: existing?.history ?? [],
  };
}

/** status_id dan taxminiy bosqich nomi — aniq nomlarni bilsak utm/field'dan olamiz */
function stageLabel(statusId: string): string {
  const known: Record<string, string> = {
    "142": "Yangi murojaat",
    "143": "Bosqich 1",
    "14255867": "Sotuv",
    "14255870": "Rad etildi",
    "1": "Bog'lanilmadi",
    "2": "Sifatli lead emas",
    "3": "Bog'lanilmadi (2)",
  };
  return known[statusId] ?? `Bosqich #${statusId}`;
}

webhooksRouter.post("/amocrm", async (req, res) => {
  try {
    const payload = req.body as Record<string, Record<string, AmoWebhookLead[]>>;
    const events: string[] = [];

    for (const kind of ["add", "status", "update"] as const) {
      const leads = payload?.leads?.[kind];
      if (!Array.isArray(leads)) continue;

      for (const raw of leads) {
        const existing = getStore().leads.find(x => x.id === String(raw.id));
        const lead = mutate(store => {
          const merged = toStoreLead(raw, existing);
          // Bosqich o'zgargan bo'lsa — history'ga yozamiz
          if (existing && existing.stageId !== merged.stageId) {
            merged.history = [...existing.history, { stage: merged.stageName, at: merged.updatedAt }];
          }
          const idx = store.leads.findIndex(x => x.id === merged.id);
          if (idx >= 0) store.leads[idx] = merged;
          else store.leads.push(merged);
          return merged;
        });

        if (!existing) {
          events.push(`add:${lead.id}`);
          logActivity({
            kind: "lead",
            source: "amocrm",
            tone: "good",
            title: `Yangi murojaat: ${lead.name}`,
            body: [lead.phone, lead.utmCampaign ? `utm: ${lead.utmCampaign}` : null]
              .filter(Boolean)
              .join(" · "),
          });
        } else if (existing.stageId !== lead.stageId) {
          events.push(`status:${lead.id}`);
          logActivity({
            kind: "stage",
            source: "amocrm",
            tone: "info",
            title: `Bosqich o'zgardi: ${lead.name}`,
            body: `${existing.stageName} → ${lead.stageName}`,
          });
        } else {
          events.push(`update:${lead.id}`);
        }
      }
    }

    if (events.length > 0) {
      broadcast("sync", { at: new Date().toISOString(), source: "amocrm-webhook" });
    }
    res.status(200).json({ ok: true, processed: events.length });
  } catch (error) {
    console.error("[webhook:amocrm] Error handling webhook", error);
    res.status(500).send("Internal Error");
  }
});

/** Test uchun — webhook formatini tekshirish */
webhooksRouter.get("/amocrm", (_req, res) => {
  res.json({
    ok: true,
    hint: "AmoCRM → Sozlamalar → Integratsiyalar → Webhook'lar → shu URL'ni leads.add/status/update eventlariga bog'lang",
    example: {
      leads: {
        add: [
          {
            id: "12345",
            name: "Test lead",
            status_id: "142",
            price: "1000000",
            custom_fields: [
              { id: "1", name: "Phone", values: [{ value: "+998901234567" }] },
              { id: "2", name: "utm_campaign", values: [{ value: "123456789" }] },
            ],
          },
        ],
      },
    },
  });
});
