"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { extractClosingLine } from "@/lib/saju/closing";
import { continuationPrice, fullCostFor } from "@/lib/continuation";
import type { SpreadType } from "@/lib/tarot/spreads";

const MIN_LEN = 10;
const MAX_LEN = 200;

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}
interface ParentReading {
  id: string;
  question: string;
  consultationType?: string;
  spreadType?: SpreadType | null;
  emotionTag?: string | null;
  hasSensitive: boolean;
}

interface Props {
  /** 부모 reading id — null 이면 닫힘 */
  readingId: string | null;
  onClose: () => void;
}

/**
 * 후속 상담(이어가기) 팝업 — 완료된 reading 에서 호출.
 * 지난 고민 + 별콩이 정리 한마디(초대 문구 제외)를 보여주고, 새 고민을 받아
 * 두 경로(새로 펼쳐 / 같은 결로 더 깊이) 중 하나로 이어가기를 시작한다.
 * 마운트한 페이지(히스토리·result)는 이미 로그인 가드를 통과한 상태라 별도 인증 분기 없음.
 */
export default function ContinuationModal({ readingId, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<ParentReading | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!readingId) return;
    setLoading(true);
    setParent(null);
    setClosing(null);
    setConcern("");
    setBalance(null);
    setError(null);
    let cancelled = false;
    void (async () => {
      const d = await fetch(`/api/readings/${readingId}`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (cancelled) return;
      if (!d?.reading) {
        setError("이어갈 고민을 불러오지 못했어");
        setLoading(false);
        return;
      }
      const r = d.reading as ParentReading;
      if (r.hasSensitive) {
        onClose();
        return;
      }
      setParent(r);
      setClosing(
        extractClosingLine((d.messages ?? []) as MessageRow[], {
          excludeInvite: true,
        })
      );
      setLoading(false);
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((b) => {
          if (!cancelled && b) setBalance(b.balance ?? 0);
        })
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [readingId, onClose]);

  // ESC 로 닫기 + 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!readingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [readingId, onClose]);

  if (!readingId || typeof document === "undefined") return null;

  const consultationType =
    (parent?.consultationType as "saju" | "tarot") ?? "saju";
  const fullCost = parent
    ? fullCostFor({ consultationType, spreadType: parent.spreadType })
    : 0;
  const deepCost = continuationPrice(fullCost, "deep");

  const start = async (mode: "fresh" | "deep") => {
    if (!parent) return;
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    const cost = mode === "fresh" ? fullCost : deepCost;
    if (balance !== null && balance < cost) {
      router.push("/shop");
      return;
    }
    setError(null);

    // tarot-fresh: 새 카드 추첨 필요 → 마커 심고 타로 흐름으로
    if (consultationType === "tarot" && mode === "fresh") {
      sessionStorage.setItem(
        "byeolkong:continuation",
        JSON.stringify({ previousReadingId: parent.id, mode: "fresh" })
      );
      sessionStorage.setItem(
        "byeolkong:pending_consultation",
        JSON.stringify({
          emotion: parent.emotionTag ?? "",
          concern,
          type: "tarot",
        })
      );
      router.push("/tarot");
      return;
    }

    // 서버 복사 경로 (saju-fresh / saju-deep / tarot-deep)
    setSubmitting(true);
    try {
      const res = await fetch("/api/readings/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousReadingId: parent.id, mode, concern }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === "INSUFFICIENT_STARS") {
          router.push("/shop");
          return;
        }
        setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      if (data.consultationType === "tarot") {
        router.push(`/tarot/reading?id=${data.id}`);
      } else {
        router.push(`/saju/reading?id=${data.id}`);
      }
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] sm:shadow-[0_8px_32px_rgba(31,23,53,0.25)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-6 flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Image src="/byeolkong-main.png" alt="별콩이" width={32} height={32} />
              <h2 className="font-display text-[17px] font-bold text-eye-purple">
                이 고민, 이어가볼까?
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <p className="text-text-light text-sm py-10 text-center">잠시만…</p>
          ) : !parent ? (
            <p className="text-text-light text-sm py-10 text-center">
              {error ?? "불러오지 못했어"}
            </p>
          ) : (
            <>
              {/* 지난 맥락 — 다크톤 */}
              <div className="bg-gradient-to-br from-night to-night-deep rounded-2xl p-4 border border-night-deep mb-2">
                <div className="text-[11px] font-bold text-lilac-soft/70 mb-1">
                  지난번 고민
                </div>
                <p className="text-[13px] text-cream leading-relaxed whitespace-pre-wrap">
                  {parent.question}
                </p>
              </div>
              {closing && (
                <div className="bg-gradient-to-br from-gold-soft/30 via-lilac-soft/60 to-cream-warm rounded-2xl p-4 border border-gold-soft/40 mb-2">
                  <div className="text-[11px] font-bold text-eye-purple mb-1">
                    지난번 별콩이 정리
                  </div>
                  <p className="text-[13px] text-eye-purple leading-relaxed">
                    {closing}
                  </p>
                </div>
              )}

              {/* 새 고민 (빈 칸) */}
              <label className="text-[12px] text-text-light mt-2">
                이어서 나눌 고민
              </label>
              <textarea
                value={concern}
                onChange={(e) => setConcern(e.target.value.slice(0, MAX_LEN))}
                rows={4}
                placeholder="오늘은 어떤 결을 이어서 풀어볼까?"
                className="mt-1 w-full p-3 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] leading-relaxed resize-none placeholder:text-text-light/50"
              />
              <div className="flex justify-between text-[11px] text-text-light/70 mt-1">
                <span>{concern.length < MIN_LEN ? `최소 ${MIN_LEN}자` : " "}</span>
                <span>
                  {concern.length} / {MAX_LEN}
                </span>
              </div>
              {error && (
                <p className="text-[12px] text-red-500 text-center mt-1">{error}</p>
              )}

              {/* 경로 — 타로는 2개(새로 뽑기 / 같은 카드 이어서), 사주는 1개(이어서 상담) */}
              {consultationType === "tarot" ? (
                <>
                  <button
                    onClick={() => start("fresh")}
                    disabled={submitting || concern.length < MIN_LEN}
                    className="mt-3 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    타로 카드 새로 뽑아 상담 (⭐ {fullCost})
                  </button>
                  <button
                    onClick={() => start("deep")}
                    disabled={submitting || concern.length < MIN_LEN}
                    className="mt-2 w-full py-3.5 rounded-xl border border-lilac-deep/50 text-lilac-deep font-bold text-[15px] hover:bg-lilac-deep/5 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    동일한 카드로 이어서 상담 (⭐ {deepCost}
                    <span className="text-[11px] text-lilac-deep/70">40% 할인</span>)
                  </button>
                </>
              ) : (
                <button
                  onClick={() => start("deep")}
                  disabled={submitting || concern.length < MIN_LEN}
                  className="mt-3 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  지난 대화를 이어서 상담 (⭐ {deepCost}
                  <span className="text-[11px] text-white/70">40% 할인</span>)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
