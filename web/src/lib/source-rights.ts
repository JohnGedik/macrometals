export type SourceRightsStatus = "permission-confirmed" | "review-required" | "public-domain-attribution" | "provenance-unverified";
export type SourceRightsDisclosure = { status: SourceRightsStatus; termsUrl?: string };
export type SourceProvider = "yahoo" | "fred" | "wgc" | "cftc" | "gpr" | "silver-institute" | "eia" | "public-domain";
export const unverifiedSampleRights: SourceRightsDisclosure = { status: "provenance-unverified" };

const yahooTermsUrl = "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html";
const fredTermsUrl = "https://fred.stlouisfed.org/legal/";
const wgcTermsUrl = "https://www.gold.org/terms-and-conditions";
const cftcTermsUrl = "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm";
const gprTermsUrl = "https://creativecommons.org/licenses/by/4.0/";
const eiaTermsUrl = "https://www.eia.gov/about/copyrights_reuse.php";
const wgcSeriesFlags: Record<string, string> = {
  "WGC-CENTRAL-BANK-REPORTED-CHANGES": "WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED",
  "WGC-GLOBAL-ETF-HOLDINGS": "WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED",
};
const cftcSeriesFlags: Record<string, string> = {
  "CFTC-72HH-3QPY-088691-MANAGED-MONEY-NET": "CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED",
  "CFTC-72HH-3QPY-084691-MANAGED-MONEY-NET": "CFTC_COT_SILVER_PUBLIC_USE_CONFIRMED",
  "CFTC-72HH-3QPY-067651-MANAGED-MONEY-NET": "CFTC_COT_WTI_PUBLIC_USE_CONFIRMED",
};
const gprSeriesFlags: Record<string, string> = {
  "CALDARA-IACOVIELLO-GPR-RECENT-MONTHLY": "GPR_CI_PUBLIC_USE_CONFIRMED",
};
const silverInstituteSeriesFlags: Record<string, string> = {
  "SILVER-INDUSTRIAL-DEMAND": "SILVER_INDUSTRIAL_DEMAND_PUBLIC_USE_CONFIRMED",
  "SILVER-SOLAR-DEMAND": "SILVER_SOLAR_DEMAND_PUBLIC_USE_CONFIRMED",
  "SILVER-MINE-SUPPLY": "SILVER_MINE_SUPPLY_PUBLIC_USE_CONFIRMED",
  "SILVER-GLOBAL-ETP-HOLDINGS": "SILVER_ETP_HOLDINGS_PUBLIC_USE_CONFIRMED",
};

export function getSourceRights(provider: SourceProvider, seriesId?: string) {
  if (provider === "public-domain") return { allowed: true, disclosure: { status: "public-domain-attribution", termsUrl: eiaTermsUrl } as const };
  if (provider === "eia") return { allowed: true, disclosure: { status: "public-domain-attribution", termsUrl: eiaTermsUrl } as const };
  const allowed = provider === "yahoo"
    ? process.env.YAHOO_FINANCE_AUTOMATED_ACCESS_CONFIRMED === "true"
      && process.env.MARKET_DATA_PUBLIC_DISTRIBUTION_CONFIRMED === "true"
    : provider === "wgc"
      ? !!seriesId && !!wgcSeriesFlags[seriesId] && process.env[wgcSeriesFlags[seriesId]] === "true"
      : provider === "cftc"
        ? !!seriesId && !!cftcSeriesFlags[seriesId] && process.env[cftcSeriesFlags[seriesId]] === "true"
        : provider === "gpr"
          ? !!seriesId && !!gprSeriesFlags[seriesId] && process.env[gprSeriesFlags[seriesId]] === "true"
          : provider === "silver-institute"
            ? !!seriesId && !!silverInstituteSeriesFlags[seriesId] && process.env[silverInstituteSeriesFlags[seriesId]] === "true"
            : !!seriesId && process.env[`FRED_${seriesId}_PUBLIC_USE_CONFIRMED`] === "true";
  return {
    allowed,
    disclosure: { status: allowed ? "permission-confirmed" as const : "review-required" as const,
      termsUrl: provider === "yahoo" ? yahooTermsUrl : provider === "wgc" ? wgcTermsUrl : provider === "cftc" ? cftcTermsUrl : provider === "gpr" ? gprTermsUrl
        : provider === "silver-institute" ? "https://silverinstitute.org/all-world-silver-surveys-2025/" : fredTermsUrl },
  };
}

export function fredArchivePermitted(seriesId: string) {
  return getSourceRights("fred", seriesId).allowed
    && (process.env.FRED_ARCHIVE_PERMITTED_SERIES ?? "").split(",").map((id) => id.trim()).includes(seriesId);
}