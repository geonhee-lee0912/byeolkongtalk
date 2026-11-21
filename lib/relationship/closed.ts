// 우리 사이(연애 상담)·연애 시뮬레이션 종료(2026-11-21 운영자 결정) — 쓰기 API 를 서버에서 거절한다.
// 화면 입구는 이미 막혔지만 옛 탭·직접 호출로 새 대화·이용권 구매·별 차감이 일어나지 않게
// 별이 나가거나 AI 를 부르는 POST 의 **첫 줄**에서 410 을 돌려준다 — 세션·DB·별 차감보다 먼저.
// 읽기(GET)·수정(PATCH)은 그대로 둔다: 마이가 `GET /api/relationship` 으로 "관계에 쓰이는 프로필"을 판정한다.
// 거절하는 곳은 closed.test.ts 의 CLOSED_POST_ROUTES 가 잠근다. 다시 열 일이 생기면 RELATIONSHIP_CLOSED 하나만 끈다.
import { NextResponse } from "next/server";

export const RELATIONSHIP_CLOSED = true;

export const RELATIONSHIP_CLOSED_CODE = "SERVICE_CLOSED";

/** 서비스가 닫혀 있으면 410 응답, 열려 있으면 null. POST 핸들러 맨 앞에서 `if (closed) return closed;` 로 쓴다. */
export function relationshipClosedResponse(): NextResponse | null {
  if (!RELATIONSHIP_CLOSED) return null;
  return NextResponse.json(
    { error: "service_closed", code: RELATIONSHIP_CLOSED_CODE, message: "연애 상담은 종료됐어" },
    { status: 410 },
  );
}
