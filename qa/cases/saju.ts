// qa/cases/saju.ts — 사주 4상품 케이스. 파일럿은 today_letters만 활성.
import type { Case } from "../types.ts";
import { buildSharedCases } from "./shared.ts";

export function sajuCases(): Case[] {
  const cases: Case[] = [];

  // today_letters (파일럿)
  cases.push(
    ...buildSharedCases(
      { kind: "saju", sajuProduct: "today_letters" },
      "내 앞날의 방향이 궁금해",
      "saju.today_letters",
      { mustEnd: true, expectSensitiveHeader: false }
    )
  );

  return cases;
}
