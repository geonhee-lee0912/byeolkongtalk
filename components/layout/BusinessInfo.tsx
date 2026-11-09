// 사업자 정보 7줄 — 웹 푸터(Footer)와 앱의 약관·사업자 정보 화면(/mypage/legal)이 같이 쓴다
export default function BusinessInfo() {
  return (
    <div className="text-11 text-text-light/90 leading-loose space-y-0.5">
      <p>상호: 브레이브샤인</p>
      <p>대표자: 이건희</p>
      <p>사업자등록번호: 537-29-02059</p>
      <p>통신판매업신고번호: 2026-서울영등포-1106호</p>
      <p>주소: 서울특별시 영등포구 양평로</p>
      <p>대표전화: 0502-1924-6473</p>
      <p>이메일: oneulcard@gmail.com</p>
    </div>
  );
}
