// components/mypage/sajuShared.ts
// 마이 사주 프로필 모달들(SelfSajuEditModal / AcquaintanceListModal)이 공유하는 타입·헬퍼.
// 원래 SajuProfileModal 에 인라인이던 것을 분해하며 3중 복제를 피하려 추출.
import type { SajuResult } from "@/lib/saju/calc";

export interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string | null; // P2: 생일 없는 프로필 가능
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult | null; // birthDate 없으면 서버가 계산 스킵 (null)
}

export const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

// HH:MM → HOUR_BRANCHES 시작 hour (prefill용). null이면 null(시간 모름).
export function birthTimeToBranchHour(t: string | null): number | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  if (h === 23) return 0; // 자시 23-01 → 0
  return h - (h % 2);
}

// 12시진 (자시 23~01 시작). 인덱스 0 = 자시.
const SIJIN = [
  { name: "자시", range: "23~01" },
  { name: "축시", range: "01~03" },
  { name: "인시", range: "03~05" },
  { name: "묘시", range: "05~07" },
  { name: "진시", range: "07~09" },
  { name: "사시", range: "09~11" },
  { name: "오시", range: "11~13" },
  { name: "미시", range: "13~15" },
  { name: "신시", range: "15~17" },
  { name: "유시", range: "17~19" },
  { name: "술시", range: "19~21" },
  { name: "해시", range: "21~23" },
];

// HH:MM → "미시 (13~15시)". null이면 null(시간 모름).
export function birthTimeToSijin(t: string | null): string | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  const s = SIJIN[idx];
  return `${s.name} (${s.range}시)`;
}

// birthDate 없는 프로필은 미리 채울 값이 없음 — 폼을 빈 상태로 시작(undefined).
export function toInitial(p: ProfileItem) {
  return p.birthDate
    ? {
        year: Number(p.birthDate.slice(0, 4)),
        month: Number(p.birthDate.slice(5, 7)),
        day: Number(p.birthDate.slice(8, 10)),
        hour: birthTimeToBranchHour(p.birthTime),
        isLunar: p.isLunarInput,
        isLeapMonth: p.isLeapMonth,
        gender: p.gender,
      }
    : undefined;
}
