// app/admin/relationship/page.tsx — 연애 상담(우리 사이) 지표 + 대화 흐름.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList } from "@/lib/admin";
import { buildRelationshipFlow, type RelMsgRow } from "@/lib/analytics/aggregate";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { crush: "썸", dating: "연애중", breakup: "이별", onesided: "짝사랑" };
const KIND_LABEL: Record<string, string> = { day1: "1일권", day3: "3일권", day7: "7일권" };
const SKILL_LABEL: Record<string, string> = { checkin: "관계 체크인", deep_feelings: "걔 속마음", compat: "우리 궁합", verdict: "싸움 판정" };

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
  const excl = adminExclusionList();
  const nowIso = new Date().toISOString();
  const weekAgo = Date.now() - 7 * 86400000;

  let relQ = supa.from("relationships").select("user_id, status, thread_reading_id, last_visited_at, created_at");
  if (excl) relQ = relQ.not("user_id", "in", excl);
  let passQ = supa.from("relationship_passes").select("user_id, kind, stars_spent, expires_at");
  if (excl) passQ = passQ.not("user_id", "in", excl);
  let extQ = supa.from("star_transactions").select("id", { count: "exact", head: true }).eq("source", "rel_extend");
  if (excl) extQ = extQ.not("user_id", "in", excl);
  // skill_key IS NOT NULL + excl — 삼항 한 표현식(재할당 누적 타입 폭발 회피)
  const skQ = excl
    ? supa.from("readings").select("skill_key").not("skill_key", "is", null).not("user_id", "in", excl)
    : supa.from("readings").select("skill_key").not("skill_key", "is", null);

  const [{ data: rels }, { data: passes }, { count: extendCount }, { data: skills }] = await Promise.all([relQ, passQ, extQ, skQ]);

  const threadIds = (rels ?? []).map((r) => r.thread_reading_id).filter(Boolean) as string[];
  let msgs: RelMsgRow[] = [];
  if (threadIds.length) {
    const { data } = await supa.from("messages").select("reading_id, role, created_at").in("reading_id", threadIds).limit(100000);
    msgs = (data ?? []) as RelMsgRow[];
  }
  const flow = buildRelationshipFlow(msgs);

  const statusDist: Record<string, number> = {};
  for (const r of rels ?? []) statusDist[r.status] = (statusDist[r.status] ?? 0) + 1;
  const activeThreads = (rels ?? []).filter((r) => r.last_visited_at && new Date(r.last_visited_at).getTime() > weekAgo).length;

  const passByKind: Record<string, number> = {};
  let passRevenue = 0;
  const passUserCount = new Map<string, number>();
  for (const p of passes ?? []) {
    passByKind[p.kind] = (passByKind[p.kind] ?? 0) + 1;
    passRevenue += p.stars_spent ?? 0;
    passUserCount.set(p.user_id, (passUserCount.get(p.user_id) ?? 0) + 1);
  }
  const activePasses = (passes ?? []).filter((p) => p.expires_at > nowIso).length;
  const passBuyers = passUserCount.size;
  const renewers = [...passUserCount.values()].filter((c) => c >= 2).length;

  const skillDist: Record<string, number> = {};
  for (const s of skills ?? []) if (s.skill_key) skillDist[s.skill_key] = (skillDist[s.skill_key] ?? 0) + 1;

  return {
    totalRels: (rels ?? []).length,
    statusDist,
    activeThreads,
    activePasses,
    passByKind,
    passRevenue,
    passBuyers,
    renewers,
    extendCount: extendCount ?? 0,
    skillDist,
    flow,
  };
}

export default async function AdminRelationshipPage() {
  const s = await load();
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
          <Stat label="관계 등록" value={s.totalRels} />
          <Stat label="활성 스레드" value={s.activeThreads} sub="최근 7일 방문" />
          <Stat label="썸/연애중" value={(s.statusDist.crush ?? 0) + (s.statusDist.dating ?? 0)} />
          <Stat label="이별/짝사랑" value={(s.statusDist.breakup ?? 0) + (s.statusDist.onesided ?? 0)} />
        </div>
        <div className="mt-2 text-[12px] text-white/40">
          {Object.entries(s.statusDist).map(([k, v]) => `${STATUS_LABEL[k] ?? k} ${v}`).join(" · ") || "등록 없음"}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">패스</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="활성 패스" value={s.activePasses} />
          <Stat label="패스 구매자" value={s.passBuyers} />
          <Stat label="갱신율(재구매)" value={`${renewRate}%`} sub={`${s.renewers}/${s.passBuyers}명`} />
          <Stat label="패스 매출(별)" value={s.passRevenue.toLocaleString()} />
        </div>
        <div className="mt-2 text-[12px] text-white/40">
          {(["day1", "day3", "day7"] as const).map((k) => `${KIND_LABEL[k]} ${s.passByKind[k] ?? 0}`).join(" · ")} · 연장 {s.extendCount}회
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">스킬 호출</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["checkin", "deep_feelings", "compat", "verdict"] as const).map((k) => (
            <Stat key={k} label={SKILL_LABEL[k]} value={s.skillDist[k] ?? 0} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">대화 흐름 <span className="text-white/35">(6시간 갭 = 새 방문)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="총 방문(세션)" value={s.flow.visits} />
          <Stat label="방문당 평균 턴" value={s.flow.avgTurnsPerVisit} />
          <Stat label="소프트캡 도달" value={s.flow.softCapDays} sub="하루 20턴 소진 (스레드·일)" />
        </div>
      </section>
    </div>
  );
}
