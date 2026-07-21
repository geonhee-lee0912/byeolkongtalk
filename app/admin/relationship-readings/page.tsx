// app/admin/relationship-readings/page.tsx — 연애 상담(우리 사이) 리딩 관리.
// 관계(스레드)당 1행 — 패스·연장·스킬 구매를 스레드 단위로 관리. 지표는 /admin/relationship.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { isAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { crush: "썸", dating: "연애중", breakup: "이별", onesided: "짝사랑" };
const KIND_LABEL: Record<string, string> = { day1: "1일권", day3: "3일권", day7: "7일권" };

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

async function load(): Promise<ThreadRow[]> {
  const supa = getServiceSupabase();
  const nowIso = new Date().toISOString();

  const [{ data: relsAll }, { data: passesAll }, { data: extendsAll }, { data: skillsAll }] = await Promise.all([
    supa.from("relationships")
      .select("id, user_id, label, status, thread_reading_id, last_visited_at, created_at")
      .order("created_at", { ascending: false }),
    supa.from("relationship_passes").select("relationship_id, kind, stars_spent, expires_at"),
    supa.from("star_transactions").select("reading_id, amount").eq("source", "rel_extend"),
    supa.from("readings").select("relationship_id, skill_key, stars_spent").not("skill_key", "is", null),
  ]);
  const rels = relsAll ?? [];
  const passes = passesAll ?? [];
  const extendTxs = extendsAll ?? [];
  const skills = skillsAll ?? [];

  const threadIds = rels.map((r) => r.thread_reading_id).filter(Boolean) as string[];
  const msgCountByThread = new Map<string, number>();
  if (threadIds.length) {
    const { data } = await supa.from("messages").select("reading_id").in("reading_id", threadIds).limit(100000);
    for (const m of data ?? []) msgCountByThread.set(m.reading_id, (msgCountByThread.get(m.reading_id) ?? 0) + 1);
  }

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

  const skillCountByRel = new Map<string, number>();
  const skillSpendByRel = new Map<string, number>();
  for (const s of skills) {
    if (!s.relationship_id) continue;
    addSpend(s.relationship_id, s.stars_spent);
    skillCountByRel.set(s.relationship_id, (skillCountByRel.get(s.relationship_id) ?? 0) + 1);
    skillSpendByRel.set(s.relationship_id, (skillSpendByRel.get(s.relationship_id) ?? 0) + Math.abs(s.stars_spent ?? 0));
  }

  return rels.map((r) => ({
    id: r.id,
    userId: r.user_id,
    isAdmin: isAdminUserId(r.user_id),
    label: r.label,
    status: r.status,
    msgCount: r.thread_reading_id ? msgCountByThread.get(r.thread_reading_id) ?? 0 : 0,
    skillCount: skillCountByRel.get(r.id) ?? 0,
    skillSpend: skillSpendByRel.get(r.id) ?? 0,
    activePass: activePassByRel.get(r.id) ?? null,
    totalSpend: spendByRel.get(r.id) ?? 0,
    lastVisitedAt: r.last_visited_at,
    createdAt: r.created_at,
  }));
}

export default async function AdminRelationshipReadings() {
  const threads = await load();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        연애 상담 리딩 <span className="text-white/40 text-sm font-normal">전체 {threads.length}건 · 스레드(관계) 단위</span>
      </h1>
      <p className="text-[13px] text-white/50">
        패스·턴 연장·스킬 구매는 스레드에 귀속 — 행을 열면 대화·구매 타임라인. 성과 지표는 분석·성과 &gt; 연애 상담.
      </p>
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
