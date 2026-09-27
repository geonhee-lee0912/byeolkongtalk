// lib/byeolmaru/pair-narrative.ts — 유료 "우리 오늘" 5블록 리포트 캐시((유저,상대,날짜)별 1회 생성).
// 테이블명·컬럼명은 역사적으로 narrative 였다 → report JSONB(20260924000000). 형제 card-narrative.ts 와 같은 규율:
//  · 조회 에러는 "없음"과 구분해 logWarn(§11-1-7) — DB 장애로 캐시 0% 적중이 조용히 지나가지 않게
//  · 포맷 버전 불일치(v≠1·형태 불일치) 행은 지우고 미스로(§11-1-3) — 안 지우면 매 요청 재생성+23505 로 영원히 원가가 든다
//  · 23505(동시 생성)면 승자 행을 다시 읽어 **그걸 반환**(§11-1-5) — 두 탭이 같은 날 서로 다른 글을 보지 않게
import { getServiceSupabase } from "@/lib/supabase";
import { logWarn } from "@/lib/logger";
import { isPairReport, type PairReport } from "./pair-report.ts";

const TABLE = "byeolmaru_pair_narrative";

/** 그날 행 여러 개 중 하나를 고른다 — `created_at` 최근 것. 순수(테스트 대상).
 *  🔴 PK 가 (user_id, partner_profile_id, narrative_date) 라 **같은 날 두 상대의 행이 있을 수
 *     있다** — 상대 교체가 무료이고 하루 상한은 "새 상대 1명"이라 교체 후 생성이 가능하다.
 *  🔴 created_at 파싱 실패를 -Infinity 로 접는다 — 정렬 중 NaN 이 섞이면 비교가 비결정적이 되어
 *     같은 입력이 실행마다 다른 행을 돌려준다. */
export function pickLatestPairRow<T extends { created_at?: string | null }>(
  rows: readonly T[] | null | undefined
): T | null {
  if (!rows || rows.length === 0) return null;
  const at = (r: T): number => {
    const t = r.created_at ? Date.parse(r.created_at) : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return rows.reduce((best, cur) => (at(cur) > at(best) ? cur : best), rows[0]);
}

/** 캐시된 리포트. 없음·에러·구버전 전부 null(에러·구버전은 로그를 남긴다). */
export async function getCachedPairNarrative(
  userId: string,
  partnerProfileId: string,
  dateStr: string
): Promise<PairReport | null> {
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from(TABLE)
    .select("report")
    .eq("user_id", userId)
    .eq("partner_profile_id", partnerProfileId)
    .eq("narrative_date", dateStr)
    .maybeSingle();
  if (error) {
    void logWarn("pair report cache read failed", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, partnerProfileId, code: (error as { code?: string }).code, message: error.message },
    });
    return null;
  }
  if (!data) return null;
  if (!isPairReport(data.report)) {
    // 포맷이 바뀐 뒤 남은 구버전 행 — 지우고 미스로 취급(다음 insert 가 23505 로 막히지 않게).
    void logWarn("pair report cache stale format — deleting", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, partnerProfileId },
    });
    const { error: delErr } = await supa
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("partner_profile_id", partnerProfileId)
      .eq("narrative_date", dateStr);
    if (delErr) {
      // 실패하면 위 주석이 경고한 그 상태(재생성 + 23505 영구 루프)로 정확히 떨어진다 — 계측만 남긴다.
      void logWarn("pair report stale-row delete failed", {
        route: "lib/byeolmaru/pair-narrative",
        userId,
        extra: { dateStr, partnerProfileId, code: (delErr as { code?: string }).code, message: delErr.message },
      });
    }
    return null;
  }
  return data.report;
}

/** 그날 받은 리포트를 **상대를 모르는 채** 찾는다 — 과거 날짜 전용.
 *  🔴 지금 걸어둔 상대로 과거를 조회하면 안 된다. 상대는 교체 가능하고 기록은 보존되므로,
 *     9월 초에 A 를 보다가 B 로 바꿨다면 9/5 에는 **A 의 글**이 있다. 지금 상대(B)로 물으면
 *     "분명히 봤는데 없다"가 된다(스펙 §2 결정 3).
 *  🔴 인덱스 idx_byeolmaru_pair_narrative_user (user_id, narrative_date DESC) 가 이걸 받는다 —
 *     마이그레이션 불필요.
 *  반환에 partnerProfileId 를 실어 보낸다 — 화면이 "그날 상대"를 표시해야 하기 때문이다
 *  (걸어둔 상대를 그리면 B 이름 아래 A 의 글이 뜬다). */
export async function getPairNarrativeByDate(
  userId: string,
  dateStr: string
): Promise<{ report: PairReport; partnerProfileId: string } | null> {
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from(TABLE)
    .select("partner_profile_id, report, created_at")
    .eq("user_id", userId)
    .eq("narrative_date", dateStr);
  if (error) {
    void logWarn("pair report by-date read failed", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, code: (error as { code?: string }).code, message: error.message },
    });
    return null;
  }
  const row = pickLatestPairRow(data);
  if (!row) return null;
  if (!isPairReport(row.report)) {
    void logWarn("pair report by-date shape mismatch", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, partnerProfileId: row.partner_profile_id },
    });
    return null;
  }
  return { report: row.report, partnerProfileId: row.partner_profile_id };
}

/**
 * 오늘 **몇 명의 상대에 대해** 리포트를 생성했나(= 그날 캐시된 행 수).
 * 하루 상한(PAIR_REPORT_DAILY_LIMIT) 판정용 — 상세 근거는 그 상수 주석.
 *
 * 🔴 조회 실패는 **0이 아니라 null** 로 돌린다. 0으로 접으면 DB 장애 때 상한이 통째로 풀려
 *    원가 가드가 조용히 사라진다(호출부가 fail-closed 로 처리한다).
 * 🔴 `head:true, count:"exact"` — 행 본문을 안 가져온다(카운트만 필요하다).
 */
export async function countPairReportsOn(userId: string, dateStr: string): Promise<number | null> {
  const { count, error } = await getServiceSupabase()
    .from(TABLE)
    .select("partner_profile_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("narrative_date", dateStr);
  if (error) {
    void logWarn("pair report daily count failed", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, code: (error as { code?: string }).code, message: error.message },
    });
    return null;
  }
  return count ?? 0;
}

/** 리포트 저장. 반환값이 **응답에 써야 할 것** — 내가 이겼으면 내 것, 동시 생성으로 졌으면 승자 것.
 *  승자 재조회까지 실패하면 내 것을 돌려준다(응답은 어차피 완결 리포트 — 저장 실패는 다음 요청에서 재생성될 뿐). */
export async function savePairNarrative(
  userId: string,
  partnerProfileId: string,
  dateStr: string,
  report: PairReport
): Promise<PairReport> {
  const { error } = await getServiceSupabase()
    .from(TABLE)
    .insert({ user_id: userId, partner_profile_id: partnerProfileId, narrative_date: dateStr, report });
  if (!error) return report;
  if ((error as { code?: string }).code === "23505") {
    const winner = await getCachedPairNarrative(userId, partnerProfileId, dateStr);
    return winner ?? report;
  }
  throw error;
}
