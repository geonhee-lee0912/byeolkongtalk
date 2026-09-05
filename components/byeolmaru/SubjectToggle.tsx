"use client";

interface Partner {
  id: string;
  name: string;
}

// 칩 행: 나(항상) · 담은 상대들 · ＋. 활성 스타일은 배타 삼항으로만 결정한다 —
// CalendarGrid 의 ring 색 충돌 교훈과 동일하게, active/inactive 클래스를 겹쳐 붙이면
// 승자가 빌드 스캔 순서로 갈린다.
export default function SubjectToggle({
  partners,
  selected,
  onSelect,
  onAdd,
}: {
  partners: Partner[];
  selected: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const chip = (active: boolean) =>
    active ? "bg-lilac-deep text-cream font-bold" : "border border-lilac-mid text-text-light";

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="캘린더 대상">
      <button
        role="tab"
        aria-selected={selected === "me"}
        onClick={() => onSelect("me")}
        className={`rounded-full px-3 py-1 text-sm ${chip(selected === "me")}`}
      >
        나
      </button>
      {partners.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={selected === p.id}
          onClick={() => onSelect(p.id)}
          className={`rounded-full px-3 py-1 text-sm ${chip(selected === p.id)}`}
        >
          {p.name}
        </button>
      ))}
      <button
        onClick={onAdd}
        aria-label="상대 걸어두기"
        className="rounded-full border border-dashed border-lilac-mid px-3 py-1 text-sm text-text-light"
      >
        ＋
      </button>
    </div>
  );
}
