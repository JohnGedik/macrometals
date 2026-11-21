import assert from "node:assert/strict";
import test from "node:test";
import { readArticleTranslations } from "./article-translations.ts";

function form(turkish = {}) {
  const data = new FormData();
  data.set("title_en", "English title");
  data.set("summary_en", "English summary");
  data.set("content_markdown_en", "English content");
  for (const [field, value] of Object.entries(turkish)) data.set(field, value);
  return data;
}

test("a Turkish version preserves an empty summary", () => {
  const { translations } = readArticleTranslations(form({
    title_tr: "Turkish title",
    summary_tr: "  ",
    content_markdown_tr: "Turkish content",
  }));
  assert.deepEqual(translations[1], {
    language: "tr",
    title: "Turkish title",
    summary: "",
    content: "Turkish content",
  });
});

test("an explicit Turkish summary is preserved", () => {
  const { translations } = readArticleTranslations(form({
    title_tr: "Turkish title",
    summary_tr: "Turkish summary",
    content_markdown_tr: "Turkish content",
  }));
  assert.equal(translations[1].summary, "Turkish summary");
});

test("an empty Turkish version is not created", () => {
  const { translations } = readArticleTranslations(form());
  assert.deepEqual(translations.map((translation) => translation.language), ["en"]);
});

test("a Turkish version may contain only a summary", () => {
  const { translations } = readArticleTranslations(form({ summary_tr: "Turkish summary" }));
  assert.deepEqual(translations[1], {
    language: "tr",
    title: "",
    summary: "Turkish summary",
    content: "",
  });
});
