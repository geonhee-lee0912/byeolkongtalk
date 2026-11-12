// 사업자 정보 — 웹 푸터(Footer)와 앱의 약관·사업자 정보 화면(/mypage/legal)이 같이 쓴다
// 묶어서 5줄(디자인 다듬기 ② 홈 푸터, 운영자 A안 11-12). 법정 표시 항목(전자상거래법 제10조)은 다 펼쳐 둔다 — 접지 않는다
export default function BusinessInfo() {
  return (
    <div className="text-11 text-text-light leading-relaxed">
      <p>상호 브레이브샤인 · 대표 이건희</p>
      <p>사업자등록번호 537-29-02059</p>
      <p>통신판매업 2026-서울영등포-1106호</p>
      <p>서울특별시 영등포구 양평로</p>
      <p>0502-1924-6473 · oneulcard@gmail.com</p>
    </div>
  );
}
