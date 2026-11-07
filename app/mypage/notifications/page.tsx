"use client";

// 마이페이지 → 알림 설정. 앱(push 지원) 안에서만 쓸 수 있다. 시안: docs/superpowers/specs/assets/2026-11-06-앱-알림-시안.html ⑤
// 단계 2 에서 광고성 정보 수신 동의 칸·오늘의 별 흐름 줄이 이 아래에 붙는다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { postToApp } from "@/lib/app-context";
import { useAppInfo } from "@/lib/use-app-info";
import type { PushState } from "@/lib/app-bridge/protocol";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { ready } = useAppInfo();
  const inApp = ready && appSupportsPush();
  const [loaded, setLoaded] = useState(false);
  const [revisit, setRevisit] = useState(false);
  const [perm, setPerm] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  // 비로그인은 마이페이지처럼 로그인으로 보낸다
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (cancelled) return;
      if (!me?.isAuthenticated) {
        router.replace("/login?next=/mypage/notifications");
        return;
      }
      if (!appSupportsPush()) {
        setLoaded(true);
        return;
      }
      const [s, status] = await Promise.all([
        fetch("/api/push/settings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        askAppPush("push.status"), // null(시간 초과)이면 OS 꺼짐 줄만 숨긴다
      ]);
      if (cancelled) return;
      if (s) setRevisit(Boolean(s.revisit));
      setPerm(status);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, router]);

  /** 낙관적으로 뒤집고 저장, 실패하면 되돌린다 */
  async function toggleRevisit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    const next = !revisit;
    setRevisit(next);
    try {
      const r = await fetch("/api/push/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisit: next }),
      });
      if (!r.ok) throw new Error("save_failed");
    } catch {
      setRevisit(!next);
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
        <h1 className="mt-3 text-[16px] font-black">알림 설정</h1>
      </div>

      {!ready || !loaded ? null : !inApp ? (
        <p className="w-full max-w-md mx-auto px-5 text-[13px] text-text-light">알림은 앱에서 설정할 수 있어</p>
      ) : (
        <div className="w-full max-w-md mx-auto px-5">
          {perm === "denied" && (
            <div className="mb-3.5 rounded-2xl bg-cream-warm border border-dashed border-lilac-deep px-3.5 py-3 text-[12.5px] leading-relaxed">
              휴대폰 알림이 꺼져 있어. 켜야 별콩이가 알려줄 수 있어.
              <br />
              <button
                type="button"
                onClick={() => postToApp("push.openSettings")}
                className="mt-2 inline-block px-3.5 py-2 rounded-full text-[12px] font-bold text-eye-purple bg-lilac-soft"
              >
                설정 열기
              </button>
            </div>
          )}
          <div className="bg-white rounded-[18px] border border-lilac-mid/30 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-[14px] font-bold">다시 볼 날</p>
                <p className="text-[11.5px] text-text-light mt-[3px] leading-normal">리딩 끝에 고른 날, 한 번 알려줘</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={revisit}
                aria-label="다시 볼 날 알림"
                disabled={busy}
                onClick={() => void toggleRevisit()}
                className={`relative shrink-0 w-11 h-[26px] rounded-full transition-colors disabled:opacity-60 ${
                  revisit ? "bg-eye-purple" : "bg-lilac-mid/60"
                }`}
              >
                <span
                  className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white transition-transform ${
                    revisit ? "translate-x-[18px]" : ""
                  }`}
                />
              </button>
            </div>
          </div>
          {failed && <p className="mt-2 text-[12px] text-text-light">잘 안 됐어. 한 번 더 눌러 줄래?</p>}
        </div>
      )}
    </main>
  );
}
