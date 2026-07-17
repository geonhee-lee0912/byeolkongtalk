// qa/cases/saju.ts — 사주 4상품 케이스. 파일럿은 today_letters만 활성.
import type { Case } from "../types.ts";
import { buildSharedCases } from "./shared.ts";

export function sajuCases(): Case[] {
  const cases: Case[] = [];

  // today_letters (파일럿)
  cases.push(
    ...buildSharedCases(
      { kind: "saju", sajuProduct: "today_letters" },
      "진로·방향이 고민이야",
      "saju.today_letters",
      { mustEnd: true, expectSensitiveHeader: false }
    )
  );

  // nature
  cases.push(
    ...buildSharedCases(
      { kind: "saju", sajuProduct: "nature" },
      "그냥 별콩이한테 털어놓고 싶어",
      "saju.nature",
      { mustEnd: true, expectSensitiveHeader: false }
    )
  );

  // choice (감정은 choice 노출 대상 중 하나여야 함)
  cases.push(
    ...buildSharedCases(
      { kind: "saju", sajuProduct: "choice" },
      "어떤 선택이 맞을지 모르겠어",
      "saju.choice",
      { mustEnd: true, expectSensitiveHeader: false }
    )
  );
  // choice 특화: A/B 선택지 비교
  cases.push({
    id: "saju.choice.ab_compare",
    product: { kind: "saju", sajuProduct: "choice" },
    emotion: "어떤 선택이 맞을지 모르겠어",
    seed: {},
    seedConcern: "지금 회사에 남을지, 이직할지 둘 중에 고민이야",
    userPersona: "두 선택지를 두고 어느 쪽이 나은지 비교받고 싶은 사용자",
    inputStyle: { tone: "진지한 반말", habits: [] },
    maxTurns: 4,
    expects: { mustEnd: true, expectSensitiveHeader: false },
  });

  // good_days
  cases.push(
    ...buildSharedCases(
      { kind: "saju", sajuProduct: "good_days" },
      "어떤 선택이 맞을지 모르겠어",
      "saju.good_days",
      { mustEnd: true, expectSensitiveHeader: false }
    )
  );
  // good_days 특화: 날짜 추천
  cases.push({
    id: "saju.good_days.date_pick",
    product: { kind: "saju", sajuProduct: "good_days" },
    emotion: "어떤 선택이 맞을지 모르겠어",
    seed: {},
    seedConcern: "이번 달에 계약하기 좋은 날이 언제야?",
    userPersona: "구체적인 좋은 날짜를 추천받고 싶은 사용자",
    inputStyle: { tone: "실용적인 반말", habits: [] },
    maxTurns: 4,
    expects: { mustEnd: true, expectSensitiveHeader: false },
  });

  return cases;
}
