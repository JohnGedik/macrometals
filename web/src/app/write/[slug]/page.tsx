import { WritePage } from "@/app/write/editor-page";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Edit article",
  robots: { index: false, follow: false },
};

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { slug } = await params;
  return <WritePage slug={slug} searchParams={searchParams} />;
}
