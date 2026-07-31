// app/admin/relationship-readings/page.tsx — 연애 상담(우리 사이) 리딩 관리.
// 관계(스레드)당 1행 — 패스·연장·스킬 구매를 스레드 단위로 관리. 지표는 /admin/relationship.
//
// 집계·조인은 전부 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은
// relationships·relationship_passes·star_transactions(2회)·readings 를 **limit 없이** 받고
// messages 만 `.limit(100000)` 으로 받아 앱에서 Map 조인했는데, Supabase `Max rows`(서버 강제 상한,
// 기본 1000)가 그 위에 그대로 걸린다 — PostgREST 는 200 + Content-Range 로 응답하고 supabase-js 는
// 에러로 승격하지 않아 **조용히 잘린다**(2026-07-28 사고). 잘리면 지출·메시지 수가 소리 없이
// 작아지는 화면이었다. 지출 4갈래 합산 규칙은 RPC 주석에 있다
// (supabase/migrations/20260731030000_admin_relationship_aggregates.sql).
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { isAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { crush: "썸", dating: "연애중", breakup: "이별", onesided: "짝사랑" };
const KIND_LABEL: Record<string, string> = { day1: "1일권", day3: "3일권", day7: "7일권" };

// RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다. 이 화면만 반환 행수가
// 관계 수에 비례하므로 상한을 명시하고, 닿으면 경고 한 줄로 드러낸다 — 조용히 잘리는 것이
// 2026-07-28 cap 사고의 본질이었다. RPC 기본값과 같은 2000.
const THREAD_LIMIT = 2000;

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
}

interface ThreadRow {
  id: string;
  userId: string;
  isAdmin: boolean;
  label: string;
  status: string;
  msgCount: number;
  skillCount: number;
  skillSpend: number;
  activePass: { kind: string; expiresAt: string } | null;
  totalSpend: number;
  lastVisitedAt: string | null;
  createdAt: string;
}

async function load(): Promise<{ threads: ThreadRow[]; total: number; truncated: boolean }> {
  const supa = getServiceSupabase();
  // 활성 패스 판정 시각 — 앱이 한 번 찍어 넘긴다(현행 nowIso 와 같은 역할).
  const { data } = await supa.rpc("admin_relationship_threads", {
    p_now: new Date().toISOString(),
    p_limit: THREAD_LIMIT,
  });

  // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
  // ⚠️ RPC 가 created_at DESC 로 이미 정렬해 준다 — 앱에서 다시 정렬하지 않는다.
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    label: string;
    status: string;
    msg_count: number;
    skill_count: number;
    skill_spend: number;
    active_pass_kind: string | null;
    active_pass_expires_at: string | null;
    total_spend: number;
    last_visited_at: string | null;
    created_at: string;
    total_count: number;
  }[];

  const threads = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    isAdmin: isAdminUserId(r.user_id),
    label: r.label,
    status: r.status,
    msgCount: Number(r.msg_count),
    skillCount: Number(r.skill_count),
    skillSpend: Number(r.skill_spend),
    activePass:
      r.active_pass_kind && r.active_pass_expires_at
        ? { kind: r.active_pass_kind, expiresAt: r.active_pass_expires_at }
        : null,
    totalSpend: Number(r.total_spend),
    lastVisitedAt: r.last_visited_at,
    createdAt: r.created_at,
  }));

  // 헤더 건수는 목록 길이가 아니라 LIMIT 전 전체 행수에서 뽑는다 — 상한에 걸려도 실제 규모를 말한다.
  return {
    threads,
    total: Number(rows[0]?.total_count ?? 0),
    truncated: threads.length >= THREAD_LIMIT,
  };
}

export default async function AdminRelationshipReadings() {
  const { threads, total, truncated } = await load();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        연애 상담 리딩 <span className="text-white/40 text-sm font-normal">전체 {total}건 · 스레드(관계) 단위</span>
      </h1>
      <p className="text-[13px] text-white/50">
        패스·턴 연장·스킬 구매는 스레드에 귀속 — 행을 열면 대화·구매 타임라인. 성과 지표는 분석·성과 &gt; 연애 상담.
      </p>
      {truncated && (
        <p className="text-[12px] text-amber-300/80">
          ⚠️ 관계가 조회 상한({THREAD_LIMIT})에 닿아 표가 전부를 보여주지 못한다. 위 건수가 실제
          규모다 — 페이지네이션을 붙이거나 상한을 올릴 것. 조용히 잘리지 않게 이 줄을 띄운다.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-2">사용자</th><th>호칭</th><th>상태</th><th>메시지</th><th>스킬</th>
              <th>활성 패스</th><th>누적 지출</th><th>최근 방문</th><th>등록</th><th></th>
            </tr>
          </thead>
          <tbody>
            {threads.map((t) => (
              <tr key={t.id} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs whitespace-nowrap">
                  {t.userId.slice(0, 8)}
                  {t.isAdmin && <span className="ml-1 rounded bg-white/10 px-1 text-[10px] font-sans text-white/50">운영자</span>}
                </td>
                <td className="whitespace-nowrap">{t.label}</td>
                <td className="whitespace-nowrap">{STATUS_LABEL[t.status] ?? t.status}</td>
                <td>{t.msgCount}</td>
                <td>{t.skillCount > 0 ? `${t.skillCount}회` : <span className="text-white/30">-</span>}</td>
                <td className="whitespace-nowrap">
                  {t.activePass
                    ? <>{KIND_LABEL[t.activePass.kind] ?? t.activePass.kind} <span className="text-white/40">~{fmtDate(t.activePass.expiresAt)}</span></>
                    : <span className="text-white/30">없음</span>}
                </td>
                <td className="whitespace-nowrap">
                  ⭐{t.totalSpend}
                  {t.skillSpend > 0 && <span className="text-white/40"> (스킬 {t.skillSpend})</span>}
                </td>
                <td className="whitespace-nowrap">{fmtDate(t.lastVisitedAt)}</td>
                <td className="whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                <td className="text-right"><Link href={`/admin/relationship-readings/${t.id}`} className="text-lilac underline">보기</Link></td>
              </tr>
            ))}
            {threads.length === 0 && (
              <tr><td colSpan={10} className="py-4 text-center text-white/40">등록된 관계 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
