"use client";

// 앱 알림 문지기 — AppShell 에 붙는다. 앱(push 지원) 안에서만 일한다.
//  ① 알림을 눌러 열린 화면 위의 수신거부 줄(설계 §4-7) — 광고 알림의 경로 끝 #bku=<표>. 로그인 없이 표로 철회한다
//  ② 2년 재확인 팝업(§4-5) — 기한 30일 전부터 앱을 열면. 띄운 사실을 서버에 남긴다
//  ③ 첫 상담을 못 끝낸 회원의 두 번째 실행 질문(§4-2) — 로그인한 상태로 웹뷰가 두 번째 뜰 때 홈에서 한 번
//  ④ 앱을 연 시각·누르고 연 알림(#bkp=)을 서버에 남긴다 — 아침 알림 14일 멈춤·깨우기·종류별 열람률(§1·§5-3)
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { useAppInfo } from "@/lib/use-app-info";
import type { AdStatus } from "@/lib/push/asks";
import AdConsentNotice, { type ConsentNotice } from "./AdConsentNotice";
import PushAskSheet from "./PushAskSheet";
import { fetchAsk, setAdConsent } from "./api";
import Dialog from "@/components/common/Dialog";

const LAUNCHES_KEY = "byeolkong_push_launches"; // 로그인한 상태로 웹뷰가 뜬 횟수(기기별)
const COUNTED_KEY = "byeolkong_push_launch_counted"; // 이 웹뷰 수명 동안 이미 셌다
const SECOND_DONE_KEY = "byeolkong_push_second_checked"; // 이 웹뷰 수명 동안 두 번째 실행 질문을 이미 확인했다

function storageGet(s: () => Storage, k: string): string | null {
  try {
    return s().getItem(k);
  } catch {
    return null;
  }
}
function storageSet(s: () => Storage, k: string, v: string): void {
  try {
    s().setItem(k, v);
  } catch {
    // 저장소를 못 쓰면 이번엔 세지 않는다 — 질문이 늦어질 뿐이다
  }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** 웹뷰가 새로 뜬 것으로 1회 세고 지금까지의 횟수를 돌려준다 */
function countLaunch(): number {
  const prev = Number(storageGet(local, LAUNCHES_KEY) ?? "0") || 0;
  if (storageGet(session, COUNTED_KEY)) return prev;
  storageSet(session, COUNTED_KEY, "1");
  storageSet(local, LAUNCHES_KEY, String(prev + 1));
  return prev + 1;
}

/** 알림 경로 끝의 #bkp=<발송 번호>[&bku=<수신거부 표>] 를 읽고 주소에서 지운다(뒤로 가기·공유에 남지 않게). 서버 lib/push/dispatch.ts withPushHash */
function takePushHash(): { sendId: number | null; unsub: string | null } {
  const h = window.location.hash;
  const sendM = /(?:^#|&)bkp=([1-9][0-9]{0,15})(?:&|$)/.exec(h);
  const unsubM = /(?:^#|&)bku=([A-Za-z0-9._-]{1,80})(?:&|$)/.exec(h);
  if (sendM || unsubM) {
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    } catch {
      // 주소를 못 고쳐도 줄은 보인다
    }
  }
  return { sendId: sendM ? Number(sendM[1]) : null, unsub: unsubM ? unsubM[1] : null };
}

/** 앱을 연 시각(+ 누르고 연 알림) — 아침 알림 14일 멈춤·깨우기·열람률. 실패는 무시 */
function beaconOpened(sendId: number | null): void {
  void fetch("/api/push/opened", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sendId ? { sendId } : {}),
    keepalive: true,
  }).catch(() => {});
}
/** 앱이 뒤에 있다 앞으로 올 때도 '연 것'으로 친다 — 너무 잦지 않게 */
const OPEN_BEACON_GAP_MS = 60 * 60 * 1000;

export default function PushGate() {
  const pathname = usePathname() || "/";
  const { ready } = useAppInfo();
  const [unsubToken, setUnsubToken] = useState<string | null>(null);
  const [unsubMsg, setUnsubMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<ConsentNotice | null>(null);
  const [reconfirm, setReconfirm] = useState<{ grantedOn: string } | null>(null);
  const [reconfirmFailed, setReconfirmFailed] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [launches, setLaunches] = useState(0);
  const [second, setSecond] = useState<{ ad: AdStatus } | null>(null);
  const busy = useRef(false);

  // ①·② — 처음 한 번
  useEffect(() => {
    if (!ready || !appSupportsPush()) return;
    const pushHash = takePushHash();
    setUnsubToken(pushHash.unsub);
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/push/settings", { cache: "no-store" });
        if (!r.ok || cancelled) return; // 비로그인(401)이면 여기서 끝
        const b = (await r.json()) as { ad?: { reconfirm?: { grantedOn: string } | null } };
        if (cancelled) return;
        setLoggedIn(true);
        setLaunches(countLaunch());
        beaconOpened(pushHash.sendId);
        if (b.ad?.reconfirm) {
          setReconfirm(b.ad.reconfirm);
          storageSet(session, SECOND_DONE_KEY, "1"); // 팝업을 둘 겹쳐 띄우지 않는다
          void fetch("/api/push/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reconfirmSeen: true }),
          }).catch(() => {});
        }
      } catch {
        // 다음 실행 때 다시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // 이미 그 화면에 떠 있을 때 알림을 누르면 앱이 주소 끝 표식(#bkp·#bku)만 바꿔 같은 문서 안에서 이동할 수 있다 —
  // 그때는 다시 마운트되지 않으니 hashchange 로도 읽는다(Codex 리뷰 #35). 열람 기록은 비로그인이면 서버가 401 로 버린다
  useEffect(() => {
    if (!ready || !appSupportsPush()) return;
    const onHash = () => {
      const h = takePushHash();
      if (h.unsub) {
        setUnsubMsg(null);
        setUnsubToken(h.unsub);
      }
      if (h.sendId) beaconOpened(h.sendId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [ready]);

  // 앱이 뒤에 있다 앞으로 오면 '연 시각'을 다시 남긴다(웹뷰가 새로 뜨지 않으니 위 effect 는 다시 안 돈다)
  useEffect(() => {
    if (!loggedIn) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < OPEN_BEACON_GAP_MS) return;
      last = Date.now();
      beaconOpened(null);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loggedIn]);

  // ③ — 홈에서, 두 번째 실행부터, 이 웹뷰 수명 동안 한 번만 확인
  useEffect(() => {
    if (!loggedIn || launches < 2 || pathname !== "/" || storageGet(session, SECOND_DONE_KEY)) return;
    storageSet(session, SECOND_DONE_KEY, "1");
    let cancelled = false;
    void (async () => {
      const os = await askAppPush("push.status");
      if (!os || cancelled) return;
      const r = await fetchAsk("second_launch", os);
      if (!cancelled && r?.ask === "push") setSecond({ ad: r.ad });
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn, launches, pathname]);

  async function unsubscribe() {
    if (busy.current || !unsubToken) return;
    busy.current = true;
    try {
      const r = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: unsubToken, source: "unsubscribe_line" }),
      });
      const b = (await r.json().catch(() => null)) as { notice?: ConsentNotice | null } | null;
      if (r.ok) {
        setUnsubToken(null);
        if (b?.notice) setNotice(b.notice);
        else setUnsubMsg("이미 광고 알림을 받지 않고 있어");
      } else if (r.status === 409) {
        setUnsubToken(null);
        setUnsubMsg("이 알림의 수신거부는 이미 처리됐어. 지금 상태는 마이의 알림 설정에서 볼 수 있어");
      } else {
        setUnsubMsg("잘 안 됐어. 마이의 알림 설정에서 끌 수 있어");
      }
    } catch {
      setUnsubMsg("잘 안 됐어. 한 번 더 눌러 줄래?");
    } finally {
      busy.current = false;
    }
  }

  async function withdrawFromReconfirm() {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await setAdConsent(false, "reconfirm_popup");
      // 실패하면 팝업을 그대로 두고 다시 누르게 한다 — 팝업은 열 때 이미 '알림'으로 기록돼 다음 실행엔 다시 안 뜬다
      if (!r) {
        setReconfirmFailed(true);
        return;
      }
      setReconfirmFailed(false);
      setReconfirm(null);
      if (r.notice) setNotice(r.notice);
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      {(unsubToken || unsubMsg) &&
        createPortal(
          <div className="fixed left-0 right-0 z-[70] px-4" style={{ top: "calc(env(safe-area-inset-top) + 64px)" }}>
            <div className="mx-auto max-w-md flex items-center gap-2 rounded-2xl bg-white shadow-float px-3.5 py-2.5 text-13">
              <p className="flex-1 leading-snug">{unsubMsg ?? "이 광고 알림을 그만 받으려면"}</p>
              {unsubToken && !unsubMsg && (
                <button
                  type="button"
                  onClick={() => void unsubscribe()}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  수신거부
                </button>
              )}
              <button
                type="button"
                aria-label="닫기"
                onClick={() => {
                  setUnsubToken(null);
                  setUnsubMsg(null);
                }}
                className="shrink-0 w-7 h-7 text-text-light"
              >
               
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* 공통 확인창 틀(components/common/Dialog) — 2년 재확인은 법정 통지라 버튼으로만 닫는다 */}
      {reconfirm && (
          <Dialog label="광고성 정보 수신 동의 확인 안내" role="alertdialog" dismissible={false} z={105} onClose={() => setReconfirm(null)}>
            <div className="w-full max-w-sm bg-cream rounded-3xl p-6">
              <p className="text-17 font-black tracking-tight text-center">광고성 정보 수신 동의 확인 안내</p>
              <p className="mt-3 text-13 leading-relaxed">
                별콩톡에서 알려줄게. 너는 <b>{reconfirm.grantedOn}</b>에 광고성 정보(앱 푸시) 수신에 동의했어.
              </p>
              <p className="mt-2 text-13 text-text-light leading-relaxed">
                계속 받으려면 그대로 두면 되고, 그만 받으려면 아래 [수신 거부]를 누르거나 마이의 알림 설정에서 끌 수 있어.
              </p>
              <button
                type="button"
                onClick={() => setReconfirm(null)}
                className="btn btn-primary btn-lg mt-4"
              >
                그대로 둘게
              </button>
              {reconfirmFailed && (
                <p className="mt-2 text-12 text-text-light text-center">잘 안 됐어. 한 번 더 눌러 줄래?</p>
              )}
              <button
                type="button"
                onClick={() => void withdrawFromReconfirm()}
                className="btn btn-text btn-lg mt-1.5"
              >
                수신 거부
              </button>
            </div>
          </Dialog>
      )}

      {second && <PushAskSheet moment="second_launch" kind="push" ad={second.ad} onDone={() => setSecond(null)} />}
      {notice && <AdConsentNotice notice={notice} onClose={() => setNotice(null)} />}
    </>
  );
}
