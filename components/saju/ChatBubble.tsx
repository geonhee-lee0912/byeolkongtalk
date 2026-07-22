"use client";

import Image from "next/image";
import { splitEmphasis } from "@/lib/text-emphasis";

export interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  /** 같은 턴의 첫 assistant 버블이면 아바타 + 이름 표시 */
  isFirstInTurn?: boolean;
  /** 스트리밍 중인 응답 (마지막 버블) — 진행 dots 표시용 */
  streaming?: boolean;
}

export default function ChatBubble({
  role,
  content,
  isFirstInTurn,
  streaming,
}: ChatBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[82%] bg-lilac-deep text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="flex-1 max-w-[92%]">
        {isFirstInTurn && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-cream-warm overflow-hidden flex items-center justify-center border border-lilac-mid/40">
              <Image
                src="/profile.png"
                alt="별콩이"
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[12px] font-bold text-eye-purple">별콩이</span>
          </div>
        )}
        <div className="bg-cream-warm text-eye-purple rounded-2xl rounded-tl-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap border border-lilac-mid/20">
          {splitEmphasis(content).map((s, i) =>
            s.bold ? <strong key={i}>{s.text}</strong> : s.text
          )}
          {streaming && content.length === 0 && (
            <span className="inline-flex gap-0.5 items-center text-text-light/60">
              <span className="animate-pulse">·</span>
              <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>
                ·
              </span>
              <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>
                ·
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
