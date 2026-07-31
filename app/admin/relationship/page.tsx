// app/admin/relationship/page.tsx — 연애 상담(우리 사이) 지표 + 대화 흐름.
//
// 집계는 전부 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 relationships·
// relationship_passes·readings 를 **limit 없이** 받고 messages 만 `.limit(100000)` 으로 받아 앱에서
// 집계했는데, Supabase `Max rows`(서버 강제 상한, 기본 1000)가 그 위에 그대로 걸린다 — PostgREST 는
// 200 + Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않아 **조용히 잘린다**
// (2026-07-28 사고: /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
// 세션 분리(6h)·소프트캡·KST 날짜 규칙은 전부 RPC 안에 있다
// (supabase/migrations/20260731030000_admin_relationship_aggregates.sql — 근거는 그 주석).
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray } from "@/lib/admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { crush: "썸", dating: "연애중", breakup: "이별", onesided: "짝사랑" };
const KIND_LABEL: Record<string, string> = { day1: "1일권", day3: "3일권", day7: "7일권" };
const SKILL_LABEL: Record<string, string> = { checkin: "관계 체크인", deep_feelings: "걔 속마음", compat: "우리 궁합", verdict: "싸움 판정" };
// 화면이 그리는 스킬 키의 단일 원천 — RPC 에 그대로 넘겨 집계 대상을 유계로 만든다.
// (readings.skill_key 는 자유 문자열이지만 여기 없는 키는 어차피 렌더에 닿지 않는다.)
const SKILL_KEYS = ["checkin", "deep_feelings", "compat", "verdict"] as const;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

async function load() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  // "지금" 은 한 번만 찍어 RPC 로 넘긴다 — 활성 패스·활성 스레드가 같은 시계를 보게 한다.
  const now = Date.now();
  const p_now = new Date(now).toISOString();
  const p_week_ago = new Date(now - 7 * 86400000).toISOString();

  const [summaryRes, distRes, flowRes] = await Promise.all([
    supa.rpc("admin_relationship_summary", { p_exclude, p_now, p_week_ago }),
    supa.rpc("admin_relationship_dist", { p_exclude, p_skill_keys: [...SKILL_KEYS] }),
    supa.rpc("admin_relationship_flow", { p_exclude }),
  ]);

  // RPC 3개는 서로 독립이다 — 하나가 죽어도 나머지 두 블록은 계속 읽혀야 한다. 여기서 error 를
  // 잡지 않으면 `?? 0` 폴백이 실패를 "값이 0" 으로 위장한다(2026-07-28 cap 사고와 같은 구조).
  const summaryFailed = !!summaryRes.error;
  const distFailed = !!distRes.error;
  const flowFailed = !!flowRes.error;

  // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
  const summary = (
    (summaryRes.data ?? []) as {
      total_rels: number;
      active_threads: number;
      active_passes: number;
      pass_buyers: number;
      renewers: number;
      pass_revenue: number;
      extend_count: number;
    }[]
  )[0];

  // 분포 3종은 (kind, key, cnt) 한 모양으로 와서 kind 로 갈라진다.
  const distRows = (distRes.data ?? []) as { kind: string; key: string; cnt: number }[];
  const dist = (kind: string) => {
    const out: Record<string, number> = {};
    for (const r of distRows) if (r.kind === kind) out[r.key] = Number(r.cnt);
    return out;
  };

  // 방문당 평균 턴만 앱에서 나눈다 — numeric round 와 JS round 가 .x5 정확 동률(예: 41/20)에서
  // 갈릴 수 있어, 화면 숫자를 그대로 보존하려면 나눗셈을 여기 남기는 쪽이 안전하다.
  const flowRow = (
    (flowRes.data ?? []) as { visits: number; total_turns: number; softcap_days: number }[]
  )[0];
  const visits = Number(flowRow?.visits ?? 0);
  const totalTurns = Number(flowRow?.total_turns ?? 0);

  return {
    summaryFailed,
    distFailed,
    flowFailed,
    totalRels: Number(summary?.total_rels ?? 0),
    statusDist: dist("status"),
    activeThreads: Number(summary?.active_threads ?? 0),
    activePasses: Number(summary?.active_passes ?? 0),
    passByKind: dist("pass_kind"),
    passRevenue: Number(summary?.pass_revenue ?? 0),
    passBuyers: Number(summary?.pass_buyers ?? 0),
    renewers: Number(summary?.renewers ?? 0),
    extendCount: Number(summary?.extend_count ?? 0),
    skillDist: dist("skill"),
    flow: {
      visits,
      avgTurnsPerVisit: visits ? Math.round((totalTurns / visits) * 10) / 10 : 0,
      softCapDays: Number(flowRow?.softcap_days ?? 0),
    },
  };
}

export default async function AdminRelationshipPage() {
  const s = await load();
  // summary 가 죽으면 분자·분모가 둘 다 없다 — 아래에서 이 값을 쓰지 않고 `—` 를 띄운다.
  // (없는 값으로 계산한 "0%" 는 그 자체가 또 하나의 거짓말이다.)
  const renewRate = s.passBuyers ? Math.round((s.renewers / s.passBuyers) * 1000) / 10 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">연애 상담 <span className="text-white/40 text-sm">(우리 사이)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">지속 대화형 신상품 — 패스·스킬·리텐션 성과.</p>
      </div>

      <section>
        <h2 className="text-sm text-white/60 mb-3">등록 / 스레드</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 이 섹션은 두 RPC 가 섞여 있다 — 카드마다 자기 출처의 실패만 본다 */}
          <Stat label="관계 등록" value={s.summaryFailed ? "—" : s.totalRels} />
          <Stat label="활성 스레드" value={s.summaryFailed ? "—" : s.activeThreads} sub="최근 7일 방문" />
          <Stat label="썸/연애중" value={s.distFailed ? "—" : (s.statusDist.crush ?? 0) + (s.statusDist.dating ?? 0)} />
          <Stat label="이별/짝사랑" value={s.distFailed ? "—" : (s.statusDist.breakup ?? 0) + (s.statusDist.onesided ?? 0)} />
        </div>
        {s.distFailed ? (
          // 분포가 죽었는데 "등록 없음" 을 띄우면 등록이 0 건이라는 뜻이 된다
          <LoadFailed block="admin_relationship_dist" className="mt-2" />
        ) : (
          <div className="mt-2 text-[12px] text-white/40">
            {Object.entries(s.statusDist).map(([k, v]) => `${STATUS_LABEL[k] ?? k} ${v}`).join(" · ") || "등록 없음"}
          </div>
        )}
        {s.summaryFailed && <LoadFailed block="admin_relationship_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">패스</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="활성 패스" value={s.summaryFailed ? "—" : s.activePasses} />
          <Stat label="패스 구매자" value={s.summaryFailed ? "—" : s.passBuyers} />
          <Stat
            label="갱신율(재구매)"
            value={s.summaryFailed ? "—" : `${renewRate}%`}
            sub={s.summaryFailed ? undefined : `${s.renewers}/${s.passBuyers}명`}
          />
          <Stat label="패스 매출(별)" value={s.summaryFailed ? "—" : s.passRevenue.toLocaleString()} />
        </div>
        {/* 이 한 줄도 출처가 섞여 있다 — 종류별은 dist, 연장 횟수는 summary */}
        <div className="mt-2 text-[12px] text-white/40">
          {(["day1", "day3", "day7"] as const).map((k) => `${KIND_LABEL[k]} ${s.distFailed ? "—" : (s.passByKind[k] ?? 0)}`).join(" · ")} · 연장 {s.summaryFailed ? "—" : s.extendCount}회
        </div>
        {s.summaryFailed && <LoadFailed block="admin_relationship_summary" className="mt-2" />}
        {s.distFailed && <LoadFailed block="admin_relationship_dist" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">스킬 호출</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SKILL_KEYS.map((k) => (
            <Stat key={k} label={SKILL_LABEL[k]} value={s.distFailed ? "—" : (s.skillDist[k] ?? 0)} />
          ))}
        </div>
        {s.distFailed && <LoadFailed block="admin_relationship_dist" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">대화 흐름 <span className="text-white/35">(6시간 갭 = 새 방문)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="총 방문(세션)" value={s.flowFailed ? "—" : s.flow.visits} />
          <Stat label="방문당 평균 턴" value={s.flowFailed ? "—" : s.flow.avgTurnsPerVisit} />
          <Stat label="소프트캡 도달" value={s.flowFailed ? "—" : s.flow.softCapDays} sub="하루 20턴 소진 (스레드·일)" />
        </div>
        {s.flowFailed && <LoadFailed block="admin_relationship_flow" className="mt-2" />}
      </section>
    </div>
  );
}
