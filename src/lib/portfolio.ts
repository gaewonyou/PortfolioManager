import type {
  CashPosition,
  CashView,
  DisplayCurrency,
  EnrichedTradeRecord,
  FilterState,
  FxRate,
  PerformancePoint,
  PortfolioData,
  PortfolioView,
  Position,
  PositionView,
  TradeRecord
} from "../types";

function buildFxTable(rates: FxRate[]) {
  const table = new Map<string, number>();
  for (const rate of rates) {
    table.set(`${rate.base}_${rate.quote}`, rate.rate);
    table.set(`${rate.quote}_${rate.base}`, 1 / rate.rate);
  }
  table.set("KRW_KRW", 1);
  table.set("USD_USD", 1);
  return table;
}

export function convertAmount(
  amount: number,
  from: DisplayCurrency,
  to: DisplayCurrency,
  rates: FxRate[]
) {
  if (from === to) {
    return amount;
  }

  const table = buildFxTable(rates);
  const rate = table.get(`${from}_${to}`);
  if (!rate) {
    throw new Error(`환율 정보가 없습니다: ${from} -> ${to}`);
  }
  return amount * rate;
}

function sortTrades(records: TradeRecord[]) {
  return [...records].sort((a, b) => {
    if (a.date === b.date) {
      return a.id.localeCompare(b.id);
    }
    return a.date.localeCompare(b.date);
  });
}

export function enrichTrades(
  records: TradeRecord[],
  displayCurrency: DisplayCurrency,
  rates: FxRate[]
) {
  const positions = new Map<string, { quantity: number; totalCost: number }>();
  const enriched: EnrichedTradeRecord[] = [];

  for (const record of sortTrades(records)) {
    const key = `${record.account}::${record.ticker}`;
    const state = positions.get(key) ?? { quantity: 0, totalCost: 0 };
    const gross = record.quantity * record.price;
    const tradingCost = record.fees + record.taxes;
    let realizedGain = 0;

    if (record.side === "BUY") {
      state.quantity += record.quantity;
      state.totalCost += gross + tradingCost;
    } else {
      const averageCost = state.quantity > 0 ? state.totalCost / state.quantity : 0;
      const costBasis = averageCost * record.quantity;
      const proceeds = gross - tradingCost;
      realizedGain = proceeds - costBasis;
      state.quantity -= record.quantity;
      state.totalCost -= costBasis;
      if (state.quantity < 1e-9) {
        state.quantity = 0;
        state.totalCost = 0;
      }
    }

    positions.set(key, state);

    enriched.push({
      ...record,
      realizedGain: convertAmount(realizedGain, record.currency, displayCurrency, rates),
      netAmount: convertAmount(
        record.side === "BUY" ? gross + tradingCost : gross - tradingCost,
        record.currency,
        displayCurrency,
        rates
      ),
      runningQuantity: state.quantity
    });
  }

  return enriched;
}

function buildPositionViews(
  positions: Position[],
  displayCurrency: DisplayCurrency,
  rates: FxRate[]
) {
  return positions.map<PositionView>((position) => {
    const marketValue = convertAmount(
      position.quantity * position.price,
      position.currency,
      displayCurrency,
      rates
    );
    const costBasis = convertAmount(
      position.quantity * position.averageCost,
      position.currency,
      displayCurrency,
      rates
    );
    const previousClose = position.previousClose ?? position.price;
    const dailyChange = convertAmount(
      (position.price - previousClose) * position.quantity,
      position.currency,
      displayCurrency,
      rates
    );
    const unrealizedGain = marketValue - costBasis;
    const returnRate = costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100;

    return {
      ...position,
      marketValue,
      costBasis,
      unrealizedGain,
      returnRate,
      dailyChange
    };
  });
}

function buildCashViews(
  cashBalances: CashPosition[],
  displayCurrency: DisplayCurrency,
  rates: FxRate[]
) {
  return cashBalances.map<CashView>((cash) => ({
    ...cash,
    convertedAmount: convertAmount(cash.amount, cash.currency, displayCurrency, rates)
  }));
}

function aggregateBreakdown(items: Array<{ name: string; value: number }>) {
  return [...items.reduce<Map<string, number>>((acc, item) => {
    acc.set(item.name, (acc.get(item.name) ?? 0) + item.value);
    return acc;
  }, new Map<string, number>()).entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildFallbackPerformanceSeries(
  trades: EnrichedTradeRecord[],
  totalAssetValue: number
): PerformancePoint[] {
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let investedCapital = 0;
  let realizedGain = 0;
  const points: PerformancePoint[] = [];

  for (const trade of ordered) {
    if (trade.side === "BUY") {
      investedCapital += trade.netAmount;
    } else {
      realizedGain += trade.realizedGain;
    }

    points.push({
      date: trade.date,
      investedCapital,
      portfolioValue: investedCapital + realizedGain
    });
  }

  if (points.length > 0) {
    points[points.length - 1] = {
      ...points[points.length - 1],
      portfolioValue: totalAssetValue
    };
  }

  return points;
}

export function buildPortfolioView(
  data: PortfolioData,
  displayCurrency: DisplayCurrency,
  filters: FilterState
): PortfolioView {
  const allPositionViews = buildPositionViews(data.positions, displayCurrency, data.fxRates);
  const allCashViews = buildCashViews(data.cashBalances, displayCurrency, data.fxRates);
  const allEnrichedTrades = enrichTrades(data.transactions, displayCurrency, data.fxRates);

  const lowerSearch = filters.search.trim().toLowerCase();

  const positions = allPositionViews.filter((position) => {
    if (filters.market !== "ALL" && position.market !== filters.market) {
      return false;
    }
    if (filters.assetType !== "ALL" && position.assetType !== filters.assetType) {
      return false;
    }
    if (filters.account !== "ALL" && position.account !== filters.account) {
      return false;
    }
    if (filters.holdingsOnly && position.quantity <= 0) {
      return false;
    }
    if (lowerSearch && !`${position.ticker} ${position.name}`.toLowerCase().includes(lowerSearch)) {
      return false;
    }
    return true;
  });

  const transactions = allEnrichedTrades
    .filter((trade) => {
      if (filters.market !== "ALL" && trade.market !== filters.market) {
        return false;
      }
      if (filters.assetType !== "ALL" && trade.assetType !== filters.assetType) {
        return false;
      }
      if (filters.account !== "ALL" && trade.account !== filters.account) {
        return false;
      }
      if (lowerSearch && !`${trade.ticker} ${trade.name}`.toLowerCase().includes(lowerSearch)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const cashBalances = allCashViews.filter((cash) => {
    if (filters.account !== "ALL" && cash.account !== filters.account) {
      return false;
    }
    if (filters.assetType !== "ALL" && filters.assetType !== "CASH") {
      return false;
    }
    return true;
  });

  const equityValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const cashValue = cashBalances.reduce((sum, cash) => sum + cash.convertedAmount, 0);
  const investedCapital = transactions
    .filter((trade) => trade.side === "BUY")
    .reduce((sum, trade) => sum + trade.netAmount, 0);
  const saleProceeds = transactions
    .filter((trade) => trade.side === "SELL")
    .reduce((sum, trade) => sum + trade.netAmount, 0);
  const realizedGain = transactions.reduce((sum, trade) => sum + trade.realizedGain, 0);
  const unrealizedGain = positions.reduce((sum, position) => sum + position.unrealizedGain, 0);
  const totalAssetValue = equityValue + cashValue;
  const dailyChange = positions.reduce((sum, position) => sum + position.dailyChange, 0);
  const totalReturnRate =
    investedCapital === 0 ? 0 : ((realizedGain + unrealizedGain) / investedCapital) * 100;

  const assetBreakdown = aggregateBreakdown([
    ...positions.map((position) => ({
      name:
        position.assetType === "STOCK"
          ? "주식"
          : position.assetType === "ETF"
            ? "ETF"
            : position.assetType === "OTHER"
              ? "기타"
              : "현금",
      value: position.marketValue
    })),
    ...cashBalances.map((cash) => ({
      name: "현금",
      value: cash.convertedAmount
    }))
  ]);

  const marketBreakdown = aggregateBreakdown([
    ...positions.map((position) => ({
      name: position.country,
      value: position.marketValue
    })),
    ...cashBalances.map((cash) => ({
      name: cash.currency === "KRW" ? "대한민국" : "미국",
      value: cash.convertedAmount
    }))
  ]);

  const currencyBreakdown = aggregateBreakdown([
    ...positions.map((position) => ({
      name: position.currency,
      value: convertAmount(
        position.quantity * position.price,
        position.currency,
        displayCurrency,
        data.fxRates
      )
    })),
    ...cashBalances.map((cash) => ({
      name: cash.currency,
      value: cash.convertedAmount
    }))
  ]);

  const performanceSeries = data.history && data.history.length > 0
    ? data.history.map((point) => ({
        date: point.date,
        investedCapital: convertAmount(point.investedCapital, "KRW", displayCurrency, data.fxRates),
        portfolioValue: convertAmount(point.portfolioValue, "KRW", displayCurrency, data.fxRates)
      }))
    : buildFallbackPerformanceSeries(transactions, totalAssetValue);

  return {
    summary: {
      totalAssetValue,
      investedCapital,
      equityValue,
      cashValue,
      realizedGain,
      unrealizedGain,
      totalReturnRate,
      dailyChange,
      saleProceeds
    },
    positions,
    cashBalances,
    transactions,
    assetBreakdown,
    marketBreakdown,
    currencyBreakdown,
    performanceSeries,
    filterOptions: {
      markets: [...new Set(data.positions.map((position) => position.market))].sort(),
      assetTypes: [...new Set([...data.positions.map((position) => position.assetType), "CASH"])].sort(),
      accounts: [
        ...new Set([
          ...data.positions.map((position) => position.account),
          ...data.cashBalances.map((cash) => cash.account),
          ...data.transactions.map((trade) => trade.account)
        ])
      ].sort()
    }
  };
}
