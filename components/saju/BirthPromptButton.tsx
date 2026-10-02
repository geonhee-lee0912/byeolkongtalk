"use client";

// components/saju/BirthPromptButton.tsx — 생일(내 사주) 입력을 **그 자리에서** 받는 버튼.
// 🔴 예전 6곳은 생일이 없으면 `/mypage` 로 보냈고, /mypage 는 저장 뒤 원래 화면으로 돌려보내지
//    않았다 — 광고로 온 신규 유저(가입 때 생일을 안 받는다)는 전원 거기서 길을 잃었다.
//    정본: docs/superpowers/specs/2026-10-02-생일벽-인라인-입력-design.md
// 🔴 팝업은 마이페이지의 SelfSajuEditModal 을 **그대로** 쓴다. self 가 있으면 PATCH, 없으면 POST 를
//    그 모달이 고른다 — 그래서 열기 전에 self 를 반드시 조회한다. 별마루 404 는 원인이 둘이다
//    (primary 없음 / primary 는 있는데 생일 없음). self 를 모른 채 POST 하면 뒤쪽이 409 로 막힌다.
import { useState, type ReactNode } from "react";
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

  async function open() {
    if (busy) return;
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
    // 🔴 조회 자체가 실패(me === null)하면 로그인 여부를 모른다 — 로그인으로 튕기지 않고 빈 팝업을
    //    연다. 진짜 비로그인이면 저장이 401 로 실패하고 팝업의 오류 줄이 그걸 알린다.
    if (me && me.isAuthenticated === false) {
      const next = loginNext ?? window.location.pathname + window.location.search;
      window.location.href = "/login?next=" + encodeURIComponent(next);
      return; // 페이지를 떠나므로 busy 는 풀지 않는다
    }
    const profiles = (list?.profiles ?? []) as ProfileItem[];
    setOpened({
      self: profiles.find((p) => p.isPrimary) ?? null,
      nickname: typeof me?.user?.nickname === "string" ? me.user.nickname : "",
    });
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={() => void open()} disabled={busy} className={className}>
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
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}
