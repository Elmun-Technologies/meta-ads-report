/**
 * Offline manbalar — banner, QR, flyer va boshqa offline kanallar.
 *
 * Endpointlar:
 *   POST /api/channels/offline/campaign — offline kampaniya qo'shish
 *   POST /api/channels/offline/lead     — offline lead qo'shish
 *   GET  /api/channels/offline          — ro'yxat (UI uchun)
 *
 * Har bir o'zgarish SSE + activity feed orqali real-time ko'rinadi.
 */
import { Router } from "express";
import { broadcast } from "../app";
import { getStore, mutate, logActivity, type OfflineCampaign } from "../store";

export const offlineChannelsRouter = Router();

offlineChannelsRouter.post("/campaign", (req, res) => {
  try {
    const { id, name, expo, spend } = req.body as {
      id?: string;
      name?: string;
      expo?: string;
      spend?: number;
    };
    if (!name) {
      res.status(400).json({ error: "name maydoni kerak" });
      return;
    }
    const campaign = mutate(store => {
      const created: OfflineCampaign = {
        id: id || `offline-${Date.now()}`,
        name,
        originalName: name,
        objective: "offline",
        expo: expo || "Umumiy",
        platform: "offline",
        goal: "leads",
        createdAt: new Date().toISOString(),
        metrics: { spend: spend || 0, impressions: 0, clicks: 0, linkClicks: 0, leadsCount: 0 },
      };
      store.offlineCampaigns.push(created);
      return created;
    });

    logActivity({
      kind: "channel",
      source: "offline",
      tone: "good",
      title: `Offline manba qo'shildi: ${name}`,
      body: `Sarf: ${spend || 0}`,
    });
    broadcast("sync", { at: new Date().toISOString(), source: "offline-channel" });
    res.json(campaign);
  } catch (error) {
    console.error("[offline-channels] Error creating campaign", error);
    res.status(500).send("Internal Error");
  }
});

offlineChannelsRouter.post("/lead", (req, res) => {
  try {
    const { name, phone, campaignId, price } = req.body as {
      name?: string;
      phone?: string;
      campaignId?: string;
      price?: number;
    };
    if (!name) {
      res.status(400).json({ error: "name maydoni kerak" });
      return;
    }
    const lead = mutate(store => {
      const now = new Date().toISOString();
      const created = {
        id: `lead-offline-${Date.now()}`,
        name,
        phone: phone ?? null,
        source: "offline" as const,
        createdAt: now,
        updatedAt: now,
        stageId: "new",
        stageName: "Yangi",
        pipeline: "Offline",
        price: price || 0,
        campaignId: campaignId ?? null,
        history: [{ stage: "Yangi", at: now }],
      };
      store.leads.push(created);

      if (campaignId) {
        const camp = store.offlineCampaigns.find(c => c.id === campaignId);
        if (camp) camp.metrics.leadsCount += 1;
      }
      return created;
    });

    logActivity({
      kind: "lead",
      source: "offline",
      tone: "good",
      title: `Yangi offline murojaat: ${name}`,
      body: phone ? `Tel: ${phone}` : undefined,
    });
    broadcast("sync", { at: new Date().toISOString(), source: "offline-lead" });
    res.json(lead);
  } catch (error) {
    console.error("[offline-channels] Error creating lead", error);
    res.status(500).send("Internal Error");
  }
});

offlineChannelsRouter.get("/", (_req, res) => {
  const store = getStore();
  res.json({ campaigns: store.offlineCampaigns, leads: store.leads.filter(l => l.source === "offline") });
});
