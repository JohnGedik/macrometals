"use client";

import { useEffect } from "react";
import { recordArticleViewAction } from "@/app/community/actions";

export function ArticleViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    const key = `viewed-article:${articleId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void recordArticleViewAction(articleId);
  }, [articleId]);

  return null;
}