"use client";

// 상점·충전 시트 공용 — 어디서 사는지(브라우저 = 토스 / 앱 = 스토어) 가르고, 앱이면 스토어 가격·구매를 브리지로. 스펙 2026-11-23-앱-결제 §5.
// channel: pending = 하이드레이션 첫 그림(앱인지 아직 모름 — 토스도 그리지 않는다) · toss = 브라우저(지금 그대로)
//          store = 앱 + caps iap · update = 앱인데 iap 가 없는 옛 빌드(🔴 토스도 보이면 안 된다 — 애플 3.1.1, 버튼만 막고 업데이트 안내)
import { useCallback, useEffect, useState } from "react";
import { useAppInfo } from "@/lib/use-app-info";
import { hasCap, type IapResult } from "@/lib/app-bridge/protocol";
import { askAppIapProducts, buyInApp } from "@/lib/app-iap";

export type PayChannel = "pending" | "toss" | "store" | "update";

export function useStorePurchase(pkgIds: string[]): {
  channel: PayChannel;
  /** 앱 안 스토어 결제로 산다(channel === "store") */
  inApp: boolean;
  /** id → 스토어 가격 문자열. 받기 전·못 받으면 null */
  prices: Record<string, string> | null;
  /** 가격을 끝내 못 받았다(시간 초과) — 버튼은 막고 다시 열어 달라고 */
  pricesFailed: boolean;
  /** 로그인 회원인가(앱일 때만 확인, 모르는 동안 null) — 비로그인엔 iap.buy 를 보내지 않는다 */
  signedIn: boolean | null;
  busyId: string | null;
  buy(pkgId: string): Promise<IapResult>;
} {
  const { ready, app } = useAppInfo();
  const channel: PayChannel = !ready ? "pending" : !app ? "toss" : hasCap(app, "iap") ? "store" : "update";
  const inApp = channel === "store";
  const [prices, setPrices] = useState<Record<string, string> | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const idsKey = pkgIds.join(",");

  // 스토어 가격 — 마운트마다 한 번
  useEffect(() => {
    if (!inApp) return;
    let alive = true;
    void askAppIapProducts(idsKey.split(",")).then((r) => {
      if (!alive) return;
      if (r) setPrices(r);
      else setPricesFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [inApp, idsKey]);

  useEffect(() => {
    if (!inApp) return;
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setSignedIn(!!(d?.isAuthenticated && d.user?.id));
      })
      .catch(() => {
        if (alive) setSignedIn(false);
      });
    return () => {
      alive = false;
    };
  }, [inApp]);

  const buy = useCallback(
    async (pkgId: string): Promise<IapResult> => {
      // 앱 밖·비로그인엔 부탁하지 않는다(화면은 이때 버튼을 막아 둔다) — 조용히 끝
      if (!inApp || signedIn !== true) return { productId: pkgId, ok: false, reason: "cancelled" };
      setBusyId(pkgId);
      try {
        return await buyInApp(pkgId);
      } finally {
        setBusyId(null);
      }
    },
    [inApp, signedIn],
  );

  return { channel, inApp, prices, pricesFailed, signedIn, busyId, buy };
}
