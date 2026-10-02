"use client";

// components/saju/BirthPromptButton.tsx — 생일(내 사주) 입력을 **그 자리에서** 받는 버튼.
// 🔴 예전 6곳은 생일이 없으면 `/mypage` 로 보냈고, /mypage 는 저장 뒤 원래 화면으로 돌려보내지
//    않았다 — 광고로 온 신규 유저(가입 때 생일을 안 받는다)는 전원 거기서 길을 잃었다.
//    정본: docs/superpowers/specs/2026-10-02-생일벽-인라인-입력-design.md
// 🔴 팝업은 마이페이지의 SelfSajuEditModal 을 **그대로** 쓴다. self 가 있으면 PATCH, 없으면 POST 를
//    그 모달이 고른다 — 그래서 열기 전에 self 를 반드시 조회한다. 별마루 404 는 원인이 둘이다
//    (primary 없음 / primary 는 있는데 생일 없음). self 를 모른 채 POST 하면 뒤쪽이 409 로 막힌다.
// 🔴 놓는 자리 제약 — 팝업은 body 로 포털되지만 React 트리상으론 이 버튼의 형제라, 팝업 안의 키·submit·
//    배경 클릭 같은 이벤트가 **이 버튼의 React 조상**으로 버블된다. `<form onSubmit>`·onClick 카드·Next <Link>·
//    onKeyDown/onBlur 조상 안, 그리고 z-index 50 을 넘는 오버레이(StarConfirmModal z-[80] 등) 안에는 놓지 말 것.
//    (2026-10-02 의 6곳은 조상 체인을 확인했다 — Task 4 품질 리뷰)
import { useEffect, useRef, useState, type ReactNode } from "react";
import SelfSajuEditModal from "@/components/mypage/SelfSajuEditModal";
import type { ProfileItem } from "@/components/mypage/sajuShared";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { BirthPromptSurface } from "@/lib/analytics/birth-prompt-surface";

interface Props {
  surface: BirthPromptSurface;
  className: string;
  children: ReactNode;
  /** 저장 성공 뒤 그 자리 갱신. 끝날 때까지 팝업의 저장 버튼이 잠겨 있다. */
  onSaved: () => void | Promise<void>;
  /** 기존 클릭 계측을 잇는 자리용(별마루 허브의 byeolmaru_guest_peek_clicked). */
  onClick?: () => void;
  /** 비로그인일 때 로그인 후 돌아올 곳. 없으면 지금 화면(pathname + search). */
  loginNext?: string;
}

type Opened = { self: ProfileItem | null; nickname: string };

/** 저장 뒤 페이지를 새로 불러오는 자리(별마루 날짜 상세 3탭)용 onSaved.
 *  🔴 끝나지 않는 promise 를 돌려준다 — 팝업이 새로고침이 끝날 때까지 "별콩이가 펼치는 중…"으로 남아,
 *     닫힌 팝업 뒤로 낡은 '생일 없음' 벽과 다시 눌리는 버튼이 비치지 않는다(Task 3 품질 리뷰).
 *     birth_prompt_saved 는 onSaved 보다 먼저 sendBeacon 으로 나가서 새로고침에 잘리지 않는다. */
export function reloadAfterSave(): Promise<void> {
  window.location.reload();
  return new Promise<void>(() => {});
}

export default function BirthPromptButton({ surface, className, children, onSaved, onClick, loginNext }: Props) {
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 응답이 오기 전에 화면을 떠났으면(언마운트) 로그인 리다이렉트를 하지 않는다 — 예: 비로그인이 헤더 버튼을
  // 누르고 바로 하단탭으로 이동하면, 늦게 온 응답이 엉뚱한 화면에서 /login 으로 끌고 간다.
  // 🔴 effect 본문에서 true 로 다시 세팅한다 — dev StrictMode 의 재마운트 뒤 false 로 굳지 않게.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 🔴 비로그인 → 로그인으로 보낸 뒤 '뒤로'로 돌아오면, 브라우저가 페이지를 bfcache 에서 busy=true 인 채로
  //    되살려 버튼이 새로고침 전까지 꺼진다(Task 4 셀프리뷰가 찾은 경로 — 로그인 리다이렉트는 busy 를 안 푼다).
  //    되살아난 경우(persisted)에만 푼다.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function open() {
    if (busy || opened) return; // 팝업이 열린 채 키보드로 다시 눌러도 무시
    onClick?.();
    trackUiEvent("birth_prompt_clicked", { meta: { surface } });
    setBusy(true);
    const [me, list] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/profiles", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!alive.current) return;
    // 🔴 조회 자체가 실패(me === null)하면 로그인 여부를 모른다 — 로그인으로 튕기지 않고 빈 팝업을
    //    연다. 진짜 비로그인이면 저장이 401 로 실패하고 팝업의 오류 줄이 그걸 알린다.
    if (me && me.isAuthenticated === false) {
      const next = loginNext ?? window.location.pathname + window.location.search;
      window.location.href = "/login?next=" + encodeURIComponent(next);
      return; // 페이지를 떠나므로 busy 는 풀지 않는다
    }
    const profiles = (list?.profiles ?? []) as ProfileItem[];
    const self = profiles.find((p) => p.isPrimary) ?? null;
    setOpened({
      self,
      // 🔴 me 조회만 실패하면 닉네임이 비어 ProfileForm 이 "나"로 채운다 — PATCH 때 기존 이름을 덮지 않게
      //    내 사주의 지금 이름으로 대신한다.
      nickname: typeof me?.user?.nickname === "string" ? me.user.nickname : (self?.displayName ?? ""),
    });
    setBusy(false);
  }

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => void open()} disabled={busy} aria-busy={busy} className={className}>
        {children}
      </button>
      {opened && (
        <SelfSajuEditModal
          self={opened.self}
          selfDisplayName={opened.nickname}
          onReload={async () => {
            // 🔴 신규 생일 입력은 hadBirth=false 로 센다 — created 만으로는 "primary 는 있는데 생일 없음"의
            //    첫 입력(PATCH)이 빠진다(ui-events.ts 의 birth_prompt_saved 주석).
            trackUiEvent("birth_prompt_saved", {
              meta: { surface, created: opened.self === null, hadBirth: Boolean(opened.self?.birthDate) },
            });
            await onSaved();
          }}
          onClose={() => {
            setOpened(null);
            // 닫히면 포커스를 버튼으로 돌린다(키보드·스크린리더 사용자가 위치를 잃지 않게).
            // 저장 성공 경로에선 이 시점에 소비처의 갱신(재조회 setState)이 아직 커밋 전이라 버튼이 남아 있고,
            // 다음 커밋에서 버튼이 사라지면 포커스는 body 로 떨어진다(무해). preventScroll — 배경이 스크롤된
            // iOS 에서 트리거 위치로 화면이 튀지 않게.
            buttonRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
