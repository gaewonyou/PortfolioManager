export type DisplayCurrency = "KRW" | "USD";

export type TradeSide = "BUY" | "SELL";

export type AssetType = "STOCK" | "ETF" | "CASH" | "OTHER";

export interface Position {
  id: string;
  ticker: string;
  name: string;
  market: string;
  assetType: AssetType;
  account: string;
  currency: DisplayCurrency;
  country: string;
  quantity: number;
  averageCost: number;
  price: number;
  previousClose?: number;
  manualPrice?: boolean;
}

export interface TradeRecord {
  id: string;
  date: string;
  ticker: string;
  name: string;
  market: string;
  assetType: AssetType;
  account: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fees: number;
  taxes: number;
  currency: DisplayCurrency;
}

export interface CashPosition {
  id: string;
  account: string;
  currency: DisplayCurrency;
  amount: number;
}

export interface FxRate {
  pair: string;
  base: DisplayCurrency;
  quote: DisplayCurrency;
  rate: number;
}

export interface PerformancePoint {
  date: string;
  portfolioValue: number;
  investedCapital: number;
}

export interface PortfolioMeta {
  title: string;
  generatedAt: string;
  lastSyncedAt: string;
  owner: string;
  repo: string;
  branch: string;
  workflowFile: string;
  adminModeAvailable: boolean;
}

export interface PortfolioData {
  meta: PortfolioMeta;
  positions: Position[];
  transactions: TradeRecord[];
  cashBalances: CashPosition[];
  fxRates: FxRate[];
  history?: PerformancePoint[];
}

export interface FilterState {
  market: string;
  assetType: string;
  account: string;
  holdingsOnly: boolean;
  search: string;
}

export interface EnrichedTradeRecord extends TradeRecord {
  realizedGain: number;
  netAmount: number;
  runningQuantity: number;
}

export interface PositionView extends Position {
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  returnRate: number;
  dailyChange: number;
}

export interface CashView extends CashPosition {
  convertedAmount: number;
}

export interface BreakdownItem {
  name: string;
  value: number;
}

export interface SummaryView {
  totalAssetValue: number;
  investedCapital: number;
  equityValue: number;
  cashValue: number;
  realizedGain: number;
  unrealizedGain: number;
  totalReturnRate: number;
  dailyChange: number;
  saleProceeds: number;
}

export interface PortfolioView {
  summary: SummaryView;
  positions: PositionView[];
  cashBalances: CashView[];
  transactions: EnrichedTradeRecord[];
  assetBreakdown: BreakdownItem[];
  marketBreakdown: BreakdownItem[];
  currencyBreakdown: BreakdownItem[];
  performanceSeries: PerformancePoint[];
  filterOptions: {
    markets: string[];
    assetTypes: string[];
    accounts: string[];
  };
}

export type RefreshPhase = "idle" | "running" | "success" | "error";

export interface RefreshStatus {
  phase: RefreshPhase;
  message: string;
  runUrl?: string;
}

export interface WorkflowRunSummary {
  id: number;
  htmlUrl: string;
  status: string | null;
  conclusion: string | null;
}
