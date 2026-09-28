"use client";

// components/byeolmaru/CurrentPartner.tsx — 우리 오늘(/byeolmaru/woori) 상단의 "걸어둔 상대" 한 명.
//
// 🔴 PartnerChips(여러 명 칩 + 선택)를 2026-09-24 에 대체했다. 상대가 한 명이 되면서 "고르는" UI 가
//    필요 없어졌다 — 남은 건 **누가 걸려 있는지**와 **바꾸기** 둘뿐이다.
//    근거: prod 상대 등록 142명 중 유료 슬롯 전환 0, dev 포함 구매 이력 0건(= 여러 명을 거는
//    수요가 실측된 적이 없다). 상세는 lib/byeolmaru/watch.ts 머리 주석.
//
// 🔴 0명일 때의 금색 점선 버튼은 그대로 가져왔다 — 비어 있는 게 아니라 "여기 사람을 걸 수 있다"를
//    말하는 자리다(빈 화면과 초대 루프 입구는 다르다).
// 🔴 관계 유형 색은 DOLL_COLORS 의 **첫 색(밝은 쪽)** 만 쓴다. 작은 면적에 그라데이션은 탁해진다.
//    글자는 text-night 다 — DOLL_COLORS 4색 위에 text-cream 은 1.39~2.78:1 로 WCAG AA 미달이었고
//    night(#1F1735)로 바꾸면 5.7~11.4:1 이 된다(PartnerChips 가 실측으로 얻은 값을 그대로 잇는다).
import { DOLL_COLORS, RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";

export interface WatchedPartner {
  id: string;
  name: string;
  status: RelationshipStatus | null;
}

export default function CurrentPartner({
  partner,
  onChange,
}: {
  /** 걸어둔 상대. null 이면 아직 아무도 없다. */
  partner: WatchedPartner | null;
  /** 걸어두기/바꾸기 — 둘 다 같은 모달을 연다(모달이 교체까지 책임진다). */
  onChange: () => void;
}) {
  if (!partner) {
    return (
      <button
        onClick={onChange}
        className="w-full rounded-xl border border-dashed border-gold px-3 py-2.5 text-sm font-medium text-eye-purple/80"
      >
        ＋ 인연 걸어두기
      </button>
    );
  }

  const color = partner.status ? DOLL_COLORS[partner.status][0] : "#B8A8D8";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-lilac-soft bg-white/60 px-3 py-2.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-bold text-eye-purple">{partner.name}</span>
        {partner.status && (
          <span
            className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold text-night"
            style={{ background: color }}
          >
            {RELATIONSHIP_STATUS_LABELS[partner.status]}
          </span>
        )}
      </div>
      {/* 🔴 "바꾸기"지 "지우기"가 아니다 — 교체는 무료고 과거 기록도 남아서, 되돌릴 수 있는 행동이다.
          삭제 전용 버튼을 두면 그 되돌림 가능성이 안 보인다(그리고 이 화면엔 지울 이유가 없다). */}
      <button
        onClick={onChange}
        className="shrink-0 rounded-lg border border-lilac-mid/60 px-2.5 py-1 text-[12px] font-semibold text-lilac-deep transition active:scale-95"
      >
        바꾸기
      </button>
    </div>
  );
}
