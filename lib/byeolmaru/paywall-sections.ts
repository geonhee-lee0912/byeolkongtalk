// lib/byeolmaru/paywall-sections.ts — C안 절단선(스펙 §5-1) 아래 "이름만" 보여줄 유료 섹션 목록.
// 🔴 하드코딩 금지 — 리포트 구성이 바뀌면 칩도 같이 움직여야 한다(칩은 "무엇이 더 있는지"에 대한
//    약속이라, 낡으면 그 자리에서 거짓말이 된다). 원본은 DAILY_SECTIONS · CARD_REPORT_BLOCKS.
import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";
import { CARD_REPORT_BLOCKS } from "./card-report.ts";

/** 유료 리포트 목표 분량(스펙 §6-2 고정값). 문장 수에서 파생시키지 말 것. */
export const SAJU_PAID_CHARS = 1800;
export const TAROT_PAID_CHARS = 1800;

/** 오늘 사주 유료가 더 주는 것. DailyReportCard 가 그리는 순서 그대로 —
 *  고정 블록(총평·종합운·럭키·도입)은 DAILY_SECTIONS 에 없어 여기서 적고, 도메인 5개는 파생한다. */
export const SAJU_PAID_SECTIONS: readonly string[] = [
  "한 줄 총평",
  "종합운",
  "럭키 3종",
  "들어온 두 글자",
  ...DAILY_SECTIONS.map((s) => s.title),
  "균형",
  "별콩이의 한마디",
];

/** 오늘 타로 유료 7블록. 제목은 CARD_REPORT_BLOCKS 가 정본. */
export const TAROT_PAID_SECTIONS: readonly string[] = CARD_REPORT_BLOCKS.map((b) => b.title);
