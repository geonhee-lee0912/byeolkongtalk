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
    // 🔴 오프셋은 **header 의 패딩**으로 준다(2026-09-27, 사용자 요청 "조금 오른쪽 아래로").
    //    Link 쪽 margin 이 아니라 여기인 이유: Link 는 inline-flex 라 세로 마진이 줄 박스
    //    계산과 얽히고, 링크에 pl 을 주면 탭 영역이 화면 왼쪽 끝까지 끌려간다. 패딩은 위치만 민다.
    // 🔴 그래서 `←` 는 더 이상 아래 탭 판 왼쪽 끝과 정렬되지 않는다 — 의도된 것이다.
    <header className="pl-2 pt-2">
      <Link
        href="/byeolmaru"
        // 🔴 칩(연보라 알약)이 아니라 **텍스트형**이다(2026-09-27, 사용자 결정). 바로 아래 탭
        //    내비게이션이 이미 알약 3개라, 그 위에 또 알약이 있으면 뒤로가기가 네 번째 탭처럼
        //    읽혔다. 되살리지 말 것 — 되살릴 거면 탭 쪽 모양을 같이 바꿔야 한다.
        // 🔴 링크 자체엔 왼쪽 패딩을 두지 않는다(옛 `ml-1 pl-2.5` 제거) — 위치 오프셋은 위
        //    header 의 `pl-2` 가 지고, 여기에 또 주면 탭 영역만 왼쪽으로 늘어난다.
        //    음수 마진은 여전히 안 쓴다(2026-09-24 지적).
        // 🔴 세로 패딩(py-2)은 장식이 아니라 **탭 타깃**이다 — 13px 글자만 두면 높이가 ~18px 라
        //    손가락으로 누르기 어렵다. 빼지 말 것.
        className="inline-flex items-center gap-1.5 py-2 pr-2 text-[13px] font-medium text-eye-purple transition hover:opacity-70 active:scale-[0.97]"
      >
        <span aria-hidden className="text-[15px] leading-none">←</span>
        별마루
      </Link>
    </header>
  );
}
