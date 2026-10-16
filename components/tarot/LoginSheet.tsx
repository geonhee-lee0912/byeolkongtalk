"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import AppleLoginButton from "@/components/auth/AppleLoginButton";

// 로그인 창 — 타로 로그인 전 맛보기(스펙 2026-10-11-타로-로그인전-맛보기 §3 ④). 뽑은 카드 위로 올라오는 시트.
// 카카오 버튼은 로그인 뒤 /tarot/draw?resume=login 으로 돌아와 버튼 없이 이어간다(진행은 localStorage — lib/tarot/pending-draw).
// 🔴 약관 동의 문구는 /login 과 같아야 한다 — 로그인 입구가 하나 더 생긴 것이다.
// 포털 — 페이지 <main> 안 애니메이션(transform)의 스택 컨텍스트에 갇히지 않게(StarConfirmModal 과 같은 이유).
export interface LoginSheetProps {
  concern: string;
  /** guestSheetLine — "첫 풀이는 가입 선물로 무료" / "가입 선물 15별 + ⭐N만 더 (X원부터)" */
  priceText: string;
  kakaoHref: string;
  /** 로그인 뒤 돌아올 내부 경로 — 애플 버튼용(카카오 버튼 href 의 next 와 같은 값) */
  loginNext: string;
  /** 로그인 실패로 돌아옴 — "다시 눌러줘" */
  failed: boolean;
  /** 계측용 스프레드 */
  spread: string;
  onDismiss: () => void;
}

export default function LoginSheet({ concern, priceText, kakaoHref, loginNext, failed, spread, onDismiss }: LoginSheetProps) {
  const [mounted, setMounted] = useState(false);
  const kakaoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => setMounted(true), []);

  // 바깥 탭·'나중에 할래'·Esc 가 한 길 — 닫기 계측(login_sheet_dismissed)도 같이 찍힌다
  const dismiss = () => {
    trackUiEvent("login_sheet_dismissed", { meta: { spread } });
    onDismiss();
  };

  // Esc 로 닫기 — 다른 시트들과 같은 관용구. deps 를 두지 않아 매 렌더 가장 최근 dismiss 를 건다(부모가 onDismiss 를 렌더마다 새로 만든다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 창이 열리면 주 행동(카카오 버튼)으로 포커스 — 키보드·스크린리더가 뽑은 카드 화면 뒤에 남지 않게(aria-modal). 포털이 그려져 ref 가 붙은 뒤(mounted)에 옮긴다
  useEffect(() => {
    if (mounted) kakaoRef.current?.focus({ preventScroll: true });
  }, [mounted]);

  if (!mounted) return null;

  // 코드 포인트 단위로 자른다 — slice 는 이모지(서로게이트 쌍)가 20번째 경계에 걸리면 반쪽만 남겨 깨진 글자(�)가 된다
  const chars = Array.from(concern);
  const snippet = chars.length > 20 ? `${chars.slice(0, 20).join("")}…` : concern;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/40 animate-fade-in"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="로그인하고 풀이 보기"
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-[19px] text-eye-purple text-center leading-tight">카드는 뽑혔어 ✨</p>
        {/* break-keep — 375px 폭에서 "…’에 뭐 / 라고 하는지," 처럼 단어 중간에서 끊기지 않게.
            break-words 를 같이 둔다: 고민 조각(snippet)은 사용자 글이라 공백 없이 20자가 이어질 수 있고, keep-all 만 쓰면 320px 폭에서 그 줄이 창 밖으로 넘친다(실측 15px) */}
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed break-keep break-words">
          이 카드가 ‘{snippet}’에 뭐라고 하는지,
          <br />
          별콩이가 바로 풀어줄게
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-center text-[13px] font-bold text-red-500">
            로그인이 안 됐어 — 다시 눌러줘
          </p>
        )}
        <p className="mt-4 mx-auto w-fit rounded-full bg-gradient-to-r from-gold-soft to-gold px-4 py-1.5 text-[12.5px] font-black text-eye-purple text-center">
          {priceText}
        </p>
        <a
          ref={kakaoRef}
          href={kakaoHref}
          onClick={() => trackUiEvent("login_kakao_clicked", { meta: { surface: "draw_sheet", spread } })}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold text-[15px] hover:brightness-95 active:scale-[0.98] transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
          </svg>
          카카오로 3초 시작
        </a>
        <AppleLoginButton next={loginNext} surface="draw_sheet" meta={{ spread }} className="mt-3" />
        <p className="mt-2 text-[12px] text-eye-purple/80 text-center">뽑은 카드는 그대로 이어져</p>
        <p className="mt-1 text-[11px] text-text-light/80 text-center">
          이미 가입했다면 남은 별로 이어져 (가입 선물은 처음 한 번)
        </p>
        <p className="mt-3 text-[10.5px] text-text-light/70 text-center leading-relaxed">
          시작하면{" "}
          <Link href="/terms" className="underline">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline">
            개인정보처리방침
          </Link>
          에 동의한 것으로 간주돼.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full py-3 text-[13px] font-bold text-lilac-deep rounded-full bg-transparent border-2 border-lilac-deep/40 hover:border-lilac-deep/70 hover:bg-lilac-deep/5 transition-colors"
        >
          나중에 할래
        </button>
      </div>
    </div>,
    document.body
  );
}
