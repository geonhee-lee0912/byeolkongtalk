// app/admin/ads/page.tsx — 광고 지출 입력/목록.
//
// 소재 제안·총 지출 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은
// user_acquisition(90일)·ad_spend 를 `.limit(100000)` 으로 받아 앱에서 dedupe·reduce 했는데,
// Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 +
// Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않는다(2026-07-28 사고).
// 별칭 병합·NULL 처리·정렬 규칙은 전부 RPC 안에 있다
// (supabase/migrations/20260731040000_admin_ads_popups_aggregates.sql — 근거는 그 주석).
import { getServiceSupabase } from "@/lib/supabase";
import { daysAgoKstIso } from "@/lib/admin-time";
import { AdSpendForm } from "@/components/admin/AdSpendForm";
import { AdSpendUpload } from "@/components/admin/AdSpendUpload";
import LoadFailed from "@/components/admin/LoadFailed";
import { CREATIVE_ALIASES } from "@/lib/analytics/creative-alias";

export const dynamic = "force-dynamic";

// 지출 목록은 집계가 아니라 화면에 그대로 뿌리는 행이라 표시용 상한 500 을 유지한다.
// (2026-07-31 실측 68행) 다만 닿으면 아래에서 한 줄로 드러낸다 — 조용히 잘리지 않게.
const LIST_LIMIT = 500;
// 소재 제안은 반환 행수가 소재 카디널리티에 비례한다. RPC 결과도 PostgREST 를 지나므로 상한을
// 명시하고, 닿으면 truncated 경고로 드러낸다.
const CREATIVE_LIMIT = 200;

export default async function AdsPage() {
  const supa = getServiceSupabase();
  const [listRes, sugRes, totalRes] = await Promise.all([
    supa.from("ad_spend").select("*").order("spend_date", { ascending: false }).limit(LIST_LIMIT),
    supa.rpc("admin_ad_creative_suggestions", {
      p_since: daysAgoKstIso(89),
      // 별칭 맵의 단일 원천은 앱에 남긴다 — canonicalCreative 와 같은 맵을 JSONB 로 넘겨
      // SQL 의 admin_canonical_creative 가 동일하게 병합하게 한다(맵을 SQL 에 복사하면 드리프트).
      p_aliases: CREATIVE_ALIASES,
      p_limit: CREATIVE_LIMIT,
    }),
    supa.rpc("admin_ad_spend_total"),
  ]);

  // 세 소스는 각자 실패할 수 있다 — `?? []`·`?? 0` 이 실패를 "값이 없음"으로 위장하지 않게
  // error 를 블록별로 들고 다닌다. 한 블록이 죽어도 나머지는 그대로 렌더한다.
  const listFailed = !!listRes.error;
  const suggestionsFailed = !!sugRes.error;
  const totalFailed = !!totalRes.error;

  // ⚠️ RPC 가 유입 많은 순으로 이미 정렬·중복 제거·빈값 제거를 끝냈다 — 앱에서 다시 하지 않는다.
  const suggestionRows = (sugRes.data ?? []) as { creative: string }[];
  const suggestions = suggestionRows.map((r) => r.creative);
  const suggestionsTruncated = suggestionRows.length >= CREATIVE_LIMIT;
  // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
  const totalSpend = Number(((totalRes.data ?? []) as { total_won: number }[])[0]?.total_won ?? 0);
  const rows = listRes.data;
  const listTruncated = (rows ?? []).length >= LIST_LIMIT;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">광고 지출 <span className="text-white/40 text-sm">(수동 입력 · 선택)</span></h1>
      <p className="text-[13px] text-white/50">메타 Ads Manager 숫자를 일자·소재별로 입력하면 애널리틱스의 CAC·ROAS가 채워집니다. 입력 안 해도 다른 지표는 모두 동작합니다.</p>
      <AdSpendUpload />
      <AdSpendForm creativeSuggestions={suggestions} />
      {/* 자동완성이 비면 "등록된 소재가 없다"로 읽힌다 — 조회 실패는 그렇게 위장하지 않는다. */}
      {suggestionsFailed && <LoadFailed block="admin_ad_creative_suggestions" />}
      {suggestionsTruncated && (
        <p className="text-[12px] text-amber-300/80">
          ⚠️ 소재 종수가 조회 상한({CREATIVE_LIMIT})에 닿아 자동완성이 전부를 보여주지 못한다.
          상한을 올리거나 소재 키를 정리할 것 — 조용히 잘리지 않게 이 줄을 띄운다.
        </p>
      )}

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 inline-block">
        <div className="text-[12px] text-white/50">업로드된 총 지출 (전체 누적)</div>
        {/* 실패한 집계는 ₩0 이 아니라 —. ₩0 은 "광고를 안 돌렸다"는 뜻이 되어버린다. */}
        <div className="text-xl font-bold mt-1">{totalFailed ? "—" : `₩ ${totalSpend.toLocaleString()}`}</div>
      </div>
      {totalFailed && <LoadFailed block="admin_ad_spend_total" />}

      {listFailed ? (
        // 목록 조회가 실패하면 표를 통째로 이 줄로 바꾼다 — "아직 입력된 지출이 없어요"는
        // 실패를 "입력한 적 없음"으로 위장한다.
        <LoadFailed block="ad_spend 목록" />
      ) : (
        <>
          {listTruncated && (
            <p className="text-[12px] text-amber-300/80">
              ⚠️ 지출 행이 표시 상한({LIST_LIMIT})에 닿아 아래 목록이 전부가 아니다. 위 총 지출은 전체
              누적이라 영향 없다 — 목록에 페이지네이션을 붙이거나 상한을 올릴 것.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-white/50 text-left"><tr>
                <th className="py-1">날짜</th><th>캠페인</th><th>소재</th><th>노출</th><th>클릭</th><th>지출(원)</th>
              </tr></thead>
              <tbody>
                {(rows ?? []).map((r: Record<string, unknown>) => (
                  <tr key={String(r.id)} className="border-t border-white/10">
                    <td className="py-1.5">{String(r.spend_date)}</td>
                    <td>{String(r.campaign ?? "")}</td>
                    <td>{String(r.creative_key ?? "")}</td>
                    <td>{r.impressions == null ? "—" : Number(r.impressions).toLocaleString()}</td>
                    <td>{r.clicks == null ? "—" : Number(r.clicks).toLocaleString()}</td>
                    <td>{Number(r.spend_won).toLocaleString()}</td>
                  </tr>
                ))}
                {(rows ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-white/30">아직 입력된 지출이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
