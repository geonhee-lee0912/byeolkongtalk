"use client";

// 마이페이지 → 알림 설정. 앱(push 지원) 안에서만 쓸 수 있다. 시안: docs/superpowers/specs/assets/2026-11-06-앱-알림-시안.html ⑤
// 광고성 정보 수신 동의(앱 푸시) 칸이 애플 4.5.4 가 요구하는 앱 안 수신거부다(설계 §4-6). 바꾸면 그 자리에서 결과 통지(§4-4).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { postToApp } from "@/lib/app-context";
import { useAppInfo } from "@/lib/use-app-info";
import type { PushState } from "@/lib/app-bridge/protocol";
import type { AdStatus } from "@/lib/push/asks";
import AdConsentNotice, { type ConsentNotice } from "@/components/push/AdConsentNotice";
import { setAdConsent } from "@/components/push/api";

function Toggle({ on, label, disabled, onClick }: { on: boolean; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative shrink-0 w-11 h-[26px] rounded-full transition-colors disabled:opacity-60 ${on ? "bg-eye-purple" : "bg-lilac-mid/60"}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : ""}`} />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { ready } = useAppInfo();
  const inApp = ready && appSupportsPush();
  const [loaded, setLoaded] = useState(false);
  const [revisit, setRevisit] = useState(false);
  const [morning, setMorning] = useState(false);
  const [ad, setAd] = useState<{ status: AdStatus; grantedOn: string | null }>({ status: "none", grantedOn: null });
  const [notice, setNotice] = useState<ConsentNotice | null>(null);
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
      if (s) {
        setRevisit(Boolean(s.revisit));
        setMorning(s.morning !== false);
        if (s.ad) setAd({ status: s.ad.status, grantedOn: s.ad.grantedOn ?? null });
      }
      setPerm(status);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, router]);

  /** 종류 칸 — 낙관적으로 뒤집고 저장, 실패하면 되돌린다 */
  async function togglePref(key: "revisit" | "morning") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    const set = key === "revisit" ? setRevisit : setMorning;
    const next = !(key === "revisit" ? revisit : morning);
    set(next);
    try {
      const r = await fetch("/api/push/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!r.ok) throw new Error("save_failed");
    } catch {
      set(!next);
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** 광고 동의 켜고 끄기 — 서버가 바꾼 뒤에만 화면을 바꾼다(낙관적으로 뒤집지 않는다 — 통지 날짜가 서버 기록과 같아야 한다) */
  async function toggleAd() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const r = await setAdConsent(ad.status !== "granted", "settings");
      if (!r) {
        setFailed(true);
        return;
      }
      setAd({ status: r.status, grantedOn: r.status === "granted" ? (r.notice?.date ?? ad.grantedOn) : null });
      if (r.notice) setNotice(r.notice);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      {/* 앱에선 앱 헤더(‹ + 알림 설정)와 겹쳐 숨긴다(web-only) */}
      <div className="web-only w-full max-w-md mx-auto px-5 mb-4">
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
              <Toggle on={revisit} label="다시 볼 날 알림" disabled={busy} onClick={() => void togglePref("revisit")} />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-lilac-mid/20">
              <div>
                <p className="text-[14px] font-bold">아침 별 흐름</p>
                <p className="text-[11.5px] text-text-light mt-[3px] leading-normal">
                  매일 아침 별마루 오늘의 흐름을 알려줘
                  {/* 비구독자에겐 광고로 간다 — 이 칸과 광고 동의가 둘 다 켜져야 받는다(설계 §4-6) */}
                  {morning && ad.status !== "granted" && (
                    <>
                      <br />
                      별마루 구독 중이 아니면 아래 광고성 정보 수신 동의도 켜야 받아
                    </>
                  )}
                </p>
              </div>
              <Toggle on={morning} label="아침 별 흐름 알림" disabled={busy} onClick={() => void togglePref("morning")} />
            </div>
          </div>
          <div className="mt-3.5 bg-white rounded-[18px] border border-lilac-mid/30 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-[14px] font-bold">광고성 정보 수신 동의 (앱 푸시)</p>
                <p className="text-[11.5px] text-text-light mt-[3px] leading-normal">
                  {ad.status === "granted" && ad.grantedOn ? `동의일 ${ad.grantedOn}` : "아침 별 흐름 맛보기 · 생일 아침 운세 · 이벤트 소식"}
                </p>
              </div>
              <Toggle on={ad.status === "granted"} label="광고성 정보 수신 동의" disabled={busy} onClick={() => void toggleAd()} />
            </div>
          </div>
          {failed && <p className="mt-2 text-[12px] text-text-light">잘 안 됐어. 한 번 더 눌러 줄래?</p>}
          {notice && <AdConsentNotice notice={notice} onClose={() => setNotice(null)} />}
        </div>
      )}
    </main>
  );
}
