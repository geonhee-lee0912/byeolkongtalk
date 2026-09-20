// lib/byeolmaru/card-narrative.ts — 유료 "오늘 타로" 7블록 리포트 캐시((유저,날짜)별 1회 생성). 테이블명은 역사적으로 narrative.
// P6-2: narrative TEXT → report JSONB(20260920000000). 규율 = daily-report.ts 미러 + §11-1 세 가지:
//  · 조회 에러는 "없음"과 구분해 logWarn(§11-1-7) — DB 장애로 캐시 0% 적중이 조용히 지나가지 않게
//  · 포맷 버전 불일치(v≠1·형태 불일치) 행은 지우고 미스로(§11-1-3) — 안 지우면 매 요청 재생성+23505 로 영원히 원가가 든다
//  · 23505(동시 생성)면 승자 행을 다시 읽어 **그걸 반환**(§11-1-5) — 두 탭이 서로 다른 글을 보지 않게
import { getServiceSupabase } from "@/lib/supabase";
import { logWarn } from "@/lib/logger";
import { isCardReport, type CardReport } from "./card-report.ts";

const TABLE = "byeolmaru_card_narrative";

/** 캐시된 리포트. 없음·에러·구버전 전부 null(에러·구버전은 로그를 남긴다). */
export async function getCachedCardReport(userId: string, dateStr: string): Promise<CardReport | null> {
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from(TABLE)
    .select("report")
    .eq("user_id", userId)
    .eq("narrative_date", dateStr)
    .maybeSingle();
  if (error) {
    void logWarn("card report cache read failed", { route: "lib/byeolmaru/card-narrative", userId, extra: { dateStr, code: (error as { code?: string }).code, message: error.message } });
    return null;
  }
  if (!data) return null;
  if (!isCardReport(data.report)) {
    // 포맷이 바뀐 뒤 남은 구버전 행 — 지우고 미스로 취급(다음 insert 가 23505 로 막히지 않게).
    void logWarn("card report cache stale format — deleting", { route: "lib/byeolmaru/card-narrative", userId, extra: { dateStr } });
    await supa.from(TABLE).delete().eq("user_id", userId).eq("narrative_date", dateStr);
    return null;
  }
  return data.report;
}

/** 리포트 저장. 반환값이 **응답에 써야 할 것** — 내가 이겼으면 내 것, 동시 생성으로 졌으면 승자 것.
 *  승자 재조회까지 실패하면 내 것을 돌려준다(응답은 어차피 완결 리포트 — 저장 실패는 다음 요청에서 재생성될 뿐). */
export async function saveCardReport(userId: string, dateStr: string, report: CardReport): Promise<CardReport> {
  const { error } = await getServiceSupabase()
    .from(TABLE)
    .insert({ user_id: userId, narrative_date: dateStr, report });
  if (!error) return report;
  if ((error as { code?: string }).code === "23505") {
    const winner = await getCachedCardReport(userId, dateStr);
    return winner ?? report;
  }
  throw error;
}
