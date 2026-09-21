"use client";

// components/byeolmaru/PartnerChips.tsx — 우리 오늘(/byeolmaru/woori) 상대 칩.
// 🔴 원래는 허브 달력 판 상단 칩이었다(스펙 §8). 2026-09-21 에 허브 달력을 1인칭 전용으로
//    정리하면서 이 칩 행이 우리 오늘 화면으로 내려왔고, 거기서 쓰던 SubjectToggle 을 대체했다
//    — 같은 역할의 컴포넌트가 둘일 이유가 없고, 이쪽이 ①관계 유형 색(DOLL_COLORS) ②0명일 때
//    금색 점선 "＋ 인연 걸어두기"(비어 있는 게 아니라 "여기 사람을 걸 수 있다" = 초대 루프 입구)
//    ③아래 대비 수정까지 갖고 있다.
// 🔴 활성 스타일은 배타 삼항으로만 결정한다 — active/inactive 클래스를 겹쳐 붙이면 승자가 빌드
//    스캔 순서로 갈린다(CalendarGrid 가 같은 이유로 같은 규율을 쓴다).
// 🔴 활성 칩 텍스트는 text-cream 이 아니라 text-night 다 — DOLL_COLORS 4색(밝은 파스텔)과
//    bg-lilac-deep 전부 text-cream(#FAF6F0) 대비로는 WCAG AA(4.5:1) 미달이었다
//    (실측 1.39~2.78:1 — night(#1F1735)로 바꾸면 전부 5.7~11.4:1 로 통과. 계산 근거는 구현 보고 참조).
//    이미 이 저장소에 bg-gold text-night 조합(밝은 배경+어두운 글자)이 여러 곳에 쓰인 패턴이라
//    새 색을 만들지 않고 기존 토큰만 바꿔 맞췄다.
import { DOLL_COLORS, type RelationshipStatus } from "@/lib/relationship/types";

export interface PartnerChip {
  id: string;
  name: string;
  status: RelationshipStatus | null;
}

export default function PartnerChips({
  partners,
  selected,
  onSelect,
  onAdd,
}: {
  partners: PartnerChip[];
  selected: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  if (partners.length === 0) {
    return (
      <button
        onClick={onAdd}
        className="w-full rounded-xl border border-dashed border-gold px-3 py-2 text-sm font-medium text-eye-purple/80"
      >
        ＋ 인연 걸어두기
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="우리 오늘 상대">
      {/* 🔴 "나" 칩이 없다(2026-09-21) — 이 칩 행이 허브에서 우리 오늘 화면으로 내려오면서
          한 화면이 나·우리를 번갈아 가리키는 구조가 없어졌다. 이 화면의 주체는 항상 둘 사이라
          "나"는 고를 대상이 아니고, 골라도 갈 곳이 안내 문구뿐이었다. */}
      {partners.map((p) => {
        const active = selected === p.id;
        // DOLL_COLORS 는 [밝은, 진한] 두 색이다 — 칩엔 첫 색(밝은)만 쓴다(작은 면적에 그라데이션은 탁해진다).
        const color = p.status ? DOLL_COLORS[p.status][0] : "#B8A8D8";
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.id)}
            className={`rounded-full px-3 py-1 text-sm ${active ? "font-bold text-night" : "border text-text-light"}`}
            style={active ? { background: color } : { borderColor: color, color: "#7A6BA0" }}
          >
            {p.name}
          </button>
        );
      })}
      <button
        onClick={onAdd}
        aria-label="인연 걸어두기"
        className="rounded-full border border-dashed border-gold px-3 py-1 text-sm text-eye-purple/70"
      >
        ＋
      </button>
    </div>
  );
}
