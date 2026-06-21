// components/admin/CopyPromptButton.tsx
"use client";
import { useState } from "react";

type Props = {
  message: string;
  route: string | null;
  stack: string | null;
  context: Record<string, unknown> | null;
  source: string;
  level: string;
};

export function CopyPromptButton({ message, route, stack, context, source, level }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const prompt = `프로덕션 에러를 수정해줘.

- 메시지: ${message}
- 위치(route): ${route ?? "(없음)"}
- source: ${source} / level: ${level}

스택:
${stack ?? "(스택 없음)"}

context:
${context ? JSON.stringify(context, null, 2) : "(없음)"}

이 에러의 원인을 코드베이스에서 찾아 수정하고, 재발 방지 방법을 알려줘.`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("클립보드 복사 실패");
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="bg-gold/80 hover:bg-gold text-night text-xs px-3 py-1.5 rounded font-semibold transition-colors"
    >
      {copied ? "복사됨!" : "Claude Code 프롬프트 복사"}
    </button>
  );
}
