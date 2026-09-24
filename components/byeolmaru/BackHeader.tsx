import Link from "next/link";

// 별마루 서브 라우트(saju·tarot·woori) 공통 상단 — **뒤로가기 하나만** 한다.
// 🔴 타이틀을 뺐다(2026-09-24). font-display 24px 타이틀이 바로 아래 카드의 하루 이름(21px)과
//    크기가 비슷해 뭐가 제목인지 둘이 다퉜고, 화면 정체성은 카드가 이미 다 말한다(간지·하루
//    이름·등급·날짜). 덤으로 사주의 "오늘 사주" 하드코딩이 사라져 **과거 날짜를 열어도 오늘이라고
//    우기던 문제**가 같이 풀렸다 — 되살릴 거면 그 거짓말도 같이 돌아온다는 걸 알고 할 것.
// 🔴 화살표만 두지 않고 목적지를 쓴다 — 예전엔 그 정보가 aria-label 에만 있어 시각 사용자만
//    어디로 가는지 몰랐다. 이제 둘이 같은 말을 한다.
export default function BackHeader() {
  return (
    <header>
      <Link
        href="/byeolmaru"
        className="-ml-1 inline-flex items-center gap-1.5 rounded-full bg-lilac-soft/70 py-1.5 pl-2.5 pr-3 text-[13px] font-medium text-eye-purple transition active:scale-[0.97]"
      >
        <span aria-hidden className="text-[15px] leading-none">←</span>
        별마루
      </Link>
    </header>
  );
}
