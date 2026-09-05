// lib/byeolmaru/branch-animal.ts — 일지(지지) → 십이지 캐릭터(⑦). 순수.
// 그날 일진 간지 2글자("기축")의 지지(2번째 글자, "축")로 조회 → 12일 순환.
// 에셋 = public/byeolmaru/branches/{code}.png (투명 chibi, byeoljari 신수 스타일).

export interface BranchAnimal {
  /** 로마자 코드 = 파일명 */
  code: string;
  /** 한글 동물 이름(alt·상세 라벨) */
  animal: string;
  /** public 기준 에셋 경로 */
  assetSrc: string;
}

const BRANCH: Record<string, { code: string; animal: string }> = {
  자: { code: "ja", animal: "쥐" },
  축: { code: "chuk", animal: "소" },
  인: { code: "in", animal: "범" },
  묘: { code: "myo", animal: "토끼" },
  진: { code: "jin", animal: "용" },
  사: { code: "sa", animal: "뱀" },
  오: { code: "o", animal: "말" },
  미: { code: "mi", animal: "양" },
  신: { code: "sin", animal: "원숭이" },
  유: { code: "yu", animal: "닭" },
  술: { code: "sul", animal: "개" },
  해: { code: "hae", animal: "돼지" },
};

/**
 * 간지 문자열의 지지(2번째 글자)로 십이지 캐릭터를 찾는다.
 * 지지가 12지 밖이거나 문자열이 짧으면 null(호출측이 캐릭터 없이 렌더 — 크래시 방지).
 */
export function branchAnimal(ganji: string): BranchAnimal | null {
  const branch = ganji && ganji.length >= 2 ? ganji[1] : undefined;
  const e = branch ? BRANCH[branch] : undefined;
  if (!e) return null;
  return { code: e.code, animal: e.animal, assetSrc: `/byeolmaru/branches/${e.code}.png` };
}
