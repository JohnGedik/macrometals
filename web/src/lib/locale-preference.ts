import type { Locale } from "@/lib/i18n";

export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return "en";

  const preferences = header
    .split(",")
    .map((entry, index) => {
      const [range, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().toLowerCase().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;
      const normalizedRange = range.trim().toLowerCase();
      const locale: Locale | null = normalizedRange === "tr" || normalizedRange.startsWith("tr-")
        ? "tr"
        : normalizedRange === "en" || normalizedRange.startsWith("en-")
          ? "en"
          : null;

      return { locale, quality, index };
    })
    .filter(
      (preference): preference is { locale: Locale; quality: number; index: number } =>
        preference.locale !== null
        && Number.isFinite(preference.quality)
        && preference.quality > 0
        && preference.quality <= 1,
    )
    .sort((first, second) => second.quality - first.quality || first.index - second.index);

  return preferences[0]?.locale ?? "en";
}
