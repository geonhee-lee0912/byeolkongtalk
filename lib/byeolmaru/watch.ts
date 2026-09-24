// lib/byeolmaru/watch.ts — 우리 오늘 "걸어둔 상대" 조회/설정/삭제 (DB 래퍼).
//
// 🔴 **상대는 한 명이다**(2026-09-24, 사용자 결정). 슬롯(2명 무료 + 5별) 개념은 통째로 없앴다.
//    근거: prod 상대 등록 142명 중 **유료 슬롯 전환 0**, dev 포함 구매 이력 **0건** — 한 번도
//    팔린 적 없는 구조를 떠받치려고 칩 선택·자동 선택·딥링크·과금·롤백을 다 지고 있었다.
//    별마루가 prod 에 안 나가 **이전 대상 사용자도 0명**이라 지금이 바꾸기 가장 싼 시점이었다.
//
// 🔴 **교체는 무료다.** 상대를 바꾸는 순간은 대개 관계가 끝난 순간이라 거기에 결제를 붙이지
//    않는다(교체 과금 기각). 원가는 교체가 아니라 **리포트 생성**에서 나므로 그쪽을 막는다 —
//    PAIR_REPORT_DAILY_LIMIT(하루 1명) 참조.
//
// 🔴 **기록은 남는다.** byeolmaru_pair_narrative 는 (user, partner, 날짜) 키라 이 테이블의 행을
//    갈아치워도 과거 리포트가 그대로 있고, 되돌리면 되살아난다. user_profiles 도 안 지운다
//    (지인 사주와 공유하는 프로필이고, 남겨야 되돌릴 때 재입력이 없다).
import { getServiceSupabase } from "@/lib/supabase";
import type { RelationshipStatus } from "@/lib/relationship/types";

/**
 * 걸어둔 상대를 **설정**한다(추가가 아니라 교체) — 한 명뿐이므로 기존 행을 지우고 새로 넣는다.
 * profileId 소유·비-self·생일 검증은 라우트가 선행한다.
 *
 * 🔴 삭제 → 삽입 순서이고 **트랜잭션이 아니다.** 사이에 실패하면 "아무도 안 걸린" 상태가 되는데,
 *    그건 화면이 이미 다루는 상태(0명 = 걸어두기 유도)라 깨지지 않는다. 반대 순서(먼저 넣고
 *    지우기)는 PK 가 (user, profile) 이라 잠깐 2행이 되고, 그때 삭제가 실패하면 **1명 불변식이
 *    깨진 채 남는다** — 복구 불가능한 쪽을 피한다.
 * 🔴 같은 상대를 다시 설정하면(status 만 바꾸기) 지웠다 넣는 셈이라 결과가 같다.
 *    byeolmaru_pair_narrative 는 이 테이블을 참조하지 않으므로 **과거 리포트는 영향 없다.**
 */
export async function setWatch(
  userId: string, profileId: string, status: RelationshipStatus | null
): Promise<{ success: boolean; reason?: string }> {
  const supabase = getServiceSupabase();
  const { error: delErr } = await supabase.from("byeolmaru_watch").delete().eq("user_id", userId);
  if (delErr) return { success: false, reason: delErr.message };
  const { error: insErr } = await supabase
    .from("byeolmaru_watch")
    .insert({ user_id: userId, profile_id: profileId, status });
  if (insErr) {
    // 23505 = 방금 지웠는데 동시 요청이 먼저 넣은 경우. 원하는 최종 상태(그 상대가 걸림)와
    // 같으면 성공으로 본다 — 두 요청이 같은 상대를 설정한 것이다.
    if ((insErr as { code?: string }).code === "23505") return { success: true };
    return { success: false, reason: insErr.message };
  }
  return { success: true };
}

export async function removeWatch(userId: string, profileId: string): Promise<{ success: boolean }> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("byeolmaru_watch")
    .delete().eq("user_id", userId).eq("profile_id", profileId);
  return { success: !error };
}
