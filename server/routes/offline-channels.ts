import { Router } from "express";
import { prisma } from "../db";
import { broadcast } from "../app";

export const offlineChannelsRouter = Router();

offlineChannelsRouter.post("/campaign", async (req, res) => {
  try {
    const { id, name, expo, spend } = req.body;
    const campaign = await prisma.campaign.create({
      data: {
        id: id || `offline-${Date.now()}`,
        name,
        originalName: name,
        expo: expo || "General",
        platform: "offline",
        goal: "leads",
        metrics: {
          create: {
            spend: spend || 0,
            clicks: 0,
            linkClicks: 0,
            leadsCount: 0,
          }
        }
      }
    });
    
    broadcast("sync", { at: new Date().toISOString(), source: "offline-channel" });
    res.json(campaign);
  } catch (error) {
    console.error("[offline-channels] Error creating campaign", error);
    res.status(500).send("Internal Error");
  }
});

offlineChannelsRouter.post("/lead", async (req, res) => {
  try {
    const { name, phone, campaignId, price } = req.body;
    const lead = await prisma.lead.create({
      data: {
        id: `lead-offline-${Date.now()}`,
        name,
        phone,
        campaignId,
        stageId: "new",
        stageName: "Yangi",
        pipeline: "Offline",
        price: price || 0,
        history: {
          create: {
            stage: "Yangi"
          }
        }
      }
    });
    
    if (campaignId) {
      await prisma.metrics.updateMany({
        where: { campaign: { id: campaignId } },
        data: { leadsCount: { increment: 1 } }
      });
    }

    broadcast("sync", { at: new Date().toISOString(), source: "offline-lead" });
    res.json(lead);
  } catch (error) {
    console.error("[offline-channels] Error creating lead", error);
    res.status(500).send("Internal Error");
  }
});
