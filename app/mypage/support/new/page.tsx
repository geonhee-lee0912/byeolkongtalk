"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  INQUIRY_CATEGORIES,
  type InquiryCategory,
  INQUIRY_TITLE_MAX,
  INQUIRY_BODY_MIN,
  INQUIRY_BODY_MAX,
} from "@/lib/inquiries";

const CATEGORY_ENTRIES = Object.entries(INQUIRY_CATEGORIES) as [InquiryCategory, string][];

export default function SupportNewPage() {
  const router = useRouter();
  const [category, setCategory] = useState<InquiryCategory>("usage");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleOk = title.trim().length >= 1 && title.trim().length <= INQUIRY_TITLE_MAX;
  const bodyLen = body.trim().length;
  const bodyOk = bodyLen >= INQUIRY_BODY_MIN && bodyLen <= INQUIRY_BODY_MAX;
  const canSubmit = titleOk && bodyOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, title: title.trim(), body: body.trim() }),
    });
    if (res.status === 401) {
      router.replace("/login?next=/mypage/support/new");
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError("문의 전송에 실패했어. 잠시 후 다시 시도해줘.");
      return;
    }
    router.replace("/mypage/support");
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage/support" className="text-[12px] text-text-light/70">
          ‹ 문의 목록
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
        <h1 className="text-[16px] font-bold text-eye-purple">문의하기</h1>

        <div>
          <label className="block text-[12px] font-bold text-eye-purple mb-1.5">분류</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InquiryCategory)}
            className="w-full bg-cream-warm border border-lilac-mid/40 rounded-xl px-3 py-2.5 text-[14px] text-eye-purple"
          >
            {CATEGORY_ENTRIES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-bold text-eye-purple mb-1.5">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, INQUIRY_TITLE_MAX))}
            placeholder="제목을 입력해줘"
            className="w-full bg-cream-warm border border-lilac-mid/40 rounded-xl px-3 py-2.5 text-[14px] text-eye-purple"
          />
        </div>

        <div>
          <label className="block text-[12px] font-bold text-eye-purple mb-1.5">내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, INQUIRY_BODY_MAX))}
            rows={8}
            placeholder="어떤 점이 불편했는지, 무엇이 궁금한지 자세히 적어줘."
            className="w-full bg-cream-warm border border-lilac-mid/40 rounded-xl px-3 py-2.5 text-[14px] text-eye-purple resize-none"
          />
          <div className="text-[11px] text-text-light/60 text-right mt-1">
            {bodyLen} / {INQUIRY_BODY_MAX}
          </div>
        </div>

        {error && <p className="text-[12px] text-rose-500">{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "보내는 중…" : "문의 보내기"}
        </button>
      </div>
    </main>
  );
}
