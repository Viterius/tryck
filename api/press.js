/**
 * ─── /api/press ───────────────────────────────────────────────────
 * The press counter. GET returns the total number of posters ever
 * pressed; POST presses one more and returns the new total.
 *
 * Backed by a Redis store connected through the Vercel Marketplace
 * (Upstash). If no store is connected, returns { n: null } and the
 * app falls back to a local number — TRYCK works fine without it.
 * Nothing else is stored. Ever.
 */
export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  res.setHeader("Cache-Control", "no-store");

  if (!url || !token) return res.status(200).json({ n: null });

  try {
    const cmd = req.method === "POST" ? "INCR/presses" : "GET/presses";
    const r = await fetch(`${url}/${cmd}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    return res.status(200).json({ n: Number(j.result) || 0 });
  } catch {
    return res.status(200).json({ n: null });
  }
}
