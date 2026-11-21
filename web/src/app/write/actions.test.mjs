import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock, test } from "node:test";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolve(src, `${specifier.slice(2)}.ts`)).href, context);
    }
    if (specifier === "next/cache" || specifier === "next/navigation") {
      return nextResolve(`${specifier}.js`, context);
    }
    return nextResolve(specifier, context);
  },
});

let client;
mock.module("@/lib/supabase/server", {
  namedExports: { createSupabaseServerClient: async () => client },
});
mock.module("@/lib/ensure-profile", {
  namedExports: { ensureProfile: async () => true },
});
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("next/navigation", { namedExports: { redirect() {} } });

const { saveArticleAction } = await import("./actions.ts");

test("publishing saves Turkish title and content with an empty summary", async () => {
  const saved = {};
  client = {
    auth: { getUser: async () => ({ data: { user: { id: "author-id" } } }) },
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        update(values) { saved.article = values; return this; },
        delete() { return this; },
        async maybeSingle() {
          return { data: { id: table === "categories" ? "category-id" : "article-id", published_at: "2026-01-01T00:00:00Z" }, error: null };
        },
        async upsert(rows) { saved.translations = rows; return { error: null }; },
      };
      return query;
    },
  };
  const form = new FormData();
  for (const [key, value] of Object.entries({
    article_id: "article-id",
    intent: "publish",
    category: "macro",
    title_en: "English title",
    summary_en: "English summary",
    content_markdown_en: "English content",
    title_tr: "Turkish title",
    content_markdown_tr: "Turkish content",
  })) form.set(key, value);

  assert.deepEqual(await saveArticleAction(form), { redirectTo: "/articles/english-title" });
  assert.equal(saved.article.published, true);
  assert.equal(saved.article.published_at, "2026-01-01T00:00:00Z");
  assert.deepEqual(saved.translations.find((row) => row.language === "tr"), {
    article_id: "article-id",
    language: "tr",
    title: "Turkish title",
    summary: "",
    body: "Turkish content",
    content_markdown: "Turkish content",
  });
});

test("publishing retains a Turkish version with only a summary", async () => {
  let savedTranslations;
  let deletedTranslation = false;
  client = {
    auth: { getUser: async () => ({ data: { user: { id: "author-id" } } }) },
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        update() { return this; },
        delete() { if (table === "article_translations") deletedTranslation = true; return this; },
        async maybeSingle() {
          return { data: { id: table === "categories" ? "category-id" : "article-id" }, error: null };
        },
        async upsert(rows) { savedTranslations = rows; return { error: null }; },
      };
    },
  };
  const form = new FormData();
  for (const [key, value] of Object.entries({
    article_id: "article-id",
    intent: "publish",
    category: "macro",
    title_en: "English title",
    summary_en: "English summary",
    content_markdown_en: "English content",
    summary_tr: "Turkish summary",
  })) form.set(key, value);

  assert.deepEqual(await saveArticleAction(form), { redirectTo: "/articles/english-title" });
  assert.equal(deletedTranslation, false);
  assert.deepEqual(savedTranslations.find((row) => row.language === "tr"), {
    article_id: "article-id",
    language: "tr",
    title: "",
    summary: "Turkish summary",
    body: "",
    content_markdown: "",
  });
});
