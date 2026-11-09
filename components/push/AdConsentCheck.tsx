"use client";

// 광고성 정보 수신 동의 체크칸(설계 §4-2). 🔴 비운 채로 시작한다. 이름은 "광고성 정보 수신 동의" 그대로 —
// "혜택 알림"·"마케팅 정보"·"정보 제공"으로 쓰면 동의가 무효다(pp.12–13). 기능 사용의 조건으로 걸지 않는다(애플 4.5.4).
export const AD_CONSENT_LABEL = "(선택) 광고성 정보 수신 동의 (앱 푸시)";
export const AD_CONSENT_CONTENTS = "매일 아침 별 흐름 맛보기 · 생일 아침 운세 · 이벤트 소식";
export const AD_CONSENT_HOW_TO_OFF = "언제든 마이페이지 → 알림 설정에서 끌 수 있어";

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
    <label className="mt-4 flex items-start gap-2.5 rounded-2xl bg-white border border-lilac-mid/35 px-3.5 py-3 text-left cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] w-[18px] h-[18px] shrink-0 accent-eye-purple"
      />
      <span>
        <span className="block text-13 font-bold">{AD_CONSENT_LABEL}</span>
        <span className="block text-12 text-text-light mt-1 leading-normal">{AD_CONSENT_CONTENTS}</span>
        <span className="block text-12 text-text-light mt-0.5 leading-normal">{AD_CONSENT_HOW_TO_OFF}</span>
      </span>
    </label>
  );
}
