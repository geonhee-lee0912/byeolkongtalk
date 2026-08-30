"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { calcSaju, type SajuResult } from "@/lib/saju/calc";
import { paljaType, type PaljaType } from "@/lib/saju-mbti/mapping";
import { selfType, type SelfType } from "@/lib/saju-mbti/self-type";
import { matchRate, type MatchRate } from "@/lib/saju-mbti/match";
import { TYPE_CONTENT, shareHook } from "@/lib/saju-mbti/content";
import { encodeResult, decodeResult } from "@/lib/saju-mbti/share-tokens";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { buildSajuMbtiShareUrl } from "@/lib/saju-mbti/share-url";
import { QuizStage } from "./QuizStage";
import { BirthStage, type BirthValue } from "./BirthStage";
import { ResultView } from "./ResultView";
import { SharedTeaser } from "./SharedTeaser";
import FreeToPaidCta from "@/components/upsell/FreeToPaidCta";

type Stage = "intro" | "quiz" | "birth" | "result" | "shared";
const KEY = "saju-mbti:session";

interface Computed {
  saju: SajuResult;
  palja: PaljaType;
  self: SelfType;
  match: MatchRate;
}

function compute(birth: BirthValue, answers: Record<string, string>): Computed {
  const saju = calcSaju({ ...birth, gender: "other" });
  const palja = paljaType(saju);
  const self = selfType(answers);
  const match = matchRate(self.axes, palja.axes);
  return { saju, palja, self, match };
}

export function SajuMbtiFlow({ sharedToken }: { sharedToken?: string }) {
  const decoded = useMemo(() => decodeResult(sharedToken), [sharedToken]);
  const [stage, setStage] = useState<Stage>("intro");
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [result, setResult] = useState<Computed | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s?.birthInput && s?.answers) {
          setResult(compute(s.birthInput, s.answers));
          setStage("result");
          setReady(true);
          return;
        }
      } catch {
        /* ignore corrupt session */
      }
    }
    if (decoded) setStage("shared");
    setReady(true);
  }, [decoded]);

  function onQuizDone(a: Record<string, string>) {
    setAnswers(a);
    trackUiEvent("saju_mbti_birth");
    setStage("birth");
  }

  function onBirthDone(birth: BirthValue) {
    const c = compute(birth, answers ?? {});
    trackUiEvent("saju_mbti_completed", {
      meta: { palja: c.palja.code, self: c.self.code, band: c.match.band, element: c.palja.element },
    });
    setResult(c);
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ birthInput: birth, answers }));
    } catch {
      /* storage full/blocked — 세션 복원만 포기, 결과는 표시 */
    }
    const token = encodeResult({ paljaCode: c.palja.code, selfCode: c.self.code, band: c.match.band, element: c.palja.element });
    window.history.replaceState(null, "", `?r=${token}`);
    setStage("result");
  }

  function onRestart() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    window.history.replaceState(null, "", window.location.pathname);
    setResult(null);
    setAnswers(null);
    setStage("intro");
  }

  function onShare() {
    if (!result) return;
    const token = encodeResult({
      paljaCode: result.palja.code,
      selfCode: result.self.code,
      band: result.match.band,
      element: result.palja.element,
    });
    const origin = window.location.origin;
    const link = buildSajuMbtiShareUrl(origin, token, result.palja.code);
    const content = TYPE_CONTENT[result.palja.code];
    trackUiEvent("saju_mbti_shared", {
      meta: { palja: result.palja.code, via: typeof navigator.share === "function" ? "native" : "copy" },
    });
    if (navigator.share) {
      navigator.share({ title: content ? shareHook(content.character) : "사주 MBTI", url: link }).catch(() => {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(
        () => flashToast("링크 복사됨! 친구에게 붙여넣어봐"),
        () => flashToast("복사 실패 — 주소창 링크를 복사해줘"),
      );
    }
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  if (!ready) {
    return <div className="w-full py-24 text-center text-text-light text-sm animate-fade-in">별콩이가 준비하는 중…</div>;
  }

  return (
    <>
      {stage === "intro" && (
        <div className="w-full max-w-md mx-auto px-6 py-16 text-center animate-fade-in" data-stage="intro">
          <p className="text-[12px] tracking-[0.16em] text-lilac-deep mb-4">별콩톡 · 사주 MBTI</p>
          <div className="flex justify-center mb-3">
            <Image src="/saju-mbti/intro.png" alt="별콩이가 자아·팔자 두 오브를 든 모습" width={200} height={200} className="w-44 h-44 object-contain" priority />
          </div>
          <h1 className="font-display text-[28px] text-eye-purple leading-snug text-balance">
            네가 아는 너<br />vs<br />타고난 너
          </h1>
          <p className="text-[14px] leading-relaxed text-text-light mt-4 max-w-[300px] mx-auto break-keep">
            12문항으로 네 성격을 읽고, 생년월일로 타고난 팔자를 펼쳐서<br />둘이 얼마나 닮았는지 별콩이가 짚어줄게.
          </p>
          <button
            type="button"
            onClick={() => { trackUiEvent("saju_mbti_started"); setStage("quiz"); }}
            className="mt-8 w-full py-4 rounded-2xl bg-lilac-deep text-white font-bold text-[16px] active:scale-[0.98] transition"
          >
            시작하기
          </button>
        </div>
      )}
      {stage === "quiz" && <QuizStage onDone={onQuizDone} />}
      {stage === "birth" && <BirthStage onDone={onBirthDone} />}
      {stage === "result" && result && (
        <>
          <ResultView saju={result.saju} palja={result.palja} self={result.self} match={result.match} onRestart={onRestart} onShare={onShare} />
          <FreeToPaidCta
            title="더 깊이 볼래?"
            subtitle="MBTI는 맛보기 — 진짜 사주 리포트도, 지금 고민 타로도"
            chat={{ label: "지금 고민, 타로로 뽑아볼래?", tagline: "카드로 지금 마음을 바로 물어봐" }}
            products={["nature_self", "love_self"]}
            source="mbti"
          />
          <div className="h-10" />
        </>
      )}
      {stage === "shared" && decoded && <SharedTeaser tokens={decoded} onStart={onRestart} />}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 bg-night text-cream-warm text-[13px] px-4 py-2.5 rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </>
  );
}
