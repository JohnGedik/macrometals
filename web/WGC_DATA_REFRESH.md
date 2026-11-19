# WGC Gold Data Refresh

This project bundles two World Gold Council (WGC) workbooks as derived monthly observations. The files must be refreshed manually because the WGC downloads require an authenticated Goldhub session.

## Files to download

Download both original `.xlsx` workbooks; do not rename or modify their contents.

### 1. Central-bank reserve changes

1. Sign in at the [World Gold Council Gold Reserves by Country page](https://www.gold.org/goldhub/data/gold-reserves-by-country).
2. In **Downloads**, select **Changes in World Official Gold Reserves**.
3. The file is usually named like:

   ```text
   Changes_latest_as_of_Nov2026_IFS.xlsx
   ```

This workbook supplies the global aggregate and the monthly country-level changes used by the **Reported Monthly Central Bank Gold Reserve Changes** card. It is normally updated within the first 10 days of each month and contains data roughly two months in arrears.

Do not use **Latest World Official Gold Reserves** for this import. That file contains holdings, not the detailed monthly change history expected by the parser.

### 2. Gold ETF flows and holdings

1. Sign in at the [World Gold Council Gold ETFs, holdings and flows page](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows).
2. In **Downloads**, select the latest **Gold ETF Flows** workbook.
3. The file is usually named like:

   ```text
   ETF_Flows_2026-11-03.xlsx
   ```

This workbook supplies the monthly global ETF holdings factor. Download the monthly Excel workbook, not the methodology PDF.

## Refresh the bundled snapshot

Save both files in the Downloads folder or another local location. From the repository root:

```powershell
cd web
npm run import:wgc -- "C:\Users\johng\Downloads\Changes_latest_as_of_Nov2026_IFS.xlsx" "C:\Users\johng\Downloads\ETF_Flows_2026-11-03.xlsx"
```

Replace the filenames with the files downloaded for the new month.

A successful import prints:

- Number of global central-bank observations
- Number of ETF observations
- Number of countries preserved
- Latest central-bank period
- Latest ETF holdings period

The importer validates workbook layouts and values, then writes:

```text
web/src/lib/wgc-gold-observations.json
```

Do not commit the downloaded `.xlsx` workbooks.

## Validate the result

From `web`:

```powershell
node --experimental-strip-types --test src/lib/wgc-gold-parser.test.mjs
npx tsc --noEmit --pretty false
```

Then review the generated JSON:

- The latest periods should match the downloaded workbooks.
- `centralBankNetChanges` contains the global monthly aggregate.
- `centralBankCountryChanges` contains country-level monthly history.
- `etfHoldingsTonnes` contains global month-end ETF holdings.

## Enable public display

The aggregate feeds are controlled by:

```text
WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED=true
WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED=true
```

Country-level public display is controlled separately:

```text
WGC_CENTRAL_BANK_GOLD_COUNTRY_DISPLAY_CONFIRMED=true
```

Keep a flag disabled unless the deployment is covered by the applicable rights-register record. Update `.env.local` for local development and the hosting provider's server environment for production, then restart or redeploy.

## Commit and deploy

Commit the generated JSON and any importer/UI changes, then deploy the application:

```powershell
git add web/src/lib/wgc-gold-observations.json
git commit -m "Refresh WGC gold observations"
git push origin main
```

The deployed application reads the bundled snapshot; refreshing the JSON without deploying does not update production.

## Troubleshooting

- **Download requires sign-in:** sign in to a WGC Goldhub account and retry.
- **Downloaded file is not XLSX:** repeat the download in a normal browser; Cloudflare or an HTML sign-in page may have replaced the file.
- **Missing `Monthly` sheet:** verify the first file is `Changes in World Official Gold Reserves`, not `Latest World Official Gold Reserves`.
- **Missing `Holdings by month` layout:** verify the second file is the latest `Gold ETF Flows` Excel workbook.
- **Country selector missing:** confirm the JSON contains `centralBankCountryChanges` and the country-display environment flag is `true`.
- **Production remains outdated:** confirm the generated JSON was committed, pushed, and redeployed.

The current automatic WGC cron downloader cannot replace this authenticated manual import.
