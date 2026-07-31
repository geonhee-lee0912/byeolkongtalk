// app/admin/popups/page.tsx — 공지 팝업 (전체 발송 + 발송 목록/확인율).
//
// 확인 수 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 popup_acks
// 의 popup_id 를 `.limit(100000)` 으로 받아 앱에서 Map 으로 셌는데, Supabase `Max rows`(서버 강제
// 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 + Content-Range 로 응답하고
// supabase-js 는 에러로 승격하지 않는다(2026-07-28 사고: 확인율이 조용히 낮게 보였을 축).
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
    // 반환 행수가 팝업 수 이하 = 위 목록 상한(100)에 이미 유계라 별도 p_limit 이 없다.
    // 확인 0건인 팝업은 행이 안 나온다 — 아래 `?? 0` 이 그대로 받는다(현행과 동일).
    const { data: acks } = await supa.rpc("admin_popup_ack_counts", {
      p_popup_ids: rows.map((p) => p.id),
    });
    // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
    for (const a of (acks ?? []) as { popup_id: string; ack_count: number }[]) {
      ackCounts.set(a.popup_id, Number(a.ack_count));
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
