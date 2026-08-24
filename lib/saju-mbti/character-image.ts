import { ALL_CODES } from "./codes.ts";

// 16유형 캐릭터 이미지 경로. 파일은 ALL_CODES 인덱스(0~15).webp 로 저장(ASCII, URL 안전).
export function characterImage(code: string): string | null {
  const i = ALL_CODES.indexOf(code);
  return i < 0 ? null : `/saju-mbti/characters/${i}.webp`;
}
