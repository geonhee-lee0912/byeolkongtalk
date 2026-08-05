"use client";

// components/relationship/HubSwitcher.tsx — "우리 사이" 파일 허브 상단 스위처.
// [나 앵커(금색/프사)] │ 디바이더 │ [상대 인형들] │ [＋ 추가]. 1:N 상대 전환.
// 선택된 항목엔 링. 스펙 §P2 + 목업 p2-me-switcher.
import DollAvatar from "./DollAvatar";
import type { RelationshipStatus } from "@/lib/relationship/types";

interface HubSwitcherRel {
  id: string;
  label: string;
  status: RelationshipStatus;
}

export interface HubSwitcherProps {
  me: { name: string; imageUrl: string | null };
  relationships: HubSwitcherRel[];
  /** "me" = 나 앵커 선택, 그 외 = 관계 id */
  selectedId: "me" | string;
  onSelect: (sel: "me" | string) => void;
  onAddPerson: () => void;
}

// 아바타 + 이름 한 칸(나·상대 공통). 선택 시 링 강조.
function SwitchItem({
  selected,
  name,
  onClick,
  children,
}: {
  selected: boolean;
  name: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-[3px] shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`rounded-full active:scale-95 transition ${
          selected ? "ring-2 ring-lilac-deep ring-offset-2 ring-offset-cream" : ""
        }`}
      >
        {children}
      </button>
      <span
        className={`text-[9px] max-w-[52px] truncate ${
          selected ? "font-extrabold text-lilac-deep" : "font-bold text-text-light"
        }`}
      >
        {name}
      </span>
    </div>
  );
}

export default function HubSwitcher({
  me,
  relationships,
  selectedId,
  onSelect,
  onAddPerson,
}: HubSwitcherProps) {
  return (
    <div className="flex gap-[7px] items-start overflow-x-auto scrollbar-hover pb-1">
      {/* 나 앵커 */}
      <SwitchItem selected={selectedId === "me"} name="나" onClick={() => onSelect("me")}>
        <DollAvatar kind="me" imageUrl={me.imageUrl} name={me.name} />
      </SwitchItem>

      {/* 디바이더 */}
      <div className="w-px h-9 self-center bg-lilac shrink-0 mx-[3px]" aria-hidden />

      {/* 상대 인형들 */}
      {relationships.map((r) => (
        <SwitchItem
          key={r.id}
          selected={selectedId === r.id}
          name={r.label}
          onClick={() => onSelect(r.id)}
        >
          <DollAvatar kind="partner" status={r.status} />
        </SwitchItem>
      ))}

      {/* 새 사람 추가 */}
      <div className="flex flex-col items-center gap-[3px] shrink-0">
        <button
          type="button"
          onClick={onAddPerson}
          aria-label="새 사람 추가"
          className="w-11 h-11 rounded-full bg-lilac-soft border-[1.5px] border-dashed border-lilac-mid flex items-center justify-center text-[19px] text-lilac-deep active:scale-95 transition"
        >
          ＋
        </button>
        <span className="text-[9px] font-bold text-text-light max-w-[52px] truncate">
          {relationships.length === 0 ? "첫 사람" : "새 사람"}
        </span>
      </div>
    </div>
  );
}
