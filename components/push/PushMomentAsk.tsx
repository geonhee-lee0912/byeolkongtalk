"use client";

// 묻는 순간 하나를 맡는다 — 앱(push 지원) 안에서, 서버가 이 순간에 물을 게 있다고 할 때만 시트를 띄운다(설계 §4-3).
// 별마루 오늘 흐름을 처음 볼 때(byeolmaru_first), 생일을 넣거나 사주를 처음 볼 때(birthday), 두 번째 실행(second_launch, PushGate)
import { useEffect, useState } from "react";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { useAppInfo } from "@/lib/use-app-info";
import type { AdStatus, AskKind, AskMoment } from "@/lib/push/asks";
import PushAskSheet from "./PushAskSheet";
import { fetchAsk } from "./api";

export default function PushMomentAsk({ moment }: { moment: AskMoment }) {
  const { ready } = useAppInfo();
  const [ask, setAsk] = useState<{ kind: AskKind; ad: AdStatus } | null>(null);

  useEffect(() => {
    if (!ready || !appSupportsPush()) return;
    let cancelled = false;
    void (async () => {
      const os = await askAppPush("push.status");
      if (!os || cancelled) return;
      const r = await fetchAsk(moment, os);
      if (!cancelled && r?.ask) setAsk({ kind: r.ask, ad: r.ad });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, moment]);

  if (!ask) return null;
  return <PushAskSheet moment={moment} kind={ask.kind} ad={ask.ad} onDone={() => setAsk(null)} />;
}
