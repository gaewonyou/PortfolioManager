import { describe, expect, it } from "vitest";
import { buildPortfolioView } from "./portfolio";
import type { PortfolioData } from "../types";

const sampleData: PortfolioData = {
  meta: {
    title: "테스트",
    generatedAt: "2026-03-14T09:00:00.000Z",
    lastSyncedAt: "2026-03-14T09:00:00.000Z",
    owner: "owner",
    repo: "repo",
    branch: "main",
    workflowFile: "sync-portfolio.yml",
    adminModeAvailable: true
  },
  positions: [
    {
      id: "p1",
      ticker: "AAPL",
      name: "Apple",
      market: "NASDAQ",
      assetType: "STOCK",
      account: "US Broker",
      currency: "USD",
      country: "미국",
      quantity: 5,
      averageCost: 180,
      price: 210,
      previousClose: 205
    }
  ],
  transactions: [
    {
      id: "t1",
      date: "2026-01-10",
      ticker: "AAPL",
      name: "Apple",
      market: "NASDAQ",
      assetType: "STOCK",
      account: "US Broker",
      side: "BUY",
      quantity: 10,
      price: 150,
      fees: 5,
      taxes: 0,
      currency: "USD"
    },
    {
      id: "t2",
      date: "2026-02-20",
      ticker: "AAPL",
      name: "Apple",
      market: "NASDAQ",
      assetType: "STOCK",
      account: "US Broker",
      side: "SELL",
      quantity: 5,
      price: 200,
      fees: 5,
      taxes: 0,
      currency: "USD"
    }
  ],
  cashBalances: [
    {
      id: "c1",
      account: "US Broker",
      currency: "USD",
      amount: 500
    }
  ],
  fxRates: [
    {
      pair: "USDKRW",
      base: "USD",
      quote: "KRW",
      rate: 1320
    }
  ]
};

describe("buildPortfolioView", () => {
  it("calculates realized and unrealized gains with average cost", () => {
    const view = buildPortfolioView(sampleData, "USD", {
      market: "ALL",
      assetType: "ALL",
      account: "ALL",
      holdingsOnly: true,
      search: ""
    });

    expect(view.summary.realizedGain).toBe(242.5);
    expect(view.summary.unrealizedGain).toBe(150);
    expect(view.positions[0]?.marketValue).toBe(1050);
    expect(view.transactions[0]?.runningQuantity).toBe(5);
  });

  it("converts values to KRW", () => {
    const view = buildPortfolioView(sampleData, "KRW", {
      market: "ALL",
      assetType: "ALL",
      account: "ALL",
      holdingsOnly: true,
      search: ""
    });

    expect(view.summary.totalAssetValue).toBe(2059200);
    expect(view.summary.realizedGain).toBe(320100);
  });
});
