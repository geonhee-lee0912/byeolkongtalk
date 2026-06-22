"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "@/lib/inquiries";

interface InquiryListItem {
  id: string;
  category: InquiryCategory;
  title: string;
  status: "open" | "answered";
  answered_at: string | null;
  read_at: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}`;
}

export default function SupportListPage() {
  const [items, setItems] = useState<InquiryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/inquiries", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (d?.inquiries) setItems(d.inquiries as InquiryListItem[]);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
        <Link
          href="/mypage/support/new"
          className="px-3 py-1.5 rounded-xl bg-lilac-deep text-white font-bold text-[12px]"
        >
          문의하기
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5">
        <h1 className="text-[16px] font-bold text-eye-purple mb-3">고객센터 / 문의</h1>
        {loading ? (
          <p className="text-text-light text-[13px] text-center py-8">잠시만…</p>
        ) : items.length === 0 ? (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-8 text-center">
            <p className="text-[13px] text-text-light/70 mb-4">
              아직 보낸 문의가 없어. 불편한 점이나 궁금한 게 있으면 별콩이에게 알려줘.
            </p>
            <Link
              href="/mypage/support/new"
              className="inline-block px-4 py-2.5 rounded-xl bg-lilac-deep text-white font-bold text-[13px]"
            >
              첫 문의 작성하기
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => {
              const unread = it.status === "answered" && !it.read_at;
              return (
                <Link
                  key={it.id}
                  href={`/mypage/support/${it.id}`}
                  className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-lilac-deep font-bold">
                        {INQUIRY_CATEGORIES[it.category]}
                      </span>
                      {unread && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-rose-500"
                          aria-label="새 답변"
                        />
                      )}
                    </div>
                    <div className="text-[14px] font-bold text-eye-purple truncate mt-0.5">
                      {it.title}
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {fmtDate(it.created_at)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg ${
                      it.status === "answered"
                        ? "bg-lilac-soft text-lilac-deep"
                        : "bg-cream text-text-light/70"
                    }`}
                  >
                    {it.status === "answered" ? "답변 완료" : "답변 대기"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
