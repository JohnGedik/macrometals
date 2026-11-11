import { WritePage } from "@/app/write/editor-page";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  return <WritePage searchParams={searchParams} />;
}
