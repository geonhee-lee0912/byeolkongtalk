// 사주 상담 종료(2026-11-22 운영자 결정) — 새 상담을 만드는 길만 서버에서 거절한다.
// 지난 상담 보기와 끝나지 않은 상담을 마저 하는 것(대화·연장)은 그대로다. 새 사주 수요는 사주 운세(/fortune)가 받는다.
// 거절하는 곳과 남기는 곳은 closed.test.ts 가 잠근다. 우리 사이 종료(lib/relationship/closed.ts)와 같은 꼴 —
// 만드는 코드는 남겨 두고 앞에서 거절한다(다시 팔기로 하면 이 값 + 화면 입구).
import { NextResponse } from "next/server";

export const SAJU_CONSULT_CLOSED = true;

/** 닫혀 있으면 410, 열려 있으면 null. error 는 옛 탭의 이어가기 팝업이 그대로 찍는 문구다(코드명으로 바꾸지 말 것) — 판단은 code 로. */
export function sajuConsultClosedResponse(): NextResponse | null {
  if (!SAJU_CONSULT_CLOSED) return null;
  return NextResponse.json({ error: "사주 상담은 종료됐어", code: "SERVICE_CLOSED" }, { status: 410 });
}
