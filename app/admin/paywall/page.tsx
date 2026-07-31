// app/admin/paywall/page.tsx — 페이월 퍼널.
// 웰컴 별을 다 쓰고(잔액 < 최저 상품가) 결제해야 하는 지점에 도달한 유저를 집계.
// 매출 0 의 원인이 "아무도 페이월에 안 옴"인지 "왔는데 결제 안 함"인지 판별하는 핵심 뷰.
//
// 집계는 전부 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은
// star_balances·payments·readings·messages 를 `.limit(100000)` 으로 5번 끌어와 앱에서 집계했는데,
// Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 +
// Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않는다.
// **이 화면이 2026-07-28 사고의 당사자다**: 상담 완료율을 21% 로 표시했으나 실제는 63.7% 였다.
// 도달·전환 판정 · 운세 제외(유효 키 검사) · first-touch utm 귀속은 전부 RPC 안에 있다
// (supabase/migrations/20260731020000_admin_paywall_aggregates.sql — 근거는 그 주석).
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { CREATIVE_ALIASES } from "@/lib/analytics/creative-alias";

export const dynamic = "force-dynamic";

const MIN_READING_COST = 10; // 최저 상품(타로 원카드 10별) — 이 미만이면 무료로 더 못 봄

// RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다. 미결제 목록만 반환 행수가
// 유저 수에 비례하므로 상한을 명시하고, 상한에 닿으면 화면에 경고 한 줄로 드러낸다 —
// 조용히 잘리는 것이 2026-07-28 cap 사고의 본질이었다. RPC 기본값과 같은 5000.
const UNCONVERTED_LIMIT = 5000;

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
  const p_exclude = adminExclusionArray();
  // 상담 완료 퍼널 (최근 30일, 상담 리딩만 = 운세 리포트 제외):
  // 시작 → 대화 완료([END]) → 결과 화면(재충전 블록) 열람. 각 단계 이탈 계량.
  const since = daysAgoKstIso(29);

  const [summaryRes, listRes, funnelRes] = await Promise.all([
    supa.rpc("admin_paywall_summary", { p_exclude, p_min_cost: MIN_READING_COST }),
    supa.rpc("admin_paywall_unconverted", {
      p_exclude,
      p_min_cost: MIN_READING_COST,
      // 별칭 맵의 단일 원천은 앱에 남긴다 — canonicalCreative 와 같은 맵을 JSONB 로 넘겨
      // SQL 의 admin_canonical_creative 가 동일하게 병합하게 한다(맵을 SQL 에 복사하면 드리프트).
      p_aliases: CREATIVE_ALIASES,
      p_limit: UNCONVERTED_LIMIT,
    }),
    supa.rpc("admin_consult_funnel", {
      p_since: since,
      p_exclude,
      // 유효 운세 타입의 단일 원천은 앱에 둔다 — SQL 에서 like 'fortune:%' 만 쓰면 'fortune:오타' 를
      // 앱(fortuneTypeFromTag)은 상담으로, SQL 은 운세로 분류해 조용히 어긋난다. 하드코딩하면
      // FORTUNE_CONFIG 에 타입이 추가될 때 드리프트하므로 키를 런타임에 뽑는다.
      p_fortune_types: Object.keys(FORTUNE_CONFIG),
    }),
  ]);

  // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
  const summary = (
    (summaryRes.data ?? []) as {
      total_users: number;
      spent_users: number;
      reached_users: number;
      converted_users: number;
    }[]
  )[0];
  const totalUsers = Number(summary?.total_users ?? 0);
  const spentUsers = Number(summary?.spent_users ?? 0);
  const reachedUsers = Number(summary?.reached_users ?? 0);
  const convertedUsers = Number(summary?.converted_users ?? 0);

  // 미전환(페이월 도달 후 결제 안 한) 유저 상세.
  // ⚠️ RPC 가 created_at DESC(NULLS LAST)로 이미 정렬해 준다 — 앱에서 다시 정렬하지 않는다.
  // ⚠️ nickname·created_at·utm 은 정당하게 NULL 이다(표가 이미 null 을 처리) → 보존한다.
  const list = (
    (listRes.data ?? []) as {
      user_id: string;
      nickname: string | null;
      created_at: string | null;
      balance: number;
      total_spent: number;
      readings: number;
      utm: string | null;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    balance: Number(r.balance),
    totalSpent: Number(r.total_spent),
    readings: Number(r.readings),
    utm: r.utm,
    nickname: r.nickname,
    createdAt: r.created_at,
  }));
  const listTruncated = list.length >= UNCONVERTED_LIMIT;
  // 헤더 건수는 목록 길이가 아니라 요약에서 뽑는다 — 상한에 걸려도 실제 규모를 말한다.
  // 미결제 = 도달 − 전환. 두 RPC 가 같은 술어(총사용>0 · 잔액<최저가 · completed 결제 유무)를
  // 쓰므로 상한에 안 닿는 한 목록 길이와 같은 값이다.
  const notConvertedCount = reachedUsers - convertedUsers;

  const funnel = ((funnelRes.data ?? []) as { started: number; ended: number; viewed: number }[])[0];
  const cfStarted = Number(funnel?.started ?? 0);
  const cfEnded = Number(funnel?.ended ?? 0);
  const cfViewed = Number(funnel?.viewed ?? 0);
  const pct = (n: number, d: number) =>
    d ? Math.round((n / d) * 1000) / 10 : 0;

  const reachedRate =
    spentUsers ? Math.round((reachedUsers / spentUsers) * 1000) / 10 : 0;
  const convRate =
    reachedUsers ? Math.round((convertedUsers / reachedUsers) * 1000) / 10 : 0;

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
          value={spentUsers}
          sub={`전체의 ${totalUsers ? Math.round((spentUsers / totalUsers) * 100) : 0}%`}
        />
        <Stat label="페이월 도달" value={reachedUsers} sub={`별 사용자의 ${reachedRate}%`} />
        <Stat label="결제 전환" value={convertedUsers} sub={`도달자의 ${convRate}%`} />
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
          페이월 도달 · 미결제 ({notConvertedCount})
        </h2>
        {listTruncated && (
          <p className="text-[12px] text-amber-300/80 mb-2">
            ⚠️ 미결제 유저가 조회 상한({UNCONVERTED_LIMIT})에 닿아 표가 전부를 보여주지 못한다. 위
            건수가 실제 규모다 — 페이지네이션을 붙이거나 상한을 올릴 것. 조용히 잘리지 않게 이 줄을
            띄운다.
          </p>
        )}
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
