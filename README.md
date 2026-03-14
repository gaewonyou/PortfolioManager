# 자산 관리 GitHub Pages 대시보드

GitHub Pages에서 운영하는 정적 자산 관리 웹앱입니다. `Google Sheets + GOOGLEFINANCE`를 시세 원천으로 사용하고, `GitHub Actions`가 비공개 시트의 데이터를 정적 `JSON`으로 동기화합니다. 공개 페이지는 읽기 전용이고, 관리자 모드에서는 개인 GitHub 토큰으로 즉시 갱신 워크플로를 실행할 수 있습니다.

## 포함된 기능

- 총자산, 총투입금, 실현손익, 미실현손익, 총수익률, 일간 변동 요약
- 종목/ETF/기타 자산 보유 현황 표
- 거래 내역과 평균단가 기준 실현손익 계산
- 자산군, 국가, 통화 비중 차트
- `KRW/USD` 전환
- GitHub Actions 기반 즉시 갱신 버튼

## 프로젝트 구조

- `src/`: React + TypeScript 프론트엔드
- `public/data/portfolio.json`: 배포되는 정적 데이터
- `scripts/sync-google-sheet.mjs`: 비공개 Google Sheets를 읽어 JSON 생성
- `.github/workflows/sync-portfolio.yml`: 시트 동기화
- `.github/workflows/deploy.yml`: GitHub Pages 배포

## 로컬 개발

이 프로젝트는 `Node.js 20+` 기준입니다.

```bash
npm install
npm run dev
```

테스트:

```bash
npm run test
```

배포용 빌드:

```bash
npm run build
```

## Google Sheets 준비

최소 시트 4개를 준비합니다.

### `transactions`

필수 컬럼:

`id`, `date`, `ticker`, `name`, `market`, `assetType`, `account`, `side`, `quantity`, `price`, `fees`, `taxes`, `currency`

### `holdings_snapshot`

필수 컬럼:

`id`, `ticker`, `name`, `market`, `assetType`, `account`, `currency`, `country`, `quantity`, `averageCost`, `price`, `previousClose`, `manualPrice`

### `cash_balances`

필수 컬럼:

`id`, `account`, `currency`, `amount`

### `fx_rates`

필수 컬럼:

`pair`, `base`, `quote`, `rate`

### 선택: `history`

기간별 성과 차트를 더 정확하게 보여주려면 아래 컬럼을 추가합니다.

`date`, `portfolioValue`, `investedCapital`

## GitHub Secrets / Variables

### Secrets

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

### Variables

- `PORTFOLIO_TITLE`
- `PORTFOLIO_BRANCH`
- `SHEET_TRANSACTIONS_RANGE`
- `SHEET_HOLDINGS_RANGE`
- `SHEET_CASH_RANGE`
- `SHEET_FX_RANGE`
- `SHEET_HISTORY_RANGE`

## GitHub Pages 설정

1. 저장소에 이 프로젝트를 push 합니다.
2. `Actions` 탭에서 `Deploy GitHub Pages`와 `Sync Portfolio Data` 워크플로가 활성화되어 있는지 확인합니다.
3. 저장소 `Settings > Pages`에서 `GitHub Actions` 배포 방식을 사용합니다.
4. `public/data/portfolio.json` 안의 `meta.owner`, `meta.repo` 기본값을 실제 저장소명으로 바꾸거나, 첫 동기화 워크플로가 덮어쓰게 둡니다.

## 즉시 갱신 버튼 설정

대시보드의 관리자 모드에서 입력하는 토큰은 `fine-grained personal access token`을 권장합니다.

필요 권한:

- `Actions: Read and write`
- `Contents: Read`

이 토큰은 브라우저의 `localStorage`에만 저장되며, 프론트엔드 코드에 하드코딩되지 않습니다.

## 참고 사항

- `GOOGLEFINANCE`는 일반 웹 브라우저에서 직접 호출하는 공개 API가 아니므로, 이 프로젝트는 `Google Sheets`를 데이터 브리지로 사용합니다.
- `기타` 자산은 수동 가격 입력을 허용합니다.
- 실시간 초단위 시세가 아니라 `정적 페이지 + 주기 동기화 + 수동 즉시 갱신` 모델입니다.
