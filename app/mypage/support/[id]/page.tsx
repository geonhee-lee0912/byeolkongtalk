"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "@/lib/inquiries";

interface InquiryDetail {
  id: string;
  category: InquiryCategory;
  title: string;
  body: string;
  status: "open" | "answered";
  answer_body: string | null;
  answered_at: string | null;
  read_at: string | null;
  created_at: string;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/inquiries/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/login?next=/mypage/support/${id}`);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const d = await res.json();
      setItem(d.inquiry as InquiryDetail);
      setLoading(false);
    })();
  }, [id, router]);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/inquiries/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/mypage/support");
    } else {
      setDeleting(false);
      setConfirmDelete(false);
      alert("삭제에 실패했어. 이미 답변이 달렸을 수 있어.");
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }
  if (!item) {
    return (
      <main className="flex flex-1 flex-col items-center py-8 w-full">
        <div className="w-full max-w-md mx-auto px-5">
          <Link href="/mypage/support" className="text-[12px] text-text-light/70">
            ‹ 문의 목록
          </Link>
          <p className="text-text-light/70 text-[13px] text-center py-12">
            문의를 찾을 수 없어.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage/support" className="text-[12px] text-text-light/70">
          ‹ 문의 목록
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
        {/* 내 질문 */}
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] text-lilac-deep font-bold">
              {INQUIRY_CATEGORIES[item.category]}
            </span>
            <span className="text-[11px] text-text-light/60">· {fmtDateTime(item.created_at)}</span>
          </div>
          <h1 className="text-[16px] font-bold text-eye-purple mb-2">{item.title}</h1>
          <p className="text-[14px] text-eye-purple/90 whitespace-pre-wrap leading-relaxed">
            {item.body}
          </p>
        </div>

        {/* 답변 */}
        {item.status === "answered" && item.answer_body ? (
          <div className="bg-gradient-to-br from-lilac-soft/60 to-cream-warm rounded-2xl p-4 border border-lilac-mid/40">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[13px] font-bold text-lilac-deep">별콩이 답변</span>
              {item.answered_at && (
                <span className="text-[11px] text-text-light/60">· {fmtDateTime(item.answered_at)}</span>
              )}
            </div>
            <p className="text-[14px] text-eye-purple/90 whitespace-pre-wrap leading-relaxed">
              {item.answer_body}
            </p>
          </div>
        ) : (
          <div className="bg-cream rounded-2xl p-4 border border-lilac-mid/20 text-center">
            <p className="text-[13px] text-text-light/70">
              별콩이가 확인하고 있어 ✨ 답변이 달리면 알려줄게.
            </p>
          </div>
        )}

        {/* 삭제 (답변 전에만) */}
        {item.status === "open" && (
          <div className="pt-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[12px] text-text-light/60 underline mx-auto block"
              >
                문의 삭제
              </button>
            ) : (
              <div className="bg-white rounded-2xl p-4 border border-lilac-mid/30">
                <p className="text-[13px] text-eye-purple text-center mb-3">
                  이 문의를 삭제할까? 되돌릴 수 없어.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
