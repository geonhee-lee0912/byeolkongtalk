"use client";

// components/relationship/ProfileCard.tsx — 파일 허브 프로필 카드(요약 행만).
// target="me": 흰색 카드(내 프사·계정 닉네임). target=관계: 남색 카드(상대 이름·관계).
// 상세(사주·MBTI·성격)는 카드 밖 ProfileDetails 가 담당(나=항상, 상대=아래 버튼으로 펼침).
// [수정] → 부모가 ProfileEditModal 오픈. 스펙 §P2.
import DollAvatar from "./DollAvatar";
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";

interface ProfileCardRel {
  label: string;
  status: RelationshipStatus;
  partner: { birthDate: string | null } | null;
}

export interface ProfileCardProps {
  target: "me" | ProfileCardRel;
  me: { name: string; imageUrl: string | null };
  onEdit: () => void;
}

// 공용 연필 아이콘(currentColor) — 스레드 headerCard 와 동일 path.
function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function ProfileCard({ target, me, onEdit }: ProfileCardProps) {
  if (target === "me") {
    return (
      <div className="rounded-2xl p-4 border bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] mt-4">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0 ring-1 ring-lilac-mid/25 rounded-full">
            <DollAvatar kind="me" imageUrl={me.imageUrl} name={me.name} size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold leading-tight text-eye-purple truncate">
              {me.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white bg-lilac-deep active:scale-95 transition"
          >
            <PencilIcon />
            수정
          </button>
        </div>
      </div>
    );
  }

  // 상대 카드 — 이름·관계·수정 (요약 행). 상세 펼침은 카드 아래 버튼(page.tsx).
  const { label, status, partner } = target;
  const noBirth = !partner?.birthDate;
  return (
    <div
      className="rounded-2xl p-4 mt-4"
      style={{ background: "linear-gradient(135deg, #2A1F4D 0%, #1F1735 100%)", color: "#fff" }}
    >
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 ring-1 ring-white/25 rounded-full">
          <DollAvatar kind="partner" status={status} size={40} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold leading-tight truncate">
            {label} <span style={{ color: "#F4A6C0" }} aria-hidden>❤</span>
          </div>
          <div className="text-[10px] mt-0.5 opacity-80 leading-snug">
            {RELATIONSHIP_STATUS_LABELS[status]}
            {noBirth && " · 생일 추가하면 궁합 ›"}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white bg-white/20 active:scale-95 transition"
        >
          <PencilIcon />
          수정
        </button>
      </div>
    </div>
  );
}
