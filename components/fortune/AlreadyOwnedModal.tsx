"use client";

// 이미 같은 사주로 본 상품을 다시 사려 할 때 — 보관함 유도 + 재생성(force) 선택.
import { useEffect, useState } from "react";
import Sheet from "@/components/common/Sheet";
import Icon from "@/components/common/Icon";

/** 받침 있으면 '은', 없으면 '는' — 끝이 한글이 아니면(예: '이번달 어떤 일들이?') null */
function topicParticle(word: string): string | null {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return null;
  return (c - 0xac00) % 28 ? "은" : "는";
}

export default function AlreadyOwnedModal({
  label,
  cost,
  onReview,
  onRegenerate,
  onClose,
}: {
  label: string;
  cost: number;
  onReview: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Sheet label="이미 이 사주로 봤어" onClose={onClose} z={80}>
        {/* 제목이 한 번 말하고 글은 다음 할 일만 — 예전엔 제목('이미 이 사주로 봤어')과 첫 줄('…은(는) 이미 봤어')이 같은 말이었고
            맨 아래 '닫기'가 하나 더 있었다(바깥 누르기·앱 끌어내리기로 닫힌다). 디자인 다듬기 '이미 산 것' 창 A1, 운영자 11-21 */}
        <div className="text-center mb-5">
          <p className="font-display text-17 text-eye-purple leading-tight">
            {topicParticle(label) ? `${label}${topicParticle(label)} 이미 봤어` : "이미 이 사주로 봤어"}
          </p>
          <p className="text-13 text-text-light mt-1.5 leading-relaxed">
            같은 사주로 본 게 보관함에 있어.
            <br />
            새로 뽑으면 별 {cost}개가 다시 들어.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={onReview}
            className="btn btn-primary btn-lg"
          >
            보관함에서 보기
          </button>
          <button
            onClick={onRegenerate}
            className="btn btn-text btn-md"
          >
            그래도 새로 뽑기 · <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{cost}
          </button>
        </div>
    </Sheet>
  );
}
