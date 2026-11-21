import Link from "next/link";
import { notFound } from "next/navigation";
import { MetalModelEditor } from "@/components/metal-model-editor";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { getCachedCommodityModel } from "@/lib/commodity-model-cache";
import { getLocale } from "@/lib/locale";
import { isMetalModelCommodity, validModelWeights, type SavedMetalModel } from "@/lib/metal-model";
import { metalModelCopy } from "@/lib/metal-model-copy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

type Props = { params: Promise<{ commodity: string }> };

export const metadata: Metadata = {
  title: "Metal model editor",
  robots: { index: false, follow: false },
};

export default async function MetalModelPage({ params }: Props) {
  const { commodity } = await params;
  const config = isMetalModelCommodity(commodity) ? getCommodityConfiguration(commodity) : undefined;
  if (!config || !isMetalModelCommodity(commodity)) notFound();
  const locale = await getLocale();
  const t = metalModelCopy[locale];
  const supabase = await createSupabaseServerClient();
  const auth = supabase ? await supabase.auth.getUser() : null;
  const user = auth?.data.user;

  let content = !supabase ? <p role="alert">{t.unavailableStorage}</p>
    : <p>{t.login} <Link href="/login">{t.signIn}</Link></p>;
  if (supabase && user && !auth.error) {
    const owner = { user_id: user.id, commodity };
    const models: SavedMetalModel[] = [];
    const defaultQuery = supabase.from("metal_model_defaults").select("model_id").match(owner).maybeSingle();
    const loadModels = async () => {
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from("metal_models").select("id, name, weights, definition_version, revision")
          .match(owner).order("id").range(offset, offset + 499).returns<SavedMetalModel[]>();
        if (result.error) return result.error.code;
        models.push(...result.data);
        if (result.data.length < 500) return null;
      }
    };
    const [errorCode, defaultResult] = await Promise.all([loadModels(), defaultQuery]);
    if (errorCode !== null || defaultResult.error ||
        models.some((model) => model.definition_version !== 1 || !validModelWeights(model.weights, config.indicators.map(({ id }) => id)))) {
      console.error("Could not load metal models", errorCode ?? defaultResult.error?.code ?? "unsupported definition");
      content = <p role="alert">{t.unavailableStorage}</p>;
    } else {
      const { cards } = await getCachedCommodityModel(commodity, locale);
      const factors = config.indicators.map(({ id, name }) => ({
        id, name: name[locale], score: cards.find((card) => card.id === id)?.factorScore ?? null,
      }));
      content = <MetalModelEditor commodity={commodity} locale={locale} baseWeights={config.weights}
        factors={factors} initialModels={models} initialDefault={defaultResult.data?.model_id ?? null} />;
    }
  }

  return <section className="metal-model-page content-width">
    <Link className="back-link" href={`/tag/${commodity}`}>{t.back}</Link>
    <h1>{config.name[locale]} · {t.title}</h1>
    <p>{t.intro}</p>
    {content}
  </section>;
}
