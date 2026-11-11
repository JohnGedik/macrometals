import { WritePage } from "@/app/write/editor-page";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { slug } = await params;
  return <WritePage slug={slug} searchParams={searchParams} />;
}
