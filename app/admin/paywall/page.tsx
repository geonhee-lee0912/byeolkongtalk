// app/admin/paywall/page.tsx — 페이월 퍼널.
// 웰컴 별을 다 쓰고(잔액 < 최저 상품가) 결제해야 하는 지점에 도달한 유저를 집계.
// 매출 0 의 원인이 "아무도 페이월에 안 옴"인지 "왔는데 결제 안 함"인지 판별하는 핵심 뷰.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export const dynamic = "force-dynamic";

const MIN_READING_COST = 10; // 최저 상품(타로 원카드 10별) — 이 미만이면 무료로 더 못 봄

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function PaywallPage() {
  const supa = getServiceSupabase();
  const excl = adminExclusionList();

  let balQ = supa
    .from("star_balances")
    .select("user_id, balance, total_spent")
    .limit(100000);
  if (excl) balQ = balQ.not("user_id", "in", excl);
  const { data: balances } = await balQ;
  const rows = balances ?? [];

  const totalUsers = rows.length;
  const spent = rows.filter((b) => (b.total_spent ?? 0) > 0);
  const reached = spent.filter((b) => (b.balance ?? 0) < MIN_READING_COST);

  const { data: pays } = await supa
    .from("payments")
    .select("user_id")
    .eq("status", "completed")
    .limit(100000);
  const payerSet = new Set((pays ?? []).map((p) => p.user_id));

  const converted = reached.filter((b) => payerSet.has(b.user_id));
  const notConverted = reached.filter((b) => !payerSet.has(b.user_id));

  // 미전환(페이월 도달 후 결제 안 한) 유저 상세 enrich
  const ids = notConverted.map((b) => b.user_id);
  const userMap = new Map<string, { nickname: string | null; created_at: string }>();
  const utmMap = new Map<string, string | null>();
  const readCount = new Map<string, number>();
  if (ids.length) {
    const [{ data: users }, { data: acqs }, { data: reads }] = await Promise.all([
      supa.from("users").select("id, nickname, created_at").in("id", ids),
      supa.from("user_acquisition").select("user_id, utm_content").in("user_id", ids),
      supa.from("readings").select("user_id").in("user_id", ids).limit(100000),
    ]);
    for (const u of users ?? []) userMap.set(u.id, { nickname: u.nickname, created_at: u.created_at });
    for (const a of acqs ?? []) utmMap.set(a.user_id, a.utm_content);
    for (const r of reads ?? []) readCount.set(r.user_id, (readCount.get(r.user_id) ?? 0) + 1);
  }

  // 상담 완료 퍼널 (최근 30일, 상담 리딩만 = 운세 리포트 제외):
  // 시작 → 대화 완료([END]) → 결과 화면(재충전 블록) 열람. 각 단계 이탈 계량.
  const since = daysAgoKstIso(29);
  let readQ = supa
    .from("readings")
    .select("id, emotion_tag, result_viewed_at")
    .gte("created_at", since)
    .limit(100000);
  if (excl) readQ = readQ.not("user_id", "in", excl);
  const { data: readRows } = await readQ;
  const consultReads = (readRows ?? []).filter(
    (r) => !fortuneTypeFromTag(r.emotion_tag)
  );
  const consultIds = consultReads.map((r) => r.id);
  const endedSet = new Set<string>();
  if (consultIds.length) {
    const { data: msgs } = await supa
      .from("messages")
      .select("reading_id, content")
      .in("reading_id", consultIds)
      .eq("role", "assistant")
      .limit(100000);
    for (const m of msgs ?? []) {
      if (m.content.includes("[END]")) endedSet.add(m.reading_id);
    }
  }
  const cfStarted = consultReads.length;
  const cfEnded = endedSet.size;
  const cfViewed = consultReads.filter(
    (r) => endedSet.has(r.id) && r.result_viewed_at
  ).length;
  const pct = (n: number, d: number) =>
    d ? Math.round((n / d) * 1000) / 10 : 0;

  const reachedRate =
    spent.length ? Math.round((reached.length / spent.length) * 1000) / 10 : 0;
  const convRate =
    reached.length ? Math.round((converted.length / reached.length) * 1000) / 10 : 0;

  const list = notConverted
    .map((b) => ({
      userId: b.user_id,
      balance: b.balance ?? 0,
      totalSpent: b.total_spent ?? 0,
      readings: readCount.get(b.user_id) ?? 0,
      utm: utmMap.get(b.user_id) ?? null,
      nickname: userMap.get(b.user_id)?.nickname ?? null,
      createdAt: userMap.get(b.user_id)?.created_at ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">페이월 퍼널</h1>
        <p className="text-[13px] text-white/50 mt-1">
          웰컴 별을 다 쓰고(잔액 &lt; {MIN_READING_COST}) 결제해야 하는 지점에 도달한 유저 — 매출 0이 &ldquo;도달 전&rdquo;인지 &ldquo;도달 후 미결제&rdquo;인지 판별.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="전체 유저" value={totalUsers} />
        <Stat
          label="별 사용(리딩)"
          value={spent.length}
          sub={`전체의 ${totalUsers ? Math.round((spent.length / totalUsers) * 100) : 0}%`}
        />
        <Stat label="페이월 도달" value={reached.length} sub={`별 사용자의 ${reachedRate}%`} />
        <Stat label="결제 전환" value={converted.length} sub={`도달자의 ${convRate}%`} />
      </div>

      <div>
        <h2 className="text-sm text-white/60 mb-1">상담 완료 퍼널 <span className="text-white/35">(최근 30일 · 상담 리딩)</span></h2>
        <p className="text-[12px] text-white/40 mb-2">
          대화를 끝내고(대화 완료) 결과 화면(재충전 블록)까지 도달하는지 — 각 단계 이탈 지점. 결과 열람은 이 기능 배포 이후 생성분부터 집계돼 초기엔 낮게 보입니다.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="상담 시작" value={cfStarted} />
          <Stat
            label="대화 완료 ([END])"
            value={cfEnded}
            sub={`완료율 ${pct(cfEnded, cfStarted)}% · 도중 이탈 ${cfStarted - cfEnded}`}
          />
          <Stat
            label="결과 화면 열람"
            value={cfViewed}
            sub={`완료의 ${pct(cfViewed, cfEnded)}% · 미열람 ${cfEnded - cfViewed}`}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm text-white/60 mb-2">
          페이월 도달 · 미결제 ({notConverted.length})
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-white/40">
            아직 페이월에 도달한 미결제 유저가 없어요 — 매출 0은 &ldquo;아직 아무도 결제 지점에 안 온 것&rdquo;(정상)일 가능성이 큽니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-white/50 text-left">
                <tr>
                  <th className="py-1">유저</th>
                  <th>잔액</th>
                  <th>누적 사용</th>
                  <th>리딩</th>
                  <th>유입</th>
                  <th>가입</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.userId} className="border-t border-white/10">
                    <td className="py-1.5">{u.nickname ?? u.userId.slice(0, 8)}</td>
                    <td>⭐ {u.balance}</td>
                    <td>{u.totalSpent}</td>
                    <td>{u.readings}</td>
                    <td>{u.utm ?? "(추적 안 됨)"}</td>
                    <td className="whitespace-nowrap">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : "—"}
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/users/${u.userId}`} className="text-lilac underline">
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
