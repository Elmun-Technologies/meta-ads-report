/**
 * Vercel serverless funksiyasi — /api/* so'rovlarining hammasi shu yerga keladi
 * (catch-all: [[...slug]]). Statik client (dist/public) Vercel tomonidan
 * to'g'ridan-to'g'ri beriladi, bu funksiya faqat API route'larni ushlaydi.
 */
import { createApp } from "../server/app";

const app = createApp("serverless");

export default app;
