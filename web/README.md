See the repository [README](../README.md) for local setup, Supabase configuration, and migration instructions.

Community articles can include an optional Turkish version. Individual Turkish fields may be empty and will display empty; if all Turkish fields are empty, readers see the English version.
The Supabase database must have the [article translations migration](supabase/migrations/20261118220000_article_translations.sql) and the [optional translation fields migration](supabase/migrations/20261120210000_optional_translation_fields.sql) applied, in order, before deploying this editor.

The homepage market comparison defaults to five years with Gold and the S&P 500 selected. Readers can choose 10, 5, or 1 year, 6 months, or 1 month; each period is indexed to 100 at its first shared observation. Yahoo Finance access remains subject to the source-rights gate.

For monthly WGC workbook downloads and refresh steps, see [WGC Data Refresh](WGC_DATA_REFRESH.md).
