import assert from "node:assert/strict";
import test from "node:test";
import { matchesTopic, sortFeedArticles } from "./community-feed.ts";

const articles = [
  { id: "a", tags: ["Gold", "Inflation"], publishedAt: "2026-01-01", score: 2 },
  { id: "b", tags: [], category: "Copper", publishedAt: "2026-02-01", score: 5 },
  { id: "c", tags: ["Macro"], publishedAt: "2026-03-01", score: 2 },
];

test("topic matching uses categories, tags and macro-related tags", () => {
  assert.deepEqual(articles.filter((item) => matchesTopic(item, "gold")).map((item) => item.id), ["a"]);
  assert.deepEqual(articles.filter((item) => matchesTopic(item, "copper")).map((item) => item.id), ["b"]);
  assert.deepEqual(articles.filter((item) => matchesTopic(item, "macro")).map((item) => item.id), ["a", "c"]);
  assert.equal(articles.filter((item) => matchesTopic(item, "all")).length, 3);
});

test("feed ordering uses votes or comment counts and breaks ties by newest", () => {
  const ids = (sort, counts = new Map()) => sortFeedArticles(articles, sort, counts).map((item) => item.id);
  assert.deepEqual(ids("latest"), ["c", "b", "a"]);
  assert.deepEqual(ids("top"), ["b", "c", "a"]);
  assert.deepEqual(ids("discussed", new Map([["a", 3], ["b", 1], ["c", 1]])), ["a", "c", "b"]);
  assert.deepEqual(articles.map((item) => item.id), ["a", "b", "c"]);
});
