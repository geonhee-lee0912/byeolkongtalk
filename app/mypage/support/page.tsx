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

// 카테고리별 리딩 타일 아이콘 (MDI single-path)
const CATEGORY_ICON: Record<InquiryCategory, string> = {
  bug: "M20,8H17.19C16.74,7.22 16.12,6.55 15.37,6.04L17,4.41L15.59,3L13.42,5.17C12.96,5.06 12.5,5 12,5C11.5,5 11.04,5.06 10.59,5.17L8.41,3L7,4.41L8.62,6.04C7.88,6.55 7.26,7.22 6.81,8H4V10H6.09C6.04,10.33 6,10.66 6,11V12H4V14H6V15C6,15.34 6.04,15.67 6.09,16H4V18H6.81C7.85,19.79 9.78,21 12,21C14.22,21 16.15,19.79 17.19,18H20V16H17.91C17.96,15.67 18,15.34 18,15V14H20V12H18V11C18,10.66 17.96,10.33 17.91,10H20V8M14,16H10V14H14V16M14,12H10V10H14V12Z",
  refund: "M20,8H4V6H20M20,18H4V12H20M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z",
  suggestion: "M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21Z",
  usage: "M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  etc: "M12,3C6.5,3 2,6.58 2,11C2.05,13.15 3.06,15.17 4.75,16.5C4.75,17.1 4.33,18.67 2,21C4.37,20.89 6.64,20 8.47,18.5C9.61,18.83 10.81,19 12,19C17.5,19 22,15.42 22,11C22,6.58 17.5,3 12,3Z",
};

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
                      <path d={CATEGORY_ICON[it.category]} />
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
