"use client";

// components/relationship/ProfileCard.tsx — 파일 허브 프로필 카드.
// target="me": 흰색 카드(내 프사·이름). target=관계: 남색 카드(상대 이름·관계).
// [수정] → 부모가 ProfileEditModal 오픈. 스펙 §P2 + 목업 p2-hub-v2-profile-products.
import DollAvatar from "./DollAvatar";
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";

interface ProfilePerson {
  displayName: string;
  birthDate: string | null;
  mbti: string | null;
}

interface ProfileCardRel {
  label: string;
  status: RelationshipStatus;
  partner: ProfilePerson | null;
}

export interface ProfileCardProps {
  target: "me" | ProfileCardRel;
  me: { name: string; imageUrl: string | null };
  onEdit: () => void;
}

export default function ProfileCard({ target, me, onEdit }: ProfileCardProps) {
  const isMe = target === "me";

  if (isMe) {
    return (
      <div className="rounded-2xl p-4 border bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] mt-4">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0 ring-1 ring-lilac-mid/25 rounded-full">
            <DollAvatar kind="me" imageUrl={me.imageUrl} name={me.name} size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold leading-tight text-eye-purple">나</div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-lilac-deep bg-lilac-soft active:scale-95 transition"
          >
            ✏️ 수정
          </button>
        </div>
      </div>
    );
  }

  // 상대 카드
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
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white active:scale-95 transition"
          style={{ background: "rgba(255,255,255,.14)" }}
        >
          ✏️ 수정
        </button>
      </div>
    </div>
  );
}
