// 계약: 알림 화면 검수 보충(운영자 11-22) — 낱말 중간 줄 끊김·스위치 선택색.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test("알림 부품 글은 낱말 단위로 줄이 바뀐다(넘치는 낱말만 끊는다)", () => {
  // [파일, 줄바꿈 규칙이 걸리는 덩어리 수]
  const want: [string, number][] = [
    ["components/push/PushAskSheet.tsx", 3], // 제목·설명 / 광고 칸 / 실패 줄
    ["components/push/AdConsentCheck.tsx", 1],
    ["components/push/AdConsentNotice.tsx", 1],
    ["components/push/PushGate.tsx", 2], // 수신거부 줄 / 2년 재확인 창
    ["components/push/RevisitSheet.tsx", 4], // 결과 안 줄 / 제목·설명 / 꺼짐 칸 / 실패 줄
    ["app/mypage/notifications/page.tsx", 1],
    ["app/push/unsubscribe/page.tsx", 1],
  ];
  for (const [f, n] of want) assert.equal(count(src(f), /\bbreak-keep wrap-anywhere\b/g), n, f);
});

test("알림 시트·창·수신거부 화면 제목은 줄 길이를 고르게", () => {
  for (const f of ["PushAskSheet", "AdConsentNotice", "PushGate", "RevisitSheet"]) {
    assert.match(src(`components/push/${f}.tsx`), /<p className="font-display text-17 text-eye-purple[^"]*\btext-balance\b/, f);
  }
  assert.match(src("app/push/unsubscribe/page.tsx"), /<h1 className="[^"]*\btext-balance\b/);
});

test("알림 설정 스위치는 켜지면 선택색(accent)", () => {
  assert.match(src("app/mypage/notifications/page.tsx"), /on \? "bg-accent" : "bg-lilac-mid\/60"/);
});
