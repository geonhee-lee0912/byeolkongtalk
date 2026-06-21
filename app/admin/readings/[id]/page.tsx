// app/admin/readings/[id]/page.tsx — 리딩 상세.
import { getServiceSupabase } from "@/lib/supabase";
import { DeleteReadingButton } from "@/components/admin/DeleteReadingButton";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminReadingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const [reading, messages] = await Promise.all([
    supabase.from("readings").select("*").eq("id", id).single(),
    supabase.from("messages").select("role, content, created_at").eq("reading_id", id).order("created_at", { ascending: true }),
  ]);
  if (!reading.data) notFound();

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">리딩 {id.slice(0, 8)}</h1>
        <DeleteReadingButton id={id} />
      </div>
      <div className="text-sm text-white/60">
        타입 {reading.data.consultation_type} · 태그 {reading.data.emotion_tag ?? "-"} · 별 {reading.data.stars_spent}
      </div>
      <div className="space-y-2">
        {(messages.data ?? []).map((m, i) => (
          <div key={i} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-white/10" : "bg-lilac-deep/30"}`}>
            <div className="text-[10px] text-white/40 mb-1">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
