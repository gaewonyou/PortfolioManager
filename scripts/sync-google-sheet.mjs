import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const rootDir = process.cwd();
const outputPath = path.join(rootDir, "public", "data", "portfolio.json");

function parseRows(rows = []) {
  if (!rows.length) {
    return [];
  }

  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(header.map((key, index) => [String(key).trim(), row[index] ?? ""]))
    );
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePosition(row) {
  return {
    id: row.id || `pos-${row.ticker}`,
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    assetType: row.assetType,
    account: row.account,
    currency: row.currency,
    country: row.country || (row.currency === "KRW" ? "대한민국" : "미국"),
    quantity: parseNumber(row.quantity),
    averageCost: parseNumber(row.averageCost),
    price: parseNumber(row.price),
    previousClose: parseNumber(row.previousClose || row.price),
    manualPrice: String(row.manualPrice).toLowerCase() === "true"
  };
}

function normalizeTransaction(row) {
  return {
    id: row.id || `tx-${row.date}-${row.ticker}-${row.side}`,
    date: row.date,
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    assetType: row.assetType,
    account: row.account,
    side: row.side,
    quantity: parseNumber(row.quantity),
    price: parseNumber(row.price),
    fees: parseNumber(row.fees),
    taxes: parseNumber(row.taxes),
    currency: row.currency
  };
}

function normalizeCash(row) {
  return {
    id: row.id || `cash-${row.account}-${row.currency}`,
    account: row.account,
    currency: row.currency,
    amount: parseNumber(row.amount)
  };
}

function normalizeFx(row) {
  return {
    pair: row.pair || `${row.base}${row.quote}`,
    base: row.base,
    quote: row.quote,
    rate: parseNumber(row.rate)
  };
}

function normalizeHistory(row) {
  return {
    date: row.date,
    portfolioValue: parseNumber(row.portfolioValue),
    investedCapital: parseNumber(row.investedCapital)
  };
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error(
      "GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY 환경 변수가 필요합니다."
    );
  }

  const sheetNames = {
    transactions: process.env.SHEET_TRANSACTIONS_RANGE || "transactions!A:Z",
    holdings: process.env.SHEET_HOLDINGS_RANGE || "holdings_snapshot!A:Z",
    cash: process.env.SHEET_CASH_RANGE || "cash_balances!A:Z",
    fx: process.env.SHEET_FX_RANGE || "fx_rates!A:Z",
    history: process.env.SHEET_HISTORY_RANGE || ""
  };

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({
    version: "v4",
    auth
  });

  const requests = [
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetNames.transactions
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetNames.holdings
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetNames.cash
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetNames.fx
    })
  ];

  if (sheetNames.history) {
    requests.push(
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetNames.history
      })
    );
  }

  const [transactionsRes, holdingsRes, cashRes, fxRes, historyRes] = await Promise.all(requests);

  const payload = {
    meta: {
      title: process.env.PORTFOLIO_TITLE || "개인 자산 관리 대시보드",
      generatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      owner: process.env.GITHUB_REPOSITORY_OWNER || "YOUR_GITHUB_USERNAME",
      repo: process.env.GITHUB_REPOSITORY_NAME || "YOUR_REPOSITORY_NAME",
      branch: process.env.PORTFOLIO_BRANCH || "main",
      workflowFile: process.env.PORTFOLIO_WORKFLOW_FILE || "sync-portfolio.yml",
      adminModeAvailable: true
    },
    positions: parseRows(holdingsRes.data.values).map(normalizePosition),
    transactions: parseRows(transactionsRes.data.values).map(normalizeTransaction),
    cashBalances: parseRows(cashRes.data.values).map(normalizeCash),
    fxRates: parseRows(fxRes.data.values).map(normalizeFx),
    history: historyRes?.data.values ? parseRows(historyRes.data.values).map(normalizeHistory) : []
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Synced portfolio data to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
