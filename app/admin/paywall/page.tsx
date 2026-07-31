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
// (supabase/migrations/20260731020000_admin_paywall_aggregates.sql — 근거는 그 주석.
//  미결제 목록의 LIMIT/OFFSET 은 20260731060000_admin_paywall_pagination.sql).
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { CREATIVE_ALIASES } from "@/lib/analytics/creative-alias";
import { Pager } from "@/components/admin/Pager";

export const dynamic = "force-dynamic";

const MIN_READING_COST = 10; // 최저 상품(타로 원카드 10별) — 이 미만이면 무료로 더 못 봄

// 미결제 목록 한 페이지 행 수. 2026-07-31 실측 398행(약 24명/일 증가)을 한 표에 쏟아붓던 것을
// 쪼갠다. 50 = 스크롤 한두 번으로 훑히면서 현 규모가 8페이지 안에 들어오는 크기. 목록·유저
// 화면의 25 보다 크게 잡은 이유는 여기엔 필터·검색이 없어 "다음"을 그만큼 더 자주 누르기 때문.
// ⚠️ 이전의 UNCONVERTED_LIMIT(5000) + truncated 경고는 제거했다. 그건 페이지네이션이 없어
//    조용한 절단만 막던 안전망이었는데, 이제 한 번에 PER_PAGE 행만 받으므로 Supabase
//    `Max rows` cap(현재 50,000, 최소치여도 1,000)에 원리상 닿지 않는다 = 경고가 도달 불가 UI.
const PER_PAGE = 50;

// ?page 상한 — page*PER_PAGE 가 p_offset(INT) 을 넘기지 않게 막는 방어선. 실질적으로 도달
// 불가한 값이지만 ?page=1e12 같은 입력이 그대로 SQL 까지 내려가지 않게 한다.
const MAX_PAGE = 10000;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

// 🔴 RPC 실패를 0/빈 목록으로 위장하지 않는다. `?? []` · `?? 0` 폴백은 "쿼리가 실패했다"와
//    "값이 진짜 0이다"를 구분 불가능하게 만든다 — 조용한 오답이 2026-07-28 cap 사고의 본질이고
//    (완료율을 21% 로 표시, 실제 63.7%) 이 화면이 그 당사자였다. 실패한 블록만 이 줄로 바꾸고
//    나머지 블록은 그대로 그린다(throw 하면 멀쩡한 지표까지 같이 사라진다).
function LoadFailed({ block }: { block: string }) {
  return (
    <p className="text-[12px] text-amber-300/80">
      ⚠️ {block} 조회에 실패했다 — 숫자를 0으로 위장하지 않고 이 줄을 띄운다. 서버 로그와
      /admin/errors 를 확인할 것.
    </p>
  );
}

export default async function PaywallPage({
  searchParams,
}: {
  // 다른 파라미터를 붙일 여지를 남기려 통짜 Record 로 받는다 — 아래 makeHref 가 page 만
  // 갈아끼우고 나머지는 그대로 보존한다.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pageParam = typeof sp.page === "string" ? sp.page : undefined;
  // 클램프: NaN·빈문자·음수·소수는 1페이지로, 과대 입력은 MAX_PAGE 로 접는다.
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(pageParam)) || 1));
  const offset = (page - 1) * PER_PAGE;
  const makeHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/paywall?${s}` : "/admin/paywall";
  };

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
      p_limit: PER_PAGE,
      p_offset: offset,
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

  // 실패 판정은 /api/admin/traffic 과 같은 방식 — supabase-js 의 `.error` 유무만 본다.
  const summaryFailed = Boolean(summaryRes.error);
  const listFailed = Boolean(listRes.error);
  const funnelFailed = Boolean(funnelRes.error);

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

  // 미전환(페이월 도달 후 결제 안 한) 유저 상세 — 이번 페이지 분량(PER_PAGE)만 온다.
  // ⚠️ RPC 가 created_at DESC(NULLS LAST), user_id 로 이미 정렬해 준다 — 앱에서 다시 정렬하지
  //    않는다. user_id 타이브레이커는 OFFSET 페이지네이션이 성립하려면 정렬이 전순서여야 하기
  //    때문이다(동률이 있으면 같은 행이 두 페이지에 나오고 다른 행이 빠진다).
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
  // 헤더 건수는 목록 길이(=한 페이지 분량)가 아니라 요약에서 뽑는다 — 항상 **전체** 규모다.
  // 미결제 = 도달 − 전환. 두 RPC 가 같은 술어(총사용>0 · 잔액<최저가 · completed 결제 유무)를
  // 쓰므로 이 값이 곧 목록의 총 행수이고, 그래서 페이지 수의 분자로도 그대로 쓴다.
  const notConvertedCount = reachedUsers - convertedUsers;
  // 요약이 실패하면 총 행수를 모른다 → 0으로 접어 페이저를 없애버리는 대신, 이번 페이지가 꽉
  // 찼는지로 "다음이 있을 수 있다"만 표현한다(뒤로 갈 길을 막지 않는다).
  const totalPages = summaryFailed
    ? page + (list.length >= PER_PAGE ? 1 : 0)
    : Math.max(1, Math.ceil(notConvertedCount / PER_PAGE));

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

      {summaryFailed ? (
        <LoadFailed block="페이월 요약(admin_paywall_summary)" />
      ) : (
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
      )}

      <div>
        <h2 className="text-sm text-white/60 mb-1">상담 완료 퍼널 <span className="text-white/35">(최근 30일 · 상담 리딩)</span></h2>
        <p className="text-[12px] text-white/40 mb-2">
          대화를 끝내고(대화 완료) 결과 화면(재충전 블록)까지 도달하는지 — 각 단계 이탈 지점. 결과 열람은 이 기능 배포 이후 생성분부터 집계돼 초기엔 낮게 보입니다.
        </p>
        {funnelFailed ? (
          <LoadFailed block="상담 완료 퍼널(admin_consult_funnel)" />
        ) : (
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
        )}
      </div>

      <div>
        {/* 괄호 안은 항상 **전체** 건수다(요약 RPC 출처) — 표에 보이는 행 수가 아니다.
            그래서 옆에 "N명 중 x–y" 로 이번 페이지 구간을 따로 적는다. */}
        <h2 className="text-sm text-white/60 mb-2">
          페이월 도달 · 미결제 ({summaryFailed ? "?" : notConvertedCount})
          {!listFailed && list.length > 0 && (
            <span className="text-white/35 font-normal">
              {" "}
              · {summaryFailed ? "?" : notConvertedCount}명 중 {offset + 1}–{offset + list.length}
            </span>
          )}
        </h2>
        {listFailed ? (
          <LoadFailed block="미결제 유저 목록(admin_paywall_unconverted)" />
        ) : list.length === 0 ? (
          page > 1 ? (
            <p className="text-sm text-white/40">
              이 페이지에는 표시할 행이 없어요 — 마지막 페이지를 지났습니다.
            </p>
          ) : (
            <p className="text-sm text-white/40">
              아직 페이월에 도달한 미결제 유저가 없어요 — 매출 0은 &ldquo;아직 아무도 결제 지점에 안 온 것&rdquo;(정상)일 가능성이 큽니다.
            </p>
          )
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
        {!listFailed && <Pager page={page} totalPages={totalPages} makeHref={makeHref} />}
      </div>
    </div>
  );
}
