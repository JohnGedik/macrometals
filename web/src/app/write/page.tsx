import { WritePage } from "@/app/write/editor-page";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Write an article",
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  return <WritePage searchParams={searchParams} />;
}
