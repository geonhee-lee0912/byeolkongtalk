// app/admin/relationship/[id]/page.tsx — 우리 사이 스레드 상세.
// 대화 메시지 + 이벤트(패스 구매·턴 연장·스킬 호출)를 시간순 한 줄기로 인터리브.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { crush: "썸", dating: "연애중", breakup: "이별", onesided: "짝사랑" };
const KIND_LABEL: Record<string, string> = { day1: "1일권", day3: "3일권", day7: "7일권" };
const SKILL_LABEL: Record<string, string> = { checkin: "관계 체크인", deep_feelings: "걔 속마음", compat: "우리 궁합", verdict: "싸움 판정" };

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 스레드 마커를 어드민 가독용 배지 텍스트로 치환 (유저가 그 시점에 뭘 봤는지 확인용)
function cleanThreadContent(raw: string): string {
  return raw
    .replace(/\[SKILL:([a-z_]+)\]/gi, (_, k) => `〔🔔 스킬 칩: ${SKILL_LABEL[k] ?? k}〕`)
    .replace(/\[CHECKIN:([^\]]+)\]/gi, "〔📌 체크인 예약: $1〕")
    .trim();
}

type TimelineItem =
  | { ts: string; kind: "msg"; role: "user" | "assistant"; content: string }
  | { ts: string; kind: "pass"; passKind: string; stars: number; expiresAt: string }
  | { ts: string; kind: "extend"; stars: number }
  | { ts: string; kind: "skill"; skillKey: string; readingId: string; consultationType: string | null; stars: number };

export default async function AdminRelationshipDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data: rel } = await supabase
    .from("relationships")
    .select("id, user_id, label, status, thread_reading_id, rolling_summary, summarized_msg_count, memo, last_visited_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!rel) notFound();

  const [{ data: msgs }, { data: passes }, { data: extendTxs }, { data: skillReadings }] = await Promise.all([
    rel.thread_reading_id
      ? supabase.from("messages").select("role, content, created_at").eq("reading_id", rel.thread_reading_id).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { role: string; content: string; created_at: string }[] }),
    supabase.from("relationship_passes").select("kind, stars_spent, expires_at, created_at").eq("relationship_id", id),
    rel.thread_reading_id
      ? supabase.from("star_transactions").select("amount, created_at").eq("reading_id", rel.thread_reading_id).eq("source", "rel_extend")
      : Promise.resolve({ data: [] as { amount: number; created_at: string }[] }),
    supabase.from("readings").select("id, skill_key, consultation_type, stars_spent, created_at").eq("relationship_id", id).not("skill_key", "is", null),
  ]);

  const timeline: TimelineItem[] = [
    ...(msgs ?? []).map((m) => ({ ts: m.created_at, kind: "msg" as const, role: m.role as "user" | "assistant", content: m.content })),
    ...(passes ?? []).map((p) => ({ ts: p.created_at, kind: "pass" as const, passKind: p.kind, stars: p.stars_spent ?? 0, expiresAt: p.expires_at })),
    ...(extendTxs ?? []).map((t) => ({ ts: t.created_at, kind: "extend" as const, stars: Math.abs(t.amount) })),
    ...(skillReadings ?? []).map((r) => ({
      ts: r.created_at, kind: "skill" as const, skillKey: r.skill_key as string,
      readingId: r.id, consultationType: r.consultation_type, stars: r.stars_spent ?? 0,
    })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));

  const totalSpend =
    (passes ?? []).reduce((s, p) => s + (p.stars_spent ?? 0), 0) +
    (extendTxs ?? []).reduce((s, t) => s + Math.abs(t.amount), 0) +
    (skillReadings ?? []).reduce((s, r) => s + (r.stars_spent ?? 0), 0);

  const memo = (rel.memo ?? {}) as Record<string, unknown>;

  const EventChip = ({ children }: { children: React.ReactNode }) => (
    <div className="my-2 flex justify-center">
      <div className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[12px] text-gold">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">
          우리 사이 <span className="text-lilac">{rel.label}</span>
          <span className="text-white/40 text-sm font-normal"> · {STATUS_LABEL[rel.status] ?? rel.status}</span>
        </h1>
        <div className="mt-1 text-sm text-white/60">
          유저 <Link href={`/admin/users/${rel.user_id}`} className="font-mono text-xs underline">{rel.user_id.slice(0, 8)}</Link>
          {" · "}등록 {fmt(rel.created_at)}
          {rel.last_visited_at && <> · 최근 방문 {fmt(rel.last_visited_at)}</>}
          {" · "}누적 지출 ⭐{totalSpend}
        </div>
      </div>

      {rel.rolling_summary && (
        <details className="rounded-lg border border-white/10 bg-white/5">
          <summary className="cursor-pointer px-3 py-2 text-xs text-white/60">
            롤링 요약 (older {rel.summarized_msg_count}개 메시지 커버)
          </summary>
          <div className="whitespace-pre-wrap p-3 text-[13px] text-white/70">{rel.rolling_summary}</div>
        </details>
      )}

      {Object.keys(memo).length > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/5">
          <summary className="cursor-pointer px-3 py-2 text-xs text-white/60">memo (체크인·처방·스킬 로그)</summary>
          <pre className="overflow-x-auto p-3 text-[12px] text-white/70">{JSON.stringify(memo, null, 2)}</pre>
        </details>
      )}

      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-xs font-bold text-white/60">스레드 타임라인 ({timeline.length}건)</div>
        {timeline.length === 0 && (
          <div className="py-4 text-center text-[13px] text-white/40">아직 대화·구매 기록 없음 (등록만 하고 이탈)</div>
        )}
        <div className="space-y-2">
          {timeline.map((item, i) => {
            if (item.kind === "pass") {
              return (
                <EventChip key={i}>
                  🎫 패스 구매 — {KIND_LABEL[item.passKind] ?? item.passKind} ⭐{item.stars}
                  <span className="text-gold/60"> · ~{fmt(item.expiresAt)} · {fmt(item.ts)}</span>
                </EventChip>
              );
            }
            if (item.kind === "extend") {
              return (
                <EventChip key={i}>
                  ⏳ 턴 연장 ⭐{item.stars}<span className="text-gold/60"> · {fmt(item.ts)}</span>
                </EventChip>
              );
            }
            if (item.kind === "skill") {
              return (
                <EventChip key={i}>
                  ⚡ 스킬 — {SKILL_LABEL[item.skillKey] ?? item.skillKey} ⭐{item.stars}
                  <span className="text-gold/60"> · {fmt(item.ts)} · </span>
                  <Link href={`/admin/readings/${item.readingId}`} className="underline">리딩 보기</Link>
                </EventChip>
              );
            }
            return (
              <div key={i} className={`rounded-lg p-3 text-sm ${item.role === "user" ? "ml-8 bg-white/10" : "mr-8 bg-lilac-deep/30"}`}>
                <div className="mb-1 text-[10px] text-white/40">
                  {item.role === "user" ? "유저" : "별콩이"} · {fmt(item.ts)}
                </div>
                <div className="whitespace-pre-wrap">
                  {item.role === "assistant" ? cleanThreadContent(item.content) : item.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
