import { Router } from "express";
import { prisma } from "../db";
import { broadcast } from "../app";

export const webhooksRouter = Router();

webhooksRouter.post("/amocrm", async (req, res) => {
  try {
    const payload = req.body;
    console.log("[webhook:amocrm] Received payload");

    // Here we can parse AmoCRM webhooks and upsert to DB in real time.
    // E.g., req.body.leads.status[0].id

    // Broadcast the update to connected clients via SSE
    broadcast("sync", { at: new Date().toISOString(), source: "amocrm-webhook" });

    res.status(200).send("OK");
  } catch (error) {
    console.error("[webhook:amocrm] Error handling webhook", error);
    res.status(500).send("Internal Error");
  }
});
