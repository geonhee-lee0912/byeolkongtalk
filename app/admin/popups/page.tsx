// app/admin/popups/page.tsx — 공지 팝업 (전체 발송 + 발송 목록/확인율).
//
// 확인 수 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 popup_acks
// 의 popup_id 를 `.limit(100000)` 으로 받아 앱에서 Map 으로 셌는데, Supabase `Max rows`(서버 강제
// 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 + Content-Range 로 응답하고
// supabase-js 는 에러로 승격하지 않는다(2026-07-28 사고: 확인율이 조용히 낮게 보였을 축).
import { getServiceSupabase } from "@/lib/supabase";
import { PopupAdmin } from "@/components/admin/PopupAdmin";
import LoadFailed from "@/components/admin/LoadFailed";

export const dynamic = "force-dynamic";

// 실패한 숫자는 0 이 아니라 "—" 로 낸다. PopupAdmin 의 prop 은 number 라 표시용 문자열을 넣으려면
// 캐스팅이 필요한데, 이번 변경 범위가 페이지 파일뿐이라 컴포넌트 타입은 넓히지 않았다.
// 실패했을 때만 들어가므로 정상 경로의 렌더 결과는 그대로다.
const DASH = "—"; // 조회 실패 표시 — PopupAdmin 의 prop 이 number | string 이라 캐스팅이 필요 없다

export default async function AdminPopupsPage() {
  const supa = getServiceSupabase();
  const [popupsRes, usersCount] = await Promise.all([
    supa
      .from("popups")
      .select("id, target_user_id, title, body, image_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supa.from("users").select("id", { count: "exact", head: true }),
  ]);

  const rows = popupsRes.data ?? [];
  const ackCounts = new Map<string, number>();
  let acksFailed = false;
  if (rows.length) {
    // 반환 행수가 팝업 수 이하 = 위 목록 상한(100)에 이미 유계라 별도 p_limit 이 없다.
    // 확인 0건인 팝업은 행이 안 나온다 — 아래 `?? 0` 이 그대로 받는다(현행과 동일).
    const { data: acks, error } = await supa.rpc("admin_popup_ack_counts", {
      p_popup_ids: rows.map((p) => p.id),
    });
    // RPC 가 죽으면 "확인 0" 이 되어 발송이 아무에게도 안 닿은 것처럼 보인다 — 구분해서 둔다.
    acksFailed = !!error;
    // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
    for (const a of (acks ?? []) as { popup_id: string; ack_count: number }[]) {
      ackCounts.set(a.popup_id, Number(a.ack_count));
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">공지 팝업</h1>
      {popupsRes.error ? (
        // 목록 조회가 실패하면 PopupAdmin 을 아예 렌더하지 않는다 — 그 안의 "발송한 팝업 없음"이
        // 실패를 "보낸 적 없음"으로 위장한다. 발송 폼도 같이 사라지지만, 이미 보낸 게 뭔지 못 읽는
        // 상태에서 발송부터 하게 두는 것보다 낫다.
        <LoadFailed block="popups 목록" />
      ) : (
        <>
          {acksFailed && <LoadFailed block="admin_popup_ack_counts" />}
          {usersCount.error && <LoadFailed block="users 전체 수" />}
          <PopupAdmin
            popups={rows.map((p) => ({
              id: p.id,
              title: p.title,
              body: p.body,
              imageUrl: p.image_url,
              broadcast: p.target_user_id === null,
              targetUserId: p.target_user_id,
              createdAt: p.created_at,
              ackCount: acksFailed ? DASH : ackCounts.get(p.id) ?? 0,
            }))}
            totalUsers={usersCount.error ? DASH : usersCount.count ?? 0}
          />
        </>
      )}
    </div>
  );
}
