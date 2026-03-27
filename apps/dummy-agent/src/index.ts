import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3001", 10);
const AGENT_SECRET = process.env.AGENT_SECRET || "dev-secret";

/** Verify HMAC signature from the platform */
function verifySignature(body: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", AGENT_SECRET)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Simple random trading strategy:
 * - 30% chance to buy a random stock (1-10 shares)
 * - 20% chance to sell a held stock
 * - 50% chance to hold
 */
app.post("/decide", (req, res) => {
  // Verify signature (skip in dev if no secret set)
  if (AGENT_SECRET !== "dev-secret") {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers["x-platform-signature"] as string | undefined;
    if (!verifySignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const { portfolio, market } = req.body;
  const orders: Array<{ action: string; ticker: string; quantity: number }> = [];
  const tickers = Object.keys(market || {});

  if (tickers.length === 0) {
    res.json({ orders: [] });
    return;
  }

  const roll = Math.random();

  if (roll < 0.3 && portfolio.cash > 1000) {
    // Buy a random stock
    const ticker = tickers[Math.floor(Math.random() * tickers.length)];
    const price = market[ticker].price;
    const maxAffordable = Math.floor((portfolio.cash * 0.1) / price); // spend up to 10% of cash
    const quantity = Math.max(1, Math.floor(Math.random() * Math.min(maxAffordable, 10)));
    orders.push({ action: "buy", ticker, quantity });
  } else if (roll < 0.5) {
    // Sell a held stock
    const heldTickers = Object.keys(portfolio.holdings || {}).filter(
      (t: string) => portfolio.holdings[t] > 0
    );
    if (heldTickers.length > 0) {
      const ticker = heldTickers[Math.floor(Math.random() * heldTickers.length)];
      const held = portfolio.holdings[ticker];
      const quantity = Math.max(1, Math.floor(Math.random() * held));
      orders.push({ action: "sell", ticker, quantity });
    }
  }
  // else: hold (do nothing)

  res.json({ orders });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "dummy-random-trader" });
});

app.listen(PORT, () => {
  console.log(`Dummy agent listening on port ${PORT}`);
});
