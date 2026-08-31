// 대운(10년) → 인생 국면 테마. 결정론(십신 계산) — LLM 미경유.
// 일간(dayStem) 기준 대운 천간(daeunStem)의 십신을 5개 인생 테마로 묶는다.
// 대운 표(DaeunTable)에서 "이 10년이 무슨 국면인가"를 한눈에 보여주는 데 쓴다.
//
// 관계용 라벨(pairing.ts TEN_GOD_LABEL)은 "두 사람 관계"를 말하므로 여기 쓰지 않는다 —
// 대운은 "내 인생의 한 시기"라 인생 국면 프레임의 별도 라벨을 둔다.

import { tenGod, type TenGod } from "@/lib/saju/pairing";

export type DaeunThemeKey = "비겁" | "식상" | "재성" | "관성" | "인성";

export interface DaeunTheme {
  key: DaeunThemeKey;
  emoji: string;
  label: string; // "결실을 거두는 때"
  desc: string; // 테마 기본 한 줄(개인화 LLM 줄이 없을 때 대체로 노출)
}

// 십신 10 → 5 국면 버킷
const BUCKET: Record<TenGod, DaeunThemeKey> = {
  비견: "비겁", 겁재: "비겁",
  식신: "식상", 상관: "식상",
  편재: "재성", 정재: "재성",
  편관: "관성", 정관: "관성",
  편인: "인성", 정인: "인성",
};

// 별콩 톤 — 단정 예언 금지, "~흐름" 가능성 화법.
const THEME: Record<DaeunThemeKey, DaeunTheme> = {
  비겁: { key: "비겁", emoji: "🌱", label: "나를 세우는 때", desc: "자기 색이 또렷해지고, 사람들과 부대끼며 나를 키우는 흐름" },
  식상: { key: "식상", emoji: "✨", label: "재능이 트이는 때", desc: "표현하고 만들고 싶은 마음이 커지는, 끼와 활동의 흐름" },
  재성: { key: "재성", emoji: "🌾", label: "결실을 거두는 때", desc: "현실 감각과 성과, 재물의 기회가 도드라지는 흐름" },
  관성: { key: "관성", emoji: "🏛️", label: "자리를 잡는 때", desc: "책임과 역할이 무거워지며 자리가 단단해지는 흐름" },
  인성: { key: "인성", emoji: "📖", label: "배우고 채우는 때", desc: "공부·문서·안정처럼 나를 안으로 채우는 흐름" },
};

/**
 * 일간(한글 천간) 기준 대운 천간(한글)의 십신 테마.
 * 알 수 없는 천간(비정상 입력·legacy)은 null → 호출부에서 테마 생략.
 */
export function daeunTheme(dayStem: string, daeunStem: string): DaeunTheme | null {
  try {
    return THEME[BUCKET[tenGod(dayStem, daeunStem)]];
  } catch {
    return null;
  }
}
