"use client";

// 광고성 정보 수신 동의 체크칸(설계 §4-2). 🔴 비운 채로 시작한다. 이름은 "광고성 정보 수신 동의" 그대로 —
// "혜택 알림"·"마케팅 정보"·"정보 제공"으로 쓰면 동의가 무효다(pp.12–13). 기능 사용의 조건으로 걸지 않는다(애플 4.5.4).
export const AD_CONSENT_LABEL = "(선택) 광고성 정보 수신 동의 (앱 푸시)";
// 받을 광고 내용 — 지금 실제로 가는 광고 알림(lib/push/decide.ts PushKind 의 광고 3종: 아침 별 흐름 맛보기·하던 이야기 이어가기·
// 7·14일 깨우기)을 빠짐없이 적는다. 예전 글엔 이어가기·깨우기가 빠져 있었다(운영자 11-22 '동의 문구에 넣자').
// 생일 아침 운세·이벤트 소식은 아직 안 보내는 2차 종류지만 미리 적어 둔 그대로 둔다. 새 광고 종류를 만들면 여기에도 더할 것
export const AD_CONSENT_CONTENTS = "매일 아침 별 흐름 맛보기 · 하던 이야기 이어가기 · 오랜만의 안부 · 생일 아침 운세 · 이벤트 소식";
export const AD_CONSENT_HOW_TO_OFF = "언제든 마이의 알림 설정에서 끌 수 있어";

export default function AdConsentCheck({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="card mt-4 flex items-start gap-2.5 text-left cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] w-[18px] h-[18px] shrink-0 accent-eye-purple"
      />
      <span>
        <span className="block text-13 font-bold">{AD_CONSENT_LABEL}</span>
        {/* 이름·받을 내용·끄는 법은 다 보여야 한다 — 줄이지 않고 '받을 내용' 표시로 읽는 순서만 잡는다(디자인 다듬기 알림 시트 ③, 운영자 11-22) */}
        <span className="block text-12 text-text-light mt-1.5 leading-relaxed">
          <span className="font-bold text-eye-purple">받을 내용</span> {AD_CONSENT_CONTENTS}
        </span>
        <span className="block text-11 text-text-light mt-1 leading-normal">{AD_CONSENT_HOW_TO_OFF}</span>
      </span>
    </label>
  );
}
