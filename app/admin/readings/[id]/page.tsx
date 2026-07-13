// app/admin/readings/[id]/page.tsx — 리딩 상세.
import { getServiceSupabase } from "@/lib/supabase";
import { DeleteReadingButton } from "@/components/admin/DeleteReadingButton";
import ReadingDetailView, {
  type AdminMessageRow,
} from "@/components/admin/ReadingDetailView";
import UpsellPanel from "@/components/admin/UpsellPanel";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminReadingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const [reading, messages, upsellTxs, childReadings] = await Promise.all([
    supabase.from("readings").select("*").eq("id", id).single(),
    supabase.from("messages").select("role, content, created_at").eq("reading_id", id).order("created_at", { ascending: true }).order("role", { ascending: false }),
    // 업셀 구매 흔적 (clarifier·extend)
    supabase.from("star_transactions").select("source, amount, created_at").eq("reading_id", id).in("source", ["clarifier", "extend"]).order("created_at", { ascending: true }),
    // 이 리딩에서 이어진 자식 리딩 (추천 카드·인챗 직행·이어가기 전환)
    supabase.from("readings").select("id, consultation_type, saju_product, spread_type, continuation_mode, created_at").eq("previous_reading_id", id).order("created_at", { ascending: true }),
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
      <UpsellPanel
        messages={(messages.data ?? []) as AdminMessageRow[]}
        nextReco={reading.data.next_reco ?? null}
        clarifierCount={reading.data.clarifier_count ?? 0}
        extraTurns={reading.data.extra_turns ?? 0}
        upsellTxs={upsellTxs.data ?? []}
        childReadings={childReadings.data ?? []}
      />
      <ReadingDetailView
        reading={reading.data}
        messages={(messages.data ?? []) as AdminMessageRow[]}
      />
    </div>
  );
}
