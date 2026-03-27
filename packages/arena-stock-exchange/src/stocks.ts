/** The 20 stocks in the simulated market with starting prices and volatility */
export interface StockConfig {
  ticker: string;
  startPrice: number;
  volatility: number; // per-tick volatility (0.001 to 0.005)
}

export const STOCKS: StockConfig[] = [
  { ticker: "NVDA", startPrice: 142.30, volatility: 0.004 },
  { ticker: "AAPL", startPrice: 215.80, volatility: 0.002 },
  { ticker: "MSFT", startPrice: 460.50, volatility: 0.002 },
  { ticker: "GOOG", startPrice: 178.90, volatility: 0.003 },
  { ticker: "AMZN", startPrice: 198.60, volatility: 0.003 },
  { ticker: "META", startPrice: 612.40, volatility: 0.003 },
  { ticker: "TSLA", startPrice: 388.10, volatility: 0.005 },
  { ticker: "BRK", startPrice: 480.20, volatility: 0.001 },
  { ticker: "JPM", startPrice: 195.30, volatility: 0.002 },
  { ticker: "JNJ", startPrice: 168.20, volatility: 0.001 },
  { ticker: "V", startPrice: 285.40, volatility: 0.002 },
  { ticker: "WMT", startPrice: 172.50, volatility: 0.001 },
  { ticker: "PG", startPrice: 158.90, volatility: 0.001 },
  { ticker: "MA", startPrice: 468.30, volatility: 0.002 },
  { ticker: "HD", startPrice: 356.70, volatility: 0.002 },
  { ticker: "DIS", startPrice: 112.40, volatility: 0.003 },
  { ticker: "NFLX", startPrice: 498.20, volatility: 0.004 },
  { ticker: "AMD", startPrice: 164.50, volatility: 0.004 },
  { ticker: "CRM", startPrice: 278.90, volatility: 0.003 },
  { ticker: "PYPL", startPrice: 72.30, volatility: 0.003 },
];

export const TICKER_SET = new Set(STOCKS.map((s) => s.ticker));
