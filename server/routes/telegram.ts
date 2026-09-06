/**
 * Telegram kanal statistikasi — TGStat API integratsiyasi
 * 
 * Endpointlar:
 *   GET  /api/telegram/channels       — barcha ulangan kanallar
 *   POST /api/telegram/channels       — yangi kanal qo'shish (@username)
 *   GET  /api/telegram/channels/:id/sync — kanalni TGStat dan yangilash
 *   GET  /api/telegram/posts          — kanal postlari (query: channelId)
 *   POST /api/telegram/posts/:id/cost — post uchun narx kiritish
 */
import { Router } from "express";
import { prisma } from "../db";

const TGSTAT_BASE = "https://api.tgstat.ru";

function getToken(): string | null {
  return process.env.TGSTAT_TOKEN ?? null;
}

async function tgstatGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const token = getToken();
  if (!token) return null;
  const qs = new URLSearchParams({ token, ...params }).toString();
  try {
    const res = await fetch(`${TGSTAT_BASE}${endpoint}?${qs}`);
    if (!res.ok) {
      console.error(`[tgstat] ${endpoint} → ${res.status} ${res.statusText}`);
      return null;
    }
    const json = await res.json() as any;
    if (json.status !== "ok") {
      console.error(`[tgstat] ${endpoint} → status: ${json.status}`, json.error);
      return null;
    }
    return json.response as T;
  } catch (err) {
    console.error(`[tgstat] ${endpoint} xato:`, err);
    return null;
  }
}

interface TGStatChannelStat {
  id: number;
  title: string;
  username: string;
  participants_count: number;
  avg_post_reach: number;
  adv_post_reach_12h: number;
  adv_post_reach_24h: number;
  adv_post_reach_48h: number;
  err_percent: number;
  daily_reach: number;
  forwards_count: number;
  mentions_count: number;
  posts_count: number;
}

interface TGStatPost {
  id: number;
  date: number; // unix timestamp
  views: number;
  link: string;
  channel_id: number;
  forwarded_from: number | null;
  is_deleted: number;
  text: string;
  media?: { type: string };
  forwards?: number;
  reactions?: number;
  shares?: number;
  comments_count?: number;
}

export const telegramRouter = Router();

// GET /api/telegram/channels — barcha kanallar
telegramRouter.get("/channels", async (_req, res) => {
  try {
    const channels = await prisma.telegramChannel.findMany({
      include: {
        posts: {
          orderBy: { date: "desc" },
          take: 5,
        },
      },
      orderBy: { syncedAt: "desc" },
    });
    const hasToken = !!getToken();
    res.json({ channels, hasToken });
  } catch (err) {
    console.error("[telegram] channels list xato:", err);
    res.status(500).json({ error: "Kanallar ro'yxatini o'qishda xato" });
  }
});

// POST /api/telegram/channels — yangi kanal qo'shish
telegramRouter.post("/channels", async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username) {
    res.status(400).json({ error: "username maydoni kerak (@channelname)" });
    return;
  }

  const cleanUsername = username.startsWith("@") ? username : `@${username}`;

  // TGStat dan kanal ma'lumotlarini olish
  const stat = await tgstatGet<TGStatChannelStat>("/channels/stat", {
    channelId: cleanUsername,
  });

  try {
    const channel = await prisma.telegramChannel.upsert({
      where: { username: cleanUsername },
      create: {
        username: cleanUsername,
        name: stat?.title ?? cleanUsername,
        subscribers: stat?.participants_count ?? 0,
        avgPostReach: stat?.avg_post_reach ?? 0,
        advReach12h: stat?.adv_post_reach_12h ?? 0,
        advReach24h: stat?.adv_post_reach_24h ?? 0,
        advReach48h: stat?.adv_post_reach_48h ?? 0,
        errPercent: stat?.err_percent ?? 0,
        dailyReach: stat?.daily_reach ?? 0,
        forwardsCount: stat?.forwards_count ?? 0,
        mentionsCount: stat?.mentions_count ?? 0,
        postsCount: stat?.posts_count ?? 0,
        tgstatId: stat?.id ?? null,
        syncedAt: new Date(),
      },
      update: {
        name: stat?.title ?? cleanUsername,
        subscribers: stat?.participants_count ?? 0,
        avgPostReach: stat?.avg_post_reach ?? 0,
        advReach12h: stat?.adv_post_reach_12h ?? 0,
        advReach24h: stat?.adv_post_reach_24h ?? 0,
        advReach48h: stat?.adv_post_reach_48h ?? 0,
        errPercent: stat?.err_percent ?? 0,
        dailyReach: stat?.daily_reach ?? 0,
        forwardsCount: stat?.forwards_count ?? 0,
        mentionsCount: stat?.mentions_count ?? 0,
        postsCount: stat?.posts_count ?? 0,
        tgstatId: stat?.id ?? null,
        syncedAt: new Date(),
      },
    });

    // Postlarni ham sync qilish
    if (stat?.id) {
      await syncChannelPosts(channel.id, cleanUsername);
    }

    res.json({ channel, synced: !!stat });
  } catch (err) {
    console.error("[telegram] kanal qo'shishda xato:", err);
    res.status(500).json({ error: "Kanal qo'shishda xato yuz berdi" });
  }
});

// GET /api/telegram/channels/:id/sync — kanalni qayta sync qilish
telegramRouter.get("/channels/:id/sync", async (req, res) => {
  try {
    const channel = await prisma.telegramChannel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) {
      res.status(404).json({ error: "Kanal topilmadi" });
      return;
    }

    const stat = await tgstatGet<TGStatChannelStat>("/channels/stat", {
      channelId: channel.username,
    });

    if (stat) {
      await prisma.telegramChannel.update({
        where: { id: channel.id },
        data: {
          name: stat.title,
          subscribers: stat.participants_count,
          avgPostReach: stat.avg_post_reach,
          advReach12h: stat.adv_post_reach_12h ?? 0,
          advReach24h: stat.adv_post_reach_24h ?? 0,
          advReach48h: stat.adv_post_reach_48h ?? 0,
          errPercent: stat.err_percent,
          dailyReach: stat.daily_reach,
          forwardsCount: stat.forwards_count,
          mentionsCount: stat.mentions_count,
          postsCount: stat.posts_count,
          tgstatId: stat.id,
          syncedAt: new Date(),
        },
      });

      await syncChannelPosts(channel.id, channel.username);
    }

    const updated = await prisma.telegramChannel.findUnique({
      where: { id: channel.id },
      include: { posts: { orderBy: { date: "desc" }, take: 20 } },
    });
    res.json({ channel: updated, synced: !!stat });
  } catch (err) {
    console.error("[telegram] sync xato:", err);
    res.status(500).json({ error: "Sync xatosi" });
  }
});

// GET /api/telegram/posts — kanal postlari
telegramRouter.get("/posts", async (req, res) => {
  const channelId = req.query.channelId as string | undefined;
  try {
    const posts = await prisma.telegramPost.findMany({
      where: channelId ? { channelId } : undefined,
      include: { channel: { select: { username: true, name: true } } },
      orderBy: { date: "desc" },
      take: 50,
    });
    res.json({ posts });
  } catch (err) {
    console.error("[telegram] posts xato:", err);
    res.status(500).json({ error: "Postlarni o'qishda xato" });
  }
});

// POST /api/telegram/posts/:id/cost — post narxini kiritish
telegramRouter.post("/posts/:id/cost", async (req, res) => {
  const { cost } = req.body as { cost?: number };
  if (cost == null || cost < 0) {
    res.status(400).json({ error: "cost maydoni kerak (0 yoki undan katta son)" });
    return;
  }
  try {
    const post = await prisma.telegramPost.update({
      where: { id: req.params.id },
      data: { cost },
    });
    res.json({ post });
  } catch (err) {
    console.error("[telegram] cost update xato:", err);
    res.status(500).json({ error: "Narx yangilashda xato" });
  }
});

/** TGStat dan kanal postlarini tortib, bazaga yozish */
async function syncChannelPosts(dbChannelId: string, username: string) {
  const posts = await tgstatGet<{ items: TGStatPost[] }>("/channels/posts", {
    channelId: username,
    limit: "30",
  });

  if (!posts?.items) return;

  for (const p of posts.items) {
    if (p.is_deleted) continue;

    const postId = String(p.id);
    await prisma.telegramPost.upsert({
      where: { id: postId },
      create: {
        id: postId,
        tgstatPostId: postId,
        channelId: dbChannelId,
        text: (p.text ?? "").slice(0, 500),
        date: new Date(p.date * 1000),
        views: p.views ?? 0,
        shares: p.shares ?? 0,
        forwards: p.forwards ?? 0,
        reactions: p.reactions ?? 0,
        commentsCount: p.comments_count ?? 0,
        link: p.link ?? "",
        syncedAt: new Date(),
      },
      update: {
        text: (p.text ?? "").slice(0, 500),
        views: p.views ?? 0,
        shares: p.shares ?? 0,
        forwards: p.forwards ?? 0,
        reactions: p.reactions ?? 0,
        commentsCount: p.comments_count ?? 0,
        link: p.link ?? "",
        syncedAt: new Date(),
      },
    });
  }
}

/** Telegram ma'lumotlarini unified snapshot uchun olish */
export async function getTelegramStats() {
  const channels = await prisma.telegramChannel.findMany({
    include: {
      posts: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  return channels;
}
