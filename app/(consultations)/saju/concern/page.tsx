"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuBoardCompact from "@/components/saju/SajuBoardCompact";
import type { SajuResult } from "@/lib/saju/calc";
import { SAJU_READING_COST } from "@/lib/saju/constants";

interface PendingProfile {
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
}

interface PendingSaju {
  saju: SajuResult;
  profile: PendingProfile;
  emotion?: string;
}

const MAX_LEN = 200;
const MIN_LEN = 10;

export default function ConcernPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingSaju | null>(null);
  const [concern, setConcern] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage 에서 saju + profile 받음
    try {
      const raw = sessionStorage.getItem("byeolkong:pending_saju");
      if (!raw) {
        router.replace("/saju");
        return;
      }
      const p = JSON.parse(raw) as PendingSaju;
      if (!p?.saju || !p?.profile) {
        router.replace("/saju");
        return;
      }
      setPending(p);
    } catch {
      router.replace("/saju");
      return;
    }

    // 잔액 조회
    fetch("/api/stars/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setBalance(d.balance ?? 0);
      })
      .catch(() => {});
  }, [router]);

  const handleStart = async () => {
    if (!pending) return;
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    if (concern.length > MAX_LEN) {
      setError(`${MAX_LEN}자까지만 적을 수 있어`);
      return;
    }
    if (balance !== null && balance < SAJU_READING_COST) {
      router.push("/shop");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: pending.profile,
          sajuData: pending.saju,
          question: concern,
          emotion: pending.emotion,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data?.code === "LOGIN_REQUIRED") {
          router.push("/login?next=/saju/concern");
          return;
        }
        if (data?.code === "INSUFFICIENT_STARS") {
          setError(`별이 부족해 (잔액 ${data.balance}별 / 필요 ${data.required}별)`);
          setSubmitting(false);
          return;
        }
        setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      const data = await r.json();
      // 채팅 페이지에 전달할 컨텍스트 저장
      sessionStorage.setItem(
        "byeolkong:current_reading",
        JSON.stringify({
          readingId: data.id,
          saju: pending.saju,
          question: concern,
        })
      );
      // pending 정리
      sessionStorage.removeItem("byeolkong:pending_saju");
      router.push(`/saju/reading?id=${data.id}`);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setSubmitting(false);
    }
  };

  if (!pending) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const remain = MAX_LEN - concern.length;

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/saju" className="text-[12px] text-text-light/70">
          ‹ 사주판 다시 보기
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={100}
          height={100}
          priority
        />
        <h1 className="mt-3 font-display text-xl font-bold text-eye-purple text-center">
          어떤 고민을 풀어볼까?
        </h1>
        <p className="mt-2 text-[12px] text-text-light text-center leading-relaxed">
          짧게라도 적어주면 별콩이가 너의 사주 결과와 연결해서 풀어줄게.
        </p>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="bg-cream-warm rounded-xl p-3 border border-lilac-mid/30 flex items-center justify-between gap-3">
          <SajuBoardCompact saju={pending.saju} />
          <div className="text-[10px] text-text-light/80 text-right leading-tight">
            {pending.saju.input.inputCalendar === "lunar" ? "음력" : "양력"}
            <br />
            일간 {pending.saju.dayStem}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value.slice(0, MAX_LEN))}
          placeholder="예) 요즘 진로를 고민 중인데 어떤 결로 가는 게 나한테 맞을까?"
          rows={5}
          className="w-full p-3 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] leading-relaxed resize-none placeholder:text-text-light/50"
        />
        <div className="flex justify-between text-[11px] text-text-light/70">
          <span>{concern.length < MIN_LEN ? `최소 ${MIN_LEN}자` : " "}</span>
          <span>
            {concern.length} / {MAX_LEN}
          </span>
        </div>

        <div className="bg-lilac-soft/60 rounded-xl p-3 flex items-center justify-between text-[13px] mt-2">
          <span className="text-text-light">사주 풀이 비용</span>
          <span className="text-eye-purple font-bold">
            ⭐ {SAJU_READING_COST}별
          </span>
        </div>
        {balance !== null && (
          <div className="text-[11px] text-text-light/80 text-right">
            내 별 잔액: {balance}별
          </div>
        )}

        {error && (
          <p className="text-[12px] text-red-500 text-center">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={submitting || concern.length < MIN_LEN}
          className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? "별콩이 부르는 중…"
            : `별콩이에게 풀이 받기 (⭐ ${SAJU_READING_COST})`}
        </button>
      </div>
    </main>
  );
}
