// app/admin/relationship/page.tsx — 연애 상담(우리 사이) 지표 + 대화 흐름 + 스레드 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { isAdminUserId } from "@/lib/admin";
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

interface ThreadRow {
  id: string;
  userId: string;
  isAdmin: boolean;
  label: string;
  status: string;
  msgCount: number;
  activePass: { kind: string; expiresAt: string } | null;
  totalSpend: number;
  lastVisitedAt: string | null;
  createdAt: string;
}

async function load() {
  const supa = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const weekAgo = Date.now() - 7 * 86400000;

  // 전체 조회 → 통계는 운영자 제외(JS 필터), 스레드 목록(관리)은 전체 노출
  const [{ data: relsAll }, { data: passesAll }, { data: extendsAll }, { data: skillsAll }] = await Promise.all([
    supa.from("relationships")
      .select("id, user_id, label, status, thread_reading_id, last_visited_at, created_at")
      .order("created_at", { ascending: false }),
    supa.from("relationship_passes").select("user_id, relationship_id, kind, stars_spent, expires_at"),
    supa.from("star_transactions").select("user_id, reading_id, amount").eq("source", "rel_extend"),
    supa.from("readings").select("user_id, relationship_id, skill_key, stars_spent").not("skill_key", "is", null),
  ]);
  const rels = relsAll ?? [];
  const passes = passesAll ?? [];
  const extendTxs = extendsAll ?? [];
  const skills = skillsAll ?? [];

  const statsRels = rels.filter((r) => !isAdminUserId(r.user_id));
  const statsPasses = passes.filter((p) => !isAdminUserId(p.user_id));
  const statsExtends = extendTxs.filter((t) => !isAdminUserId(t.user_id));
  const statsSkills = skills.filter((s) => !isAdminUserId(s.user_id));

  const threadIds = rels.map((r) => r.thread_reading_id).filter(Boolean) as string[];
  let msgs: RelMsgRow[] = [];
  if (threadIds.length) {
    const { data } = await supa.from("messages").select("reading_id, role, created_at").in("reading_id", threadIds).limit(100000);
    msgs = (data ?? []) as RelMsgRow[];
  }
  const statsThreadIds = new Set(statsRels.map((r) => r.thread_reading_id).filter(Boolean));
  const flow = buildRelationshipFlow(msgs.filter((m) => statsThreadIds.has(m.reading_id)));

  const statusDist: Record<string, number> = {};
  for (const r of statsRels) statusDist[r.status] = (statusDist[r.status] ?? 0) + 1;
  const activeThreads = statsRels.filter((r) => r.last_visited_at && new Date(r.last_visited_at).getTime() > weekAgo).length;

  const passByKind: Record<string, number> = {};
  let passRevenue = 0;
  const passUserCount = new Map<string, number>();
  for (const p of statsPasses) {
    passByKind[p.kind] = (passByKind[p.kind] ?? 0) + 1;
    passRevenue += p.stars_spent ?? 0;
    passUserCount.set(p.user_id, (passUserCount.get(p.user_id) ?? 0) + 1);
  }
  const activePasses = statsPasses.filter((p) => p.expires_at > nowIso).length;
  const passBuyers = passUserCount.size;
  const renewers = [...passUserCount.values()].filter((c) => c >= 2).length;

  const skillDist: Record<string, number> = {};
  for (const s of statsSkills) if (s.skill_key) skillDist[s.skill_key] = (skillDist[s.skill_key] ?? 0) + 1;

  // ── 스레드 목록 (관계당 1행) ──
  const msgCountByThread = new Map<string, number>();
  for (const m of msgs) msgCountByThread.set(m.reading_id, (msgCountByThread.get(m.reading_id) ?? 0) + 1);

  const spendByRel = new Map<string, number>();
  const addSpend = (relId: string | null, amount: number | null) => {
    if (!relId || !amount) return;
    spendByRel.set(relId, (spendByRel.get(relId) ?? 0) + Math.abs(amount));
  };
  const activePassByRel = new Map<string, { kind: string; expiresAt: string }>();
  for (const p of passes) {
    addSpend(p.relationship_id, p.stars_spent);
    if (p.expires_at > nowIso) {
      const cur = activePassByRel.get(p.relationship_id);
      if (!cur || p.expires_at > cur.expiresAt) activePassByRel.set(p.relationship_id, { kind: p.kind, expiresAt: p.expires_at });
    }
  }
  const relByThread = new Map(rels.filter((r) => r.thread_reading_id).map((r) => [r.thread_reading_id as string, r.id]));
  for (const t of extendTxs) addSpend(t.reading_id ? relByThread.get(t.reading_id) ?? null : null, t.amount);
  for (const s of skills) addSpend(s.relationship_id, s.stars_spent);

  const threads: ThreadRow[] = rels.map((r) => ({
    id: r.id,
    userId: r.user_id,
    isAdmin: isAdminUserId(r.user_id),
    label: r.label,
    status: r.status,
    msgCount: r.thread_reading_id ? msgCountByThread.get(r.thread_reading_id) ?? 0 : 0,
    activePass: activePassByRel.get(r.id) ?? null,
    totalSpend: spendByRel.get(r.id) ?? 0,
    lastVisitedAt: r.last_visited_at,
    createdAt: r.created_at,
  }));

  return {
    totalRels: statsRels.length,
    statusDist,
    activeThreads,
    activePasses,
    passByKind,
    passRevenue,
    passBuyers,
    renewers,
    extendCount: statsExtends.length,
    skillDist,
    flow,
    threads,
  };
}

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
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

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          스레드 목록 <span className="text-white/35">전체 {s.threads.length}건 · 통계와 달리 운영자 포함</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-2">사용자</th><th>호칭</th><th>상태</th><th>메시지</th>
                <th>활성 패스</th><th>누적 지출</th><th>최근 방문</th><th>등록</th><th></th>
              </tr>
            </thead>
            <tbody>
              {s.threads.map((t) => (
                <tr key={t.id} className="border-t border-white/10">
                  <td className="py-2 font-mono text-xs whitespace-nowrap">
                    {t.userId.slice(0, 8)}
                    {t.isAdmin && <span className="ml-1 rounded bg-white/10 px-1 text-[10px] font-sans text-white/50">운영자</span>}
                  </td>
                  <td className="whitespace-nowrap">{t.label}</td>
                  <td className="whitespace-nowrap">{STATUS_LABEL[t.status] ?? t.status}</td>
                  <td>{t.msgCount}</td>
                  <td className="whitespace-nowrap">
                    {t.activePass
                      ? <>{KIND_LABEL[t.activePass.kind] ?? t.activePass.kind} <span className="text-white/40">~{fmtDate(t.activePass.expiresAt)}</span></>
                      : <span className="text-white/30">없음</span>}
                  </td>
                  <td>⭐{t.totalSpend}</td>
                  <td className="whitespace-nowrap">{fmtDate(t.lastVisitedAt)}</td>
                  <td className="whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                  <td className="text-right"><Link href={`/admin/relationship/${t.id}`} className="text-lilac underline">보기</Link></td>
                </tr>
              ))}
              {s.threads.length === 0 && (
                <tr><td colSpan={9} className="py-4 text-center text-white/40">등록된 관계 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
