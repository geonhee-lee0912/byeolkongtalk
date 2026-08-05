"use client";

// components/relationship/ProfileCard.tsx — 파일 허브 프로필 카드.
// target="me": 금색 카드(내 사주·MBTI = 궁합·시뮬 재료). target=관계: 남색 카드(상대 이름·관계·기록칩).
// [편집/수정] → 부모가 ProfileEditModal 오픈. 스펙 §P2 + 목업 p2-hub-v2-profile-products.
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
  self: { birthDate: string | null; mbti: string | null } | null;
  me: { name: string; imageUrl: string | null };
  /** 상대 카드 전용 — 이 관계 스레드의 유저 발화 턴 수. null이면 칩 생략. */
  userTurns?: number | null;
  onEdit: () => void;
}

function Chip({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <span
      className="rounded-[7px] px-2 py-[3px] text-[9px] font-bold"
      style={dark ? { background: "rgba(255,255,255,.14)" } : { background: "rgba(74,58,16,.13)" }}
    >
      {children}
    </span>
  );
}

export default function ProfileCard({ target, self, me, userTurns, onEdit }: ProfileCardProps) {
  const isMe = target === "me";

  if (isMe) {
    const sajuChip = self?.birthDate ? "사주 ✓" : "생일 미입력";
    const mbtiChip = self?.mbti ? `MBTI ${self.mbti}` : "MBTI 미입력";
    return (
      <div
        className="rounded-2xl px-3.5 py-3 mt-4"
        style={{ background: "linear-gradient(135deg, #F2D78A 0%, #E8C26A 100%)", color: "#4a3a10" }}
      >
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 ring-1 ring-[#4a3a10]/15 rounded-full">
            <DollAvatar kind="me" imageUrl={me.imageUrl} name={me.name} size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold leading-tight">나</div>
            <div className="text-[10px] mt-0.5 opacity-80 leading-snug">
              궁합·시뮬이 이 정보로 정확해져
            </div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold active:scale-95 transition"
            style={{ background: "rgba(74,58,16,.13)" }}
          >
            ✏️ 편집
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Chip dark={false}>{sajuChip}</Chip>
          <Chip dark={false}>{mbtiChip}</Chip>
        </div>
      </div>
    );
  }

  // 상대 카드
  const { label, status, partner } = target;
  const noBirth = !partner?.birthDate;
  const mbtiChip = partner?.mbti ? `MBTI ${partner.mbti}` : "MBTI 미입력";
  return (
    <div
      className="rounded-2xl px-3.5 py-3 mt-4"
      style={{ background: "linear-gradient(135deg, #2A1F4D 0%, #1F1735 100%)", color: "#fff" }}
    >
      <div className="flex items-start gap-2.5">
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
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {userTurns != null && <Chip dark>대화 {userTurns}턴</Chip>}
        <Chip dark>{mbtiChip}</Chip>
      </div>
    </div>
  );
}
