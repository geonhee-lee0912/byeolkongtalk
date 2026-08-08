import { fortuneTypeFromTag } from "@/lib/fortune/types";

export type ReadingCategory = "tarot" | "fortune" | "sim" | "relationship";

/** 보관함 종목 분류. 운세(타로맛 포함)는 emotion_tag(fortuneTypeFromTag) 최우선, 타로/시뮬은 consultationType, 나머지 사주는 fortune 로. */
export function readingCategory(r: {
  consultationType?: string | null;
  emotionTag?: string | null;
}): ReadingCategory {
  if (fortuneTypeFromTag(r.emotionTag ?? null)) return "fortune"; // 운세(타로맛 포함) 최우선
  if (r.consultationType === "tarot") return "tarot";
  if (r.consultationType === "relationship_sim") return "sim";
  if (r.consultationType === "relationship") return "relationship";
  return "fortune"; // 사주 상담·리포트
}
