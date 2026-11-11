import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { getTagLabel, messages } from "@/lib/i18n";
import { getCommodityHeaderData, getMacroIndicators, type CommodityKey } from "@/lib/indicators";
import { MacroIndicators } from "@/components/macro-indicators";
import { CommodityHeader } from "@/components/commodity-header";

type RouteProps = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { tag } = await params;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  const locale = await getLocale();
  const label = getTagLabel(`${title[0]?.toUpperCase()}${title.slice(1)}`, locale);
  return { title: `${label} ${locale === "tr" ? "analizleri" : "analysis"}` };
}

export default async function TagPage({ params }: RouteProps) {
  const { tag } = await params;
  const locale = await getLocale();
  const t = messages[locale].topic;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  const articles = (await getArticles(locale)).filter((article) => article.tags.some((item) => item.toLowerCase() === title.toLowerCase()));
  const commodity: CommodityKey | null = title.toLowerCase() === "gold" || title.toLowerCase() === "silver" || title.toLowerCase() === "copper" || title.toLowerCase() === "oil" ? title.toLowerCase() as CommodityKey : null;
  if (!articles.length && !commodity) notFound();
  const label = getTagLabel(`${title[0].toUpperCase()}${title.slice(1)}`, locale);
  const [indicators, commodityData] = commodity
    ? await Promise.all([getMacroIndicators(commodity, locale), getCommodityHeaderData(commodity)])
    : [null, null];

  return (
    <section className="listing-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.file}</span><span className="kicker-line" /></div>
      {commodity && commodityData
        ? <CommodityHeader name={label} description={t.description.replace("{topic}", label.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US"))} data={commodityData} labels={messages[locale].commodityHeader} locale={locale} />
        : <><h1>{label}</h1><p className="listing-intro">{t.description.replace("{topic}", label.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US"))}</p></>}
      {indicators && commodity && <MacroIndicators cards={indicators.cards} source={indicators.source} metal={commodity} locale={locale} />}
      {articles.length > 0 && <div className="article-grid">{articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div>}
    </section>
  );
}