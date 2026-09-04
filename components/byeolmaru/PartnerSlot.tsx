"use client";

import Link from "next/link";
import { trackUiEvent } from "@/lib/analytics/ui-events";

// /relationship 허브가 상대 목록·대화·시뮬 진입을 이미 갖고 있어 여기서 다시 구현하지 않는다.
// 시뮬(`/relationship/sim?rel=<id>`)은 상대를 먼저 골라야 열리고, 그 선택 UI 는 허브에만 있다.
// 버튼을 대화용/시뮬용 둘로 나누면 상대 미등록 유저(이 카드의 주 타겟)에게는 어느 쪽을 눌러도
// 같은 콜드스타트 화면으로 떨어지는데, 그 화면엔 시뮬 언급이 아예 없어 "시뮬 버튼"이 헛약속이
// 된다 — 그래서 링크 하나로 모으고 카피에서 대화·시뮬 둘 다 가능함을 밝힌다.
export default function PartnerSlot() {
  return (
    <section className="rounded-2xl bg-cream-warm p-4">
      <h2 className="mb-1 font-display text-base text-eye-purple">그 사람과 나</h2>
      <p className="mb-3 text-sm text-text-light">
        상대를 걸어두면 둘 사이 흐름을 보고, 대화도 연애 시뮬도 해볼 수 있어.
      </p>
      <Link
        href="/relationship"
        onClick={() => trackUiEvent("byeolmaru_slot_clicked")}
        className="inline-block rounded-xl bg-lilac-deep px-4 py-2 text-sm text-cream"
      >
        상대 등록하러 가기
      </Link>
    </section>
  );
}
