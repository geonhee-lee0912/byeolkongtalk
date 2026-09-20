// lib/admin/format.ts — 지표 값의 표시 포맷. 순수(React·DB import 0).
//
// 왜 한 곳인가: 화면마다 toFixed 자릿수와 천단위 구분자를 따로 쓰면 같은 지표가 화면마다 다른
// 숫자로 보인다. 어드민의 존재 이유가 "두 화면 숫자를 나란히 놓고 읽는 것"이라 이게 치명적이다.
import type { MetricUnit } from "@/lib/admin-metrics";

// 🔴 로케일 고정 — 서버(Vercel, UTC/en-US)와 클라이언트가 다른 구분자를 쓰면 하이드레이션 불일치가 난다.
// export 하는 이유: ko-KR 과 en-US 는 천단위 구분자가 동일해(둘 다 "1,000") 출력 문자열만으로는
// "로케일이 고정됐다"를 증명 못 한다. 계약 테스트가 이 상수 값 자체를 잠근다.
export const LOCALE = "ko-KR";

export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "won":
      return `${Math.round(value).toLocaleString(LOCALE)}원`;
    case "percent":
      // 🔴 `value.toFixed(1)` 로 직접 반올림하면 67.55 가 "67.5%" 로 잘못 나온다 — 67.55 는
      // 배정도 부동소수로 67.549999999999997... 에 저장되기 때문(toFixed 의 알려진 결함).
      // ×10 → 반올림 → ÷10 을 먼저 거치면 이 경계값들이 정확한 표현으로 떨어진다.
      return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
    case "count":
      return Math.round(value).toLocaleString(LOCALE);
    case "ratio":
      // 🔴 percent 와 같은 결함, 같은 클래스 — `value.toFixed(2)` 를 직접 쓰면 0.615 가
      // 부동소수 표현 오차(0.6149999999999999...)로 "0.61" 이 된다. ×100 → 반올림 → ÷100 을
      // 먼저 거쳐 이 경계값들이 정확한 표현으로 떨어지게 한다.
      return (Math.round(value * 100) / 100).toFixed(2);
  }
}

/**
 * 부호를 항상 드러내는 금액 — 기여(매출−광고비−원가)는 음수가 기본값이다.
 * 하이픈(-)이 아니라 U+2212 MINUS SIGN 을 쓴다: 숫자 폭과 맞아 표가 어긋나지 않는다.
 */
export function formatSignedWon(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "+";
  return `${sign}${Math.abs(rounded).toLocaleString(LOCALE)}원`;
}
