// lib/fortune/response-format.ts
// 운세 리포트 종류 → OpenAI 구조화 출력 스키마 매핑. 활성 JSON 리포트 4종만 반환하고,
// good_days(마크다운)·무료 daily(nano)·비활성 tarot 은 undefined(구조화 출력 미적용).
// 🔴 tarot 리포트 재활성(FORTUNE_CONFIG active:true) 시 여기에 tarot 스키마 추가 필수.
import type { FortuneType } from "./types.ts";
import { SAJU_FULL_REPORT_SCHEMA } from "./saju-full-report.ts";
import { MONTHLY_REPORT_SCHEMA } from "./monthly-report.ts";
import { COMPAT_REPORT_SCHEMA, COMPAT_LOVE_REPORT_SCHEMA } from "./compat-report.ts";

export function fortuneResponseFormat(
  type: FortuneType
): { name: string; schema: object } | undefined {
  switch (type) {
    case "saju_full":
      return { name: "saju_full_report", schema: SAJU_FULL_REPORT_SCHEMA };
    case "monthly":
      return { name: "monthly_report", schema: MONTHLY_REPORT_SCHEMA };
    case "compat":
      return { name: "compat_report", schema: COMPAT_LOVE_REPORT_SCHEMA };
    case "compat_social":
      return { name: "compat_report", schema: COMPAT_REPORT_SCHEMA };
    default:
      return undefined;
  }
}
