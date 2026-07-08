// app/admin/popups/page.tsx — 공지 팝업 (전체 발송 + 발송 목록/확인율).
import { getServiceSupabase } from "@/lib/supabase";
import { PopupAdmin } from "@/components/admin/PopupAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPopupsPage() {
  const supa = getServiceSupabase();
  const [{ data: popups }, usersCount] = await Promise.all([
    supa
      .from("popups")
      .select("id, target_user_id, title, body, image_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supa.from("users").select("id", { count: "exact", head: true }),
  ]);

  const rows = popups ?? [];
  const ackCounts = new Map<string, number>();
  if (rows.length) {
    const { data: acks } = await supa
      .from("popup_acks")
      .select("popup_id")
      .in(
        "popup_id",
        rows.map((p) => p.id)
      )
      .limit(100000);
    for (const a of acks ?? []) {
      ackCounts.set(a.popup_id, (ackCounts.get(a.popup_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">공지 팝업</h1>
      <PopupAdmin
        popups={rows.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          imageUrl: p.image_url,
          broadcast: p.target_user_id === null,
          targetUserId: p.target_user_id,
          createdAt: p.created_at,
          ackCount: ackCounts.get(p.id) ?? 0,
        }))}
        totalUsers={usersCount.count ?? 0}
      />
    </div>
  );
}
