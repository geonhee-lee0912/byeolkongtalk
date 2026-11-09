"use client";

// 광고성 정보 수신 동의·철회 결과 통지 팝업(설계 §4-4, Q&A 07-01) — 바뀐 그 자리에서 띄운다.
// 내용: 전송자 명칭·동의/철회 사실·날짜("오늘" 아님)·처리 결과. 🔴 광고를 섞지 않는다(버튼은 '확인' 하나).
// 통지 기록(ad_consent_events 'result_notice')은 서버가 동의·철회와 같은 트랜잭션에서 남긴다.
import Dialog from "@/components/common/Dialog";

export type ConsentNotice = { kind: "grant" | "withdraw"; date: string };

export function noticeLines(n: ConsentNotice): { label: string; value: string }[] {
  return [
    { label: "전송자", value: "별콩톡" },
    { label: "내용", value: n.kind === "grant" ? "광고성 정보(앱 푸시) 수신 동의" : "광고성 정보(앱 푸시) 수신 거부(동의 철회)" },
    { label: "날짜", value: n.date },
    { label: "처리 결과", value: n.kind === "grant" ? "동의 처리됐어" : "수신 거부 처리됐어. 이제 광고 알림을 보내지 않아" },
  ];
}

export default function AdConsentNotice({ notice, onClose }: { notice: ConsentNotice; onClose: () => void }) {
  // 공통 확인창 틀(components/common/Dialog) — 법정 통지라 바깥을 눌러도 닫지 않고 [확인]으로만 닫는다
  return (
    <Dialog label="광고성 정보 수신 동의 결과 안내" role="alertdialog" dismissible={false} z={110} onClose={onClose}>
      <div className="w-full max-w-sm bg-cream rounded-3xl p-6">
        <p className="text-17 font-black tracking-tight text-center">광고성 정보 수신 {notice.kind === "grant" ? "동의" : "거부"} 안내</p>
        <dl className="mt-4 rounded-2xl bg-white border border-lilac-mid/35 px-4 py-3 text-13 leading-relaxed">
          {noticeLines(notice).map((l) => (
            <div key={l.label} className="flex gap-3 py-0.5">
              <dt className="shrink-0 w-[64px] text-text-light">{l.label}</dt>
              <dd className="font-bold">{l.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-12 text-text-light text-center">언제든 마이 → 알림 설정에서 바꿀 수 있어</p>
        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-4 py-3 rounded-full text-14 font-bold text-white bg-eye-purple"
        >
          확인
        </button>
      </div>
    </Dialog>
  );
}
