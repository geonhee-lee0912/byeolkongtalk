// 상담 진입 경로의 단일 원천.
// app/page.tsx handleSelect 와 콘텐츠 존 GuideCta 가 공유한다.
// ⚠️ app/concern 은 로그인 가드가 없으므로(sessionStorage 만 확인) 가드는 여기가 책임진다.
import type { EmotionTag } from "@/lib/emotions";

/** 홈이 이미 쓰고 있는 세션 키 (app/page.tsx:67 · app/concern/page.tsx:36) */
export const EMOTION_KEY = "byeolkong:emotion";

/** 로그인 여부 → 진입 경로 (순수) */
export function consultationEntryPath(isLoggedIn: boolean): string {
  return isLoggedIn
    ? "/concern"
    : `/login?next=${encodeURIComponent("/concern")}`;
}

/**
 * localStorage 의 byeolkong_user 로 로그인 판정 (클라 전용, 홈과 동일 규칙).
 * 홈(app/page.tsx:81)이 `!user` 로 판정하므로 여기도 truthy 체크여야 한다 —
 * `!== null` 로 두면 falsy 스칼라(0·""·false)가 로그인으로 잡혀 플랜 B Task 12
 * 에서 홈을 이 헬퍼로 교체할 때 조용한 동작 변경이 된다.
 */
export function isLoggedInClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(JSON.parse(localStorage.getItem("byeolkong_user") ?? "null"));
  } catch {
    return false;
  }
}

/** 태그를 심고 이동할 경로를 반환 (클라 전용) */
export function beginConsultation(tag: EmotionTag): string {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(EMOTION_KEY, tag);
    } catch {
      /* 프라이빗 모드 등 — 저장 실패해도 진입은 막지 않는다 */
    }
  }
  return consultationEntryPath(isLoggedInClient());
}
