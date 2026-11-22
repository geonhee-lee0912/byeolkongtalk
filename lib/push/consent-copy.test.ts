// 계약: 광고 동의를 받는 세 곳은 쓰는 정보·목적·보관·거부권 두 줄을 같이 보인다(운영자 11-22 알림-5-5A — 글자 그대로).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const CHECK = "components/push/AdConsentCheck.tsx";

test("두 줄은 승인된 글 그대로", () => {
  const s = src(CHECK);
  assert.ok(s.includes('"푸시 토큰 · 생년월일·태어난 시·성별 · 구독 상태 · 앱을 연 시각 · 최근 상담 시각과 종료 여부"'));
  assert.ok(s.includes(">쓰는 정보:</span> {AD_CONSENT_USED_INFO}"));
  assert.ok(
    s.includes(
      '"광고 알림을 보내려고 써. 동의를 끄거나 탈퇴하면 광고에는 더 안 써(동의 기록은 탈퇴 때까지 보관). 동의 안 해도 서비스는 그대로 쓸 수 있어"',
    ),
  );
});

test("체크칸·광고만 묻는 시트·알림 설정이 모두 두 줄을 그린다", () => {
  for (const f of [CHECK, "components/push/PushAskSheet.tsx", "app/mypage/notifications/page.tsx"]) {
    assert.match(src(f), /<AdConsentUse \/>/, f);
  }
});
