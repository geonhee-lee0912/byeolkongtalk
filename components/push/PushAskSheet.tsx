"use client";

// 다시 볼 날을 뺀 알림·광고 동의 질문 시트(설계 §4-2·§4-3) — 묻는 순간마다 한 번. 앱(push 지원) 안에서만, 부르는 쪽이 띄울지 정한다.
//  - kind "push": 알림 켜기(+ 광고 미동의면 체크칸). '알림 받을래' → OS 창, '나중에' → OS 창을 띄우지 않는다(아껴 둔다)
//  - kind "ad"  : 알림은 이미 허용, 광고 동의만. 동의를 누르면 바로 기록하고 결과 통지
// 모양은 RevisitSheet 시트와 같은 틀(새 공통 틀은 만들지 않는다 — 앱 화면 손보기에서 정리).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { askAppPush } from "@/lib/app-push";
import type { AdStatus, AskKind, AskMoment } from "@/lib/push/asks";
import AdConsentCheck, { AD_CONSENT_CONTENTS, AD_CONSENT_HOW_TO_OFF, AD_CONSENT_LABEL } from "./AdConsentCheck";
import AdConsentNotice, { type ConsentNotice } from "./AdConsentNotice";
import { postAsk, setAdConsent } from "./api";

/** 순간별 질문 — 두 번째 실행은 첫 질문 시트에서 다시 볼 날만 뺀 것 */
function copy(moment: AskMoment, kind: AskKind): { title: string; sub: string } {
  if (moment === "birthday") return { title: "생일 아침에 운세 보내줄까?", sub: "생일 아침, 별콩이가 그날의 운세를 알려줄게." };
  if (moment === "byeolmaru_first") return { title: "내일 아침에도 알려줄까?", sub: "아침마다 오늘의 흐름을 별콩이가 알려줄게." };
  if (kind === "ad") return { title: "별콩이 소식도 받아볼래?", sub: "" };
  return { title: "별콩이가 알려줘도 될까?", sub: "알려줄 일이 생기면 별콩이가 알림으로 알려줄게. 알림을 켜 줘." };
}

export default function PushAskSheet({
  moment,
  kind,
  ad,
  onDone,
}: {
  moment: AskMoment;
  kind: AskKind;
  ad: AdStatus;
  onDone: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<ConsentNotice | null>(null);
  const [closed, setClosed] = useState(false);
  const busyRef = useRef(false);
  const answered = useRef(false);
  const { title, sub } = copy(moment, kind);

  function close() {
    setClosed(true);
    onDone();
  }

  async function accept() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (kind === "ad") {
        const r = await setAdConsent(true, moment);
        if (!r) {
          setFailed(true);
          return;
        }
        if (!answered.current) postAsk(moment, "ad", "accepted");
        answered.current = true;
        if (r.notice) setNotice(r.notice);
        setClosed(true);
        return;
      }
      // 앱은 이미 허용이면 창 없이 granted, 다시 못 묻는 거부면 창 없이 denied 를 돌려준다(mobile/src/push/register.ts requestPush)
      const state = await askAppPush("push.request");
      if (!state) {
        setFailed(true);
        return;
      }
      if (!answered.current) postAsk(moment, "push", state === "granted" ? "accepted" : "os_denied");
      answered.current = true;
      // 체크했으면 OS 창을 거부했어도 광고 동의는 남긴다(§4-2 표)
      if (checked && ad === "none") {
        const r = await setAdConsent(true, moment);
        if (r?.notice) setNotice(r.notice);
      }
      setClosed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function later() {
    if (busyRef.current) return;
    if (!answered.current) postAsk(moment, kind, "later");
    answered.current = true;
    close();
  }

  if (closed) {
    return notice ? (
      <AdConsentNotice
        notice={notice}
        onClose={() => {
          setNotice(null);
          onDone();
        }}
      />
    ) : null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/50 backdrop-blur-sm animate-fade-in" onClick={later}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative w-[52px] h-[52px] mb-2">
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profile.png" alt="" className="relative w-full h-full object-contain" />
          </div>
          <p className="text-[17px] font-black tracking-tight">{title}</p>
          {sub && <p className="text-[12.5px] text-text-light mt-1.5 leading-normal">{sub}</p>}
        </div>
        {kind === "push" && ad === "none" && <AdConsentCheck checked={checked} onChange={setChecked} disabled={busy} />}
        {kind === "ad" && (
          // 광고 동의만 묻는 시트 — 이름·내용·끄는 법을 그대로 보이고, 버튼이 곧 동의다(체크칸을 한 번 더 두지 않는다)
          <div className="mt-4 rounded-2xl bg-white border border-lilac-mid/35 px-3.5 py-3 text-left">
            <p className="text-[13px] font-bold">{AD_CONSENT_LABEL}</p>
            <p className="text-[11.5px] text-text-light mt-1 leading-normal">{AD_CONSENT_CONTENTS}</p>
            <p className="text-[11.5px] text-text-light mt-0.5 leading-normal">{AD_CONSENT_HOW_TO_OFF}</p>
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void accept()}
          className="block w-full mt-4 py-3.5 rounded-full text-[14px] font-bold text-white bg-eye-purple shadow-lg disabled:opacity-40"
        >
          {kind === "ad" ? "광고성 정보 수신 동의하기" : "알림 받을래"}
        </button>
        {failed && <p className="mt-2 text-[12px] text-text-light text-center">잘 안 됐어. 한 번 더 눌러 줄래?</p>}
        <button type="button" disabled={busy} onClick={later} className="block w-full mt-1.5 py-2.5 text-[13px] font-bold text-lilac-deep">
          나중에
        </button>
      </div>
    </div>,
    document.body,
  );
}
