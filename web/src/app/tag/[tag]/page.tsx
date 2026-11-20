import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { getTagLabel, messages, type Locale } from "@/lib/i18n";
import { getCommodityHeaderData, loadCommodityIndicators } from "@/lib/indicators";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { IndicatorGroup, MacroIndicators, MacroScorePanel } from "@/components/macro-indicators";
import { CommodityHeader } from "@/components/commodity-header";
import { MacroDataLoading } from "@/components/macro-data-loading";
import { isMetalModelCommodity } from "@/lib/metal-model";
import { getDashboardModel, type DashboardModel } from "@/lib/metal-model-default";
import { getDashboardModelPerformance } from "@/lib/model-performance-dashboard";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/seo";

type RouteProps = { params: Promise<{ tag: string }> };
type IndicatorLoad = ReturnType<typeof loadCommodityIndicators>;
type Articles = Awaited<ReturnType<typeof getArticles>>;

async function CommodityMarketHeader({ data, name, title, locale }: {
  data: ReturnType<typeof getCommodityHeaderData>; name: string; title: string; locale: Locale;
}) {
  return <CommodityHeader name={name} title={title} data={await data} labels={messages[locale].commodityHeader} locale={locale} />;
}

async function CommodityScore({ model, defaultModel, locale, performance }: {
  model: IndicatorLoad["model"]; defaultModel: Promise<DashboardModel> | null; locale: Locale;
  performance: ReturnType<typeof getDashboardModelPerformance>;
}) {
  const [result, performanceData] = await Promise.all([model, performance]);
  return <MacroScorePanel config={result.config} cards={result.cards} locale={locale} macroScore={result.summary}
    dashboardModel={defaultModel} performance={performanceData} />;
}

async function CommodityContext({ context, locale }: { context: IndicatorLoad["context"]; locale: Locale }) {
  const { cards, source } = await context;
  return <><IndicatorGroup title={messages[locale].macro.goldCrossMarketContext} cards={cards} locale={locale} />
    <p className="indicator-source">{source}</p></>;
}

async function CommodityIndicators({ model, context, locale }: IndicatorLoad & { locale: Locale }) {
  const result = await model;
  return <MacroIndicators config={result.config} cards={result.cards} locale={locale} macroScore={result.summary}
    context={<Suspense fallback={<p role="status">{messages[locale].macro.loadingContext}</p>}>
      <CommodityContext context={context} locale={locale} />
    </Suspense>} />;
}

async function TopicArticles({ data, locale }: { data: Articles | Promise<Articles>; locale: Locale }) {
  const articles = await data;
  return articles.length > 0 && <div className="article-grid">{articles.map((article, index) =>
    <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div>;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { tag } = await params;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  const locale = await getLocale();
  const config = getCommodityConfiguration(decodeURIComponent(tag).toLowerCase());
  const label = config?.name[locale] ?? getTagLabel(`${title[0]?.toUpperCase()}${title.slice(1)}`, locale);
  const description = locale === "tr"
    ? `${label} fiyat hareketleri, makroekonomik göstergeler, kaynak verileri ve ilgili analizleri.`
    : `${label} prices, macro indicators, source data, and related market analysis.`;
  return {
    title: `${label} ${locale === "tr" ? "analizleri" : "analysis"}`,
    description,
    alternates: { canonical: `/tag/${encodeURIComponent(decodeURIComponent(tag).toLowerCase())}` },
  };
}

export default async function TagPage({ params }: RouteProps) {
  const { tag } = await params;
  const locale = await getLocale();
  const t = messages[locale].topic;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  const articles = getArticles(locale).then((items) =>
    items.filter((article) => article.tags.some((item) => item.toLowerCase() === title.toLowerCase())));
  const config = getCommodityConfiguration(decodeURIComponent(tag).toLowerCase());
  if (!config) {
    const items = await articles;
    if (!items.length) notFound();
    const label = getTagLabel(`${title[0].toUpperCase()}${title.slice(1)}`, locale);
    return <section className="listing-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.file}</span><span className="kicker-line" /></div>
      <h1>{label}</h1><p className="listing-intro">{t.description.replace("{topic}", label.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US"))}</p>
      <TopicArticles data={items} locale={locale} />
    </section>;
  }

  const { model, context } = loadCommodityIndicators(config, locale);
  const header = getCommodityHeaderData(config);
  const defaultModel = isMetalModelCommodity(config.commodity)
    ? getDashboardModel(config.commodity, config.indicators.map(({ id }) => id))
    : null;
  const performance = defaultModel
    ? getDashboardModelPerformance(config.commodity as "gold" | "silver" | "copper" | "oil", defaultModel)
    : Promise.resolve({ system: [], personal: {} });
  const macro = messages[locale].macro;
  const pageUrl = absoluteUrl(`/tag/${config.commodity}`);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: messages[locale].header.latest, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: config.name[locale], item: pageUrl },
    ],
  };

  return (
    <section className="listing-page content-width commodity-page">
      <JsonLd value={breadcrumbJsonLd} />
      <Suspense fallback={<><h1 id="macro-indicators-title">{config.dashboardTitle[locale]}</h1><p role="status">{macro.loadingMarket}</p></>}>
        <CommodityMarketHeader data={header} name={config.name[locale]} title={config.dashboardTitle[locale]} locale={locale} />
      </Suspense>
      <section className="macro-indicators macro-gold" aria-labelledby="macro-indicators-title">
        <Suspense fallback={<p role="status">{macro.loadingScore}</p>}>
          <CommodityScore model={model} defaultModel={defaultModel} locale={locale} performance={performance} />
        </Suspense>
        <Suspense fallback={<MacroDataLoading className="macro-drivers-loading" message={macro.loadingMarket} />}>
          <CommodityIndicators model={model} context={context} locale={locale} />
        </Suspense>
      </section>
      <Suspense fallback={null}><TopicArticles data={articles} locale={locale} /></Suspense>
      <footer className="commodity-page-footer">
        <p className="commodity-legal-disclaimer">{macro.disclaimer}</p>
        <p className="dashboard-version">{macro.dashboardVersion}</p>
      </footer>
    </section>
  );
}