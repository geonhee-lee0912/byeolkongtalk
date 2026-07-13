// lib/reco-nav.ts — 인챗·결과 화면 공통: 추천 상품 클릭 시 sessionStorage 세팅 헬퍼.
// 클라이언트 전용 (window/sessionStorage 직접 접근). 서버 컴포넌트에서 import 금지.
import type { RecoProduct } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";
import { PENDING_KEY } from "@/lib/emotions";

/**
 * cross-type 추천 상품으로 이동하기 전 sessionStorage 2키 세팅.
 * - `byeolkong:continuation` = { previousReadingId, mode: "fresh" }
 * - `byeolkong:pending_consultation` = { emotion, concern, type, [sajuProduct|spreadType] }
 *
 * `continue` 제품은 이 함수 사용 대상이 아님 (호출측에서 필터).
 * 반환: 이동 대상 경로 ("/saju" | "/tarot").
 */
export function setRecoSessionStorage(opts: {
  product: RecoProduct;
  readingId: string;
  question: string;
  emotionTag: string | null;
}): string {
  const { product, readingId, question, emotionTag } = opts;
  const display = RECO_DISPLAY[product];

  sessionStorage.setItem(
    "byeolkong:continuation",
    JSON.stringify({ previousReadingId: readingId, mode: "fresh" })
  );

  const pending: Record<string, unknown> = {
    emotion: emotionTag ?? "",
    concern: question,
    type: display.target,
  };
  if (display.sajuProduct) {
    pending.sajuProduct = display.sajuProduct;
  }
  if (display.spreadType) {
    pending.spreadType = display.spreadType;
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  return display.target === "saju" ? "/saju" : "/tarot";
}
