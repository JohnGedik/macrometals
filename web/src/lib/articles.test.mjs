import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock, test } from "node:test";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolve(src, `${specifier.slice(2)}.ts`)).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const article = {
  id: "article-id", author_id: "author-id", slug: "example",
  title: "English title", summary: "English summary", body: "English body",
  cover_image: null, featured_image: null, published_at: "2026-01-01",
  created_at: "2026-01-01", language: "en", category_id: null, view_count: 0,
};
let translationRows = [];
const client = {
  from(table) {
    const data = {
      articles: [article],
      profiles: [{ id: "author-id", slug: "author", display_name: "Author" }],
      article_tags: [],
      article_translations: translationRows,
    }[table];
    return {
      select() { return this; },
      eq() { return this; },
      not() { return this; },
      order() { return this; },
      limit() { return this; },
      in() { return this; },
      then(resolveResult) { return Promise.resolve({ data, error: null }).then(resolveResult); },
    };
  },
  async rpc() { return { data: [], error: null }; },
};

mock.module("node:fs/promises", { namedExports: { readdir: async () => [], readFile: async () => "" } });
mock.module("@/lib/supabase/server", {
  namedExports: { createSupabaseServerClient: async () => client },
});

const { getArticleBySlug } = await import("./articles.ts");

test("Turkish articles display saved text and preserve empty fields", async () => {
  translationRows = [{
    article_id: "article-id", language: "tr", title: "Turkish title", summary: "", body: "Turkish body",
  }];
  const result = await getArticleBySlug("example", "tr");
  assert.equal(result.title, "Turkish title");
  assert.equal(result.summary, "");
  assert.equal(result.body, "Turkish body");
});

test("articles without a Turkish translation display the English version", async () => {
  translationRows = [];
  const result = await getArticleBySlug("example", "tr");
  assert.equal(result.title, "English title");
  assert.equal(result.summary, "English summary");
  assert.equal(result.body, "English body");
});
