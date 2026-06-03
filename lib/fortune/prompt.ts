// 운세 리포트용 system message 빌더. 정적(페르소나)/동적(데이터+지시) 분리 — claude.ts streamChat 캐싱 규약과 동일.

import { readFileSync } from "fs";
import { join } from "path";
import type { SajuResult } from "@/lib/saju/calc";
import type { FortuneType } from "./types";

let _persona: string | null = null;
function getFortunePersona(): string {
  if (_persona === null) {
    _persona = readFileSync(
      join(process.cwd(), "data", "persona", "byeolkong_fortune.md"),
      "utf-8"
    );
  }
  return _persona;
}

function sajuBlock(saju: SajuResult): string {
  const p = saju.pillars;
  const elementsLine = Object.entries(saju.elementCount)
    .map(([el, n]) => `${el} ${n}`)
    .join(" / ");
  return [
    `[사주판]`,
    `  - 연주: ${p.year.stem}${p.year.branch}`,
    `  - 월주: ${p.month.stem}${p.month.branch}`,
    `  - 일주: ${p.day.stem}${p.day.branch} ★ 일간 = ${saju.dayStem} (${saju.dayElement})`,
    `  - 시주: ${p.hour.stem}${p.hour.branch}${saju.input.hourKnown ? "" : " — 시간 모름, 참고용"}`,
    `  - 오행 분포: ${elementsLine}`,
    `  - 음양: 양 ${saju.yinYangCount.yang} / 음 ${saju.yinYangCount.yin}`,
    `  - 입력: ${saju.input.inputCalendar === "lunar" ? "음력" : "양력"}${saju.input.isLeapMonth ? " 윤달" : ""} / 성별 ${saju.input.gender}`,
  ].join("\n");
}

const TODAY_KR = () =>
  new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  });

const THIS_MONTH_KR = () =>
  new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Seoul",
  });

interface FortuneInput {
  saju?: SajuResult;
}

const SECTION_GUIDE: Record<FortuneType, string> = {
  daily: [
    `오늘 날짜: ${"{{TODAY}}"}`,
    ``,
    `위 사주판을 가진 사람의 **오늘 하루** 운세 리포트를 써줘. 아래 섹션을 정확히 이 순서·제목으로:`,
    `## 오늘의 흐름  (오늘 전반 기운 한 단락)`,
    `## 마음 · 관계  (감정·사람 관계)`,
    `## 일 · 돈  (일/공부/금전)`,
    `## 별콩이의 한마디  (오늘 실천할 따뜻한 조언 한 가지)`,
  ].join("\n"),
  monthly: [
    `이번 달: ${"{{THIS_MONTH}}"}`,
    ``,
    `위 사주판을 가진 사람의 **이번 한 달** 운세 리포트를 써줘. 아래 섹션을 정확히 이 순서·제목으로:`,
    `## 이번 달 큰 흐름  (이번 달 전반 기운·테마 한 단락)`,
    `## 마음 · 관계  (이번 달 감정·사람 관계 흐름)`,
    `## 일 · 돈  (이번 달 일/공부/금전 흐름)`,
    `## 별콩이의 한마디  (이번 달 챙기면 좋을 따뜻한 조언 한 가지)`,
  ].join("\n"),
  saju_full: [
    `기준 연도: 2026년 (병오년)`,
    ``,
    `위 사주판을 가진 사람의 **2026년 사주 분석** 리포트를 써줘. 타고난 사주를 바탕으로 2026년 한 해 흐름에 초점을 맞춰.`,
    `이건 한 해에 한 번 받는 깊이 있는 프리미엄 리포트야 — 각 섹션을 충분히 깊고 구체적으로 풀어줘. 각 섹션 최소 3~4문장 이상, 월별 흐름 섹션은 가장 길고 구체적으로. 짧게 끊지 말 것.`,
    `아래 섹션을 정확히 이 순서·제목으로:`,
    `## 타고난 기질  (일간·오행 기반 성격 — 2026년을 어떻게 살아갈 사람인지로 연결)`,
    `## 2026년 큰 흐름  (병오년 기운이 이 사주에 주는 한 해 전반 테마)`,
    `## 마음 · 관계  (2026년 사람·인연·감정 흐름)`,
    `## 일 · 재물  (2026년 적성·일·금전 흐름)`,
    `## 건강 · 컨디션  (2026년 체력·건강·생활 리듬에서 챙길 점)`,
    `## 2026년 월별 흐름  (1월부터 12월까지 시기별 흐름·조언 — 가장 길고 구체적으로)`,
    `## 별콩이의 한마디  (2026년 한 해 챙기면 좋을 따뜻한 조언)`,
  ].join("\n"),
  // Phase 1 미사용 (tarot/compat 는 추후 확장)
  tarot_oneshot: `타로 한 장 리딩 리포트를 써줘.`,
  compat: `두 사람 궁합 리포트를 써줘.`,
};

export function buildFortuneSystem(
  type: FortuneType,
  input: FortuneInput
): { staticPart: string; dynamicPart: string } {
  const parts: string[] = [];
  if (input.saju) parts.push(sajuBlock(input.saju));
  parts.push("");
  parts.push(
    SECTION_GUIDE[type]
      .replace("{{TODAY}}", TODAY_KR())
      .replace("{{THIS_MONTH}}", THIS_MONTH_KR())
  );

  return {
    staticPart: getFortunePersona(),
    dynamicPart: parts.join("\n"),
  };
}

/** 리포트 생성 트리거용 첫 user 메시지 (내용은 형식적 — 실제 지시는 system) */
export const FORTUNE_KICKOFF = "내 운세 리포트 써줘.";
