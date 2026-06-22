"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INQUIRY_CATEGORIES,
  INQUIRY_CATEGORY_ICON,
  type InquiryCategory,
} from "@/lib/inquiries";

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

const PAGE_SIZE = 5;

export default function SupportListPage() {
  const [items, setItems] = useState<InquiryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/inquiries", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (d?.inquiries) setItems(d.inquiries as InquiryListItem[]);
      setLoading(false);
    })();
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedItems = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const goPage = (n: number) => {
    setPage(Math.max(0, Math.min(totalPages - 1, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
        {/* 빈 상태에선 목록 안 "첫 문의 작성하기" 버튼과 중복 → 숨김 */}
        {!loading && items.length > 0 && (
          <Link
            href="/mypage/support/new"
            className="px-3 py-1.5 rounded-xl bg-lilac-deep text-white font-bold text-[12px]"
          >
            문의하기
          </Link>
        )}
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
          <>
          <div className="flex flex-col gap-2">
            {pagedItems.map((it) => {
              const unread = it.status === "answered" && !it.read_at;
              return (
                <Link
                  key={it.id}
                  href={`/mypage/support/${it.id}`}
                  className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] p-3 flex items-center gap-3"
                >
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-lilac-soft flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                      <path d={INQUIRY_CATEGORY_ICON[it.category]} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-eye-purple flex items-center gap-1.5">
                      <span className="truncate">{it.title}</span>
                      {unread && (
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-lilac-deep"
                          aria-label="새 답변"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5 truncate">
                      {INQUIRY_CATEGORIES[it.category]} · {fmtDate(it.created_at)}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => goPage(safePage - 1)}
                disabled={safePage === 0}
                aria-label="이전"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goPage(i)}
                  aria-label={`${i + 1}페이지`}
                  className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                    i === safePage
                      ? "bg-lilac-deep text-white"
                      : "text-text-light/70 hover:bg-lilac-soft/50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => goPage(safePage + 1)}
                disabled={safePage === totalPages - 1}
                aria-label="다음"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </main>
  );
}
