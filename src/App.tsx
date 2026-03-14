import { startTransition, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { dispatchWorkflowRun, findLatestWorkflowRun, getWorkflowRun } from "./lib/github";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from "./lib/format";
import { buildPortfolioView } from "./lib/portfolio";
import type { DisplayCurrency, FilterState, PortfolioData, RefreshStatus } from "./types";

const TOKEN_STORAGE_KEY = "portfolio-dashboard-admin-token";

const defaultFilters: FilterState = {
  market: "ALL",
  assetType: "ALL",
  account: "ALL",
  holdingsOnly: true,
  search: ""
};

const chartColors = ["#005f73", "#0a9396", "#94d2bd", "#ee9b00", "#ca6702", "#bb3e03"];

function App() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("KRW");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({
    phase: "idle",
    message: "대기 중"
  });

  const deferredSearch = useDeferredValue(filters.search);
  const portfolioView = data
    ? buildPortfolioView(data, displayCurrency, {
        ...filters,
        search: deferredSearch
      })
    : null;

  async function loadPortfolio() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/portfolio.json?ts=${Date.now()}`
      );
      if (!response.ok) {
        throw new Error(`데이터를 불러오지 못했습니다 (${response.status})`);
      }
      const payload = (await response.json()) as PortfolioData;
      startTransition(() => {
        setData(payload);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortfolio();
  }, []);

  useEffect(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
  }, [adminToken]);

  async function handleRefresh() {
    if (!data) {
      return;
    }

    if (!adminToken.trim()) {
      setRefreshStatus({
        phase: "error",
        message: "개인 GitHub 토큰을 먼저 입력해 주세요."
      });
      setAdminOpen(true);
      return;
    }

    setRefreshStatus({
      phase: "running",
      message: "GitHub Actions에 갱신 요청을 보내는 중입니다."
    });

    try {
      await dispatchWorkflowRun({
        owner: data.meta.owner,
        repo: data.meta.repo,
        workflowFile: data.meta.workflowFile,
        branch: data.meta.branch,
        token: adminToken
      });

      let run = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(2500);
        run = await findLatestWorkflowRun({
          owner: data.meta.owner,
          repo: data.meta.repo,
          workflowFile: data.meta.workflowFile,
          branch: data.meta.branch,
          token: adminToken
        });

        if (run) {
          break;
        }
      }

      if (!run) {
        throw new Error("워크플로 실행 정보를 찾지 못했습니다.");
      }

      setRefreshStatus({
        phase: "running",
        message: "시세 동기화가 진행 중입니다.",
        runUrl: run.htmlUrl
      });

      while (true) {
        await wait(4000);
        const latest = await getWorkflowRun({
          owner: data.meta.owner,
          repo: data.meta.repo,
          runId: run.id,
          token: adminToken
        });

        if (latest.status === "completed") {
          if (latest.conclusion === "success") {
            await wait(2500);
            await loadPortfolio();
            setRefreshStatus({
              phase: "success",
              message: "최신 데이터로 갱신되었습니다.",
              runUrl: latest.htmlUrl
            });
          } else {
            setRefreshStatus({
              phase: "error",
              message: `갱신 실패: ${latest.conclusion ?? "unknown"}`,
              runUrl: latest.htmlUrl
            });
          }
          break;
        }

        setRefreshStatus({
          phase: "running",
          message: `동기화 진행 중 (${latest.status ?? "queued"})`,
          runUrl: latest.htmlUrl
        });
      }
    } catch (refreshError) {
      setRefreshStatus({
        phase: "error",
        message:
          refreshError instanceof Error
            ? refreshError.message
            : "즉시 갱신 중 오류가 발생했습니다."
      });
    }
  }

  return (
    <div className="app-shell">
      <div className="background-orb orb-a" />
      <div className="background-orb orb-b" />
      <header className="hero">
        <div>
          <p className="eyebrow">Portfolio Command Deck</p>
          <h1>{data?.meta.title ?? "자산 관리 대시보드"}</h1>
          <p className="hero-copy">
            한국과 미국 자산을 한 화면에서 보고, 보유 현황과 거래 흐름, 환율 전환, 즉시 갱신까지
            관리하는 개인 투자 대시보드입니다.
          </p>
        </div>

        <div className="hero-actions">
          <div className="currency-toggle" role="tablist" aria-label="통화 전환">
            {(["KRW", "USD"] as const).map((currency) => (
              <button
                key={currency}
                className={currency === displayCurrency ? "active" : ""}
                onClick={() => setDisplayCurrency(currency)}
                type="button"
              >
                {currency}
              </button>
            ))}
          </div>

          <div className={`refresh-card refresh-${refreshStatus.phase}`}>
            <div>
              <strong>갱신 상태</strong>
              <p>{refreshStatus.message}</p>
              {data && <span>마지막 동기화: {formatDateTime(data.meta.lastSyncedAt)}</span>}
            </div>

            <div className="refresh-buttons">
              {data?.meta.adminModeAvailable && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setAdminOpen((open) => !open)}
                >
                  {adminOpen ? "관리자 닫기" : "관리자 모드"}
                </button>
              )}
              {adminOpen && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshStatus.phase === "running"}
                >
                  {refreshStatus.phase === "running" ? "업데이트 중..." : "업데이트"}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {adminOpen && (
        <section className="admin-panel">
          <div>
            <h2>관리자 설정</h2>
            <p>
              최소 권한의 GitHub fine-grained token을 넣으면 `workflow_dispatch`로 시세 동기화를
              실행할 수 있습니다.
            </p>
          </div>
          <label>
            GitHub Token
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="github_pat_..."
            />
          </label>
          {refreshStatus.runUrl && (
            <a href={refreshStatus.runUrl} target="_blank" rel="noreferrer">
              최근 실행 로그 보기
            </a>
          )}
        </section>
      )}

      <section className="filter-bar">
        <label>
          시장
          <select
            value={filters.market}
            onChange={(event) => setFilters((current) => ({ ...current, market: event.target.value }))}
          >
            <option value="ALL">전체</option>
            {portfolioView?.filterOptions.markets.map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
        </label>
        <label>
          자산군
          <select
            value={filters.assetType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, assetType: event.target.value }))
            }
          >
            <option value="ALL">전체</option>
            {portfolioView?.filterOptions.assetTypes.map((assetType) => (
              <option key={assetType} value={assetType}>
                {assetType}
              </option>
            ))}
          </select>
        </label>
        <label>
          계좌
          <select
            value={filters.account}
            onChange={(event) => setFilters((current) => ({ ...current, account: event.target.value }))}
          >
            <option value="ALL">전체</option>
            {portfolioView?.filterOptions.accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </label>
        <label>
          검색
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="티커 또는 자산명"
          />
        </label>
        <label className="checkbox">
          <input
            checked={filters.holdingsOnly}
            onChange={(event) =>
              setFilters((current) => ({ ...current, holdingsOnly: event.target.checked }))
            }
            type="checkbox"
          />
          보유 중 자산만 보기
        </label>
      </section>

      {loading && <section className="state-card">데이터를 불러오는 중입니다.</section>}
      {error && <section className="state-card error">{error}</section>}

      {!loading && !error && portfolioView && (
        <>
          <section className="summary-grid">
            <StatCard
              label="총자산"
              value={formatMoney(portfolioView.summary.totalAssetValue, displayCurrency)}
              accent="teal"
            />
            <StatCard
              label="총투입금"
              value={formatMoney(portfolioView.summary.investedCapital, displayCurrency)}
            />
            <StatCard
              label="실현손익"
              value={formatMoney(portfolioView.summary.realizedGain, displayCurrency)}
              change={formatPercent(
                portfolioView.summary.investedCapital === 0
                  ? 0
                  : (portfolioView.summary.realizedGain / portfolioView.summary.investedCapital) * 100
              )}
            />
            <StatCard
              label="미실현손익"
              value={formatMoney(portfolioView.summary.unrealizedGain, displayCurrency)}
              change={formatPercent(
                portfolioView.summary.equityValue === 0
                  ? 0
                  : (portfolioView.summary.unrealizedGain /
                      (portfolioView.summary.equityValue - portfolioView.summary.unrealizedGain || 1)) *
                    100
              )}
            />
            <StatCard
              label="총수익률"
              value={formatPercent(portfolioView.summary.totalReturnRate)}
              change={formatMoney(portfolioView.summary.dailyChange, displayCurrency)}
            />
            <StatCard
              label="현금 비중"
              value={formatMoney(portfolioView.summary.cashValue, displayCurrency)}
              change={`${(
                portfolioView.summary.totalAssetValue === 0
                  ? 0
                  : (portfolioView.summary.cashValue / portfolioView.summary.totalAssetValue) * 100
              ).toFixed(1)}%`}
            />
          </section>

          <section className="panel-grid">
            <Panel title="기간별 성과">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={portfolioView.performanceSeries}>
                    <defs>
                      <linearGradient id="valueGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#0a9396" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="#0a9396" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={formatDate} />
                    <YAxis tickFormatter={(value) => formatCompact(value, displayCurrency)} />
                    <Tooltip
                      formatter={(value: number) => formatMoney(value, displayCurrency)}
                      labelFormatter={formatDate}
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolioValue"
                      stroke="#0a9396"
                      fill="url(#valueGradient)"
                      strokeWidth={3}
                    />
                    <Area
                      type="monotone"
                      dataKey="investedCapital"
                      stroke="#ee9b00"
                      fillOpacity={0}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="자산군 비중">
              <PieBreakdown data={portfolioView.assetBreakdown} currency={displayCurrency} />
            </Panel>

            <Panel title="국가 비중">
              <PieBreakdown data={portfolioView.marketBreakdown} currency={displayCurrency} />
            </Panel>

            <Panel title="통화 비중">
              <PieBreakdown data={portfolioView.currencyBreakdown} currency={displayCurrency} />
            </Panel>
          </section>

          <Panel title="보유 자산">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>자산</th>
                    <th>계좌</th>
                    <th>수량</th>
                    <th>평균단가</th>
                    <th>현재가</th>
                    <th>평가금액</th>
                    <th>손익</th>
                    <th>수익률</th>
                    <th>일간변동</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioView.positions.map((position) => (
                    <tr key={position.id}>
                      <td>
                        <strong>{position.name}</strong>
                        <div className="subtle">
                          {position.ticker} · {position.market} · {position.assetType}
                          {position.manualPrice ? " · 수동가격" : ""}
                        </div>
                      </td>
                      <td>{position.account}</td>
                      <td>{formatNumber(position.quantity)}</td>
                      <td>{formatMoney(position.averageCost, position.currency)}</td>
                      <td>{formatMoney(position.price, position.currency)}</td>
                      <td>{formatMoney(position.marketValue, displayCurrency)}</td>
                      <td className={position.unrealizedGain >= 0 ? "positive" : "negative"}>
                        {formatMoney(position.unrealizedGain, displayCurrency)}
                      </td>
                      <td className={position.returnRate >= 0 ? "positive" : "negative"}>
                        {formatPercent(position.returnRate)}
                      </td>
                      <td className={position.dailyChange >= 0 ? "positive" : "negative"}>
                        {formatMoney(position.dailyChange, displayCurrency)}
                      </td>
                    </tr>
                  ))}
                  {portfolioView.positions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty-cell">
                        조건에 맞는 보유 자산이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="현금 잔액">
            <div className="cash-grid">
              {portfolioView.cashBalances.map((cash) => (
                <article key={cash.id} className="cash-card">
                  <span>{cash.account}</span>
                  <strong>{formatMoney(cash.convertedAmount, displayCurrency)}</strong>
                  <small>
                    원통화 {formatMoney(cash.amount, cash.currency)} · {cash.currency}
                  </small>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="거래 내역">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>일자</th>
                    <th>자산</th>
                    <th>유형</th>
                    <th>수량</th>
                    <th>체결가</th>
                    <th>거래금액</th>
                    <th>실현손익</th>
                    <th>잔여수량</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioView.transactions.map((trade) => (
                    <tr key={trade.id}>
                      <td>{formatDate(trade.date)}</td>
                      <td>
                        <strong>{trade.name}</strong>
                        <div className="subtle">
                          {trade.ticker} · {trade.account}
                        </div>
                      </td>
                      <td>
                        <span className={trade.side === "BUY" ? "tag-buy" : "tag-sell"}>
                          {trade.side}
                        </span>
                      </td>
                      <td>{formatNumber(trade.quantity)}</td>
                      <td>{formatMoney(trade.price, trade.currency)}</td>
                      <td>{formatMoney(trade.netAmount, displayCurrency)}</td>
                      <td className={trade.realizedGain >= 0 ? "positive" : "negative"}>
                        {formatMoney(trade.realizedGain, displayCurrency)}
                      </td>
                      <td>{formatNumber(trade.runningQuantity)}</td>
                    </tr>
                  ))}
                  {portfolioView.transactions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty-cell">
                        조건에 맞는 거래 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function StatCard(props: { label: string; value: string; change?: string; accent?: string }) {
  return (
    <article className={`stat-card ${props.accent ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.change && <small>{props.change}</small>}
    </article>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function PieBreakdown(props: {
  data: Array<{ name: string; value: number }>;
  currency: DisplayCurrency;
}) {
  return (
    <div className="pie-layout">
      <div className="chart-wrap compact">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={props.data}
              dataKey="value"
              innerRadius={55}
              outerRadius={82}
              paddingAngle={3}
            >
              {props.data.map((item, index) => (
                <Cell key={item.name} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatMoney(value, props.currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="legend-list">
        {props.data.map((item, index) => (
          <div key={item.name} className="legend-row">
            <span>
              <i style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              {item.name}
            </span>
            <strong>{formatMoney(item.value, props.currency)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatCompact(value: number, currency: DisplayCurrency) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export default App;
