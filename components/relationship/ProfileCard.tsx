"use client";

// components/relationship/ProfileCard.tsx — 파일 허브 프로필 카드.
// target="me": 흰색 카드(내 프사·계정 닉네임). target=관계: 남색 카드(상대 이름·관계), 펼치면 성격·MBTI·명식.
// [수정] → 부모가 ProfileEditModal 오픈. 스펙 §P2 + 목업 p2-hub-v2-profile-products.
import { useState } from "react";
import DollAvatar from "./DollAvatar";
import SajuBoard from "@/components/saju/SajuBoard";
import type { SajuResult } from "@/lib/saju/calc";
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";

interface ProfilePerson {
  displayName: string;
  birthDate: string | null;
  mbti: string | null;
  personality: string | null;
}

interface ProfileCardRel {
  label: string;
  status: RelationshipStatus;
  partner: ProfilePerson | null;
}

export interface ProfileCardProps {
  target: "me" | ProfileCardRel;
  me: { name: string; imageUrl: string | null };
  /** 상대 명식판 — /api/profiles 의 partnerProfileId 항목 saju(생일 없으면 null). me 카드엔 불필요. */
  partnerSaju?: SajuResult | null;
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

export default function ProfileCard({ target, me, partnerSaju, onEdit }: ProfileCardProps) {
  const isMe = target === "me";
  const [expanded, setExpanded] = useState(false);

  if (isMe) {
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

  // 상대 카드 — 접힘(기본)/펼침 토글. 성격·MBTI·명식은 펼쳤을 때만.
  const { label, status, partner } = target;
  const noBirth = !partner?.birthDate;
  return (
    <div
      className="rounded-2xl mt-4 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #2A1F4D 0%, #1F1735 100%)", color: "#fff" }}
    >
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "상대 정보 접기" : "상대 정보 펼치기"}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left active:opacity-90 transition"
          >
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
            <span className="shrink-0 text-white/70 text-[12px] leading-none" aria-hidden>
              {expanded ? "▾" : "▸"}
            </span>
          </button>
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

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
          {/* 성격 */}
          <div>
            <div className="text-[10px] font-bold text-white/55 mb-1">성격</div>
            {partner?.personality ? (
              <p className="text-[12.5px] text-white/90 leading-relaxed whitespace-pre-wrap">
                {partner.personality}
              </p>
            ) : (
              <p className="text-[12.5px] text-white/40">미입력</p>
            )}
          </div>
          {/* MBTI */}
          <div>
            <div className="text-[10px] font-bold text-white/55 mb-1">MBTI</div>
            {partner?.mbti ? (
              <p className="text-[12.5px] text-white/90">{partner.mbti}</p>
            ) : (
              <p className="text-[12.5px] text-white/40">미입력</p>
            )}
          </div>
          {/* 사주 명식 */}
          <div>
            <div className="text-[10px] font-bold text-white/55 mb-2">사주 명식</div>
            {partnerSaju ? (
              <div className="rounded-xl bg-white py-4">
                <SajuBoard saju={partnerSaju} showDetail={false} />
              </div>
            ) : (
              <p className="text-[12.5px] text-white/60 leading-relaxed">
                아직 생일을 안 알려줬어 — 수정에서 추가하면 명식이 보여.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
