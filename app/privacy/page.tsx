"use client";

import { useRouter } from "next/navigation";

const SHIM_DATE = "2026년 10월 26일";

// 제6조의2 국외 이전 — 개인정보 보호법 제28조의8 제2항 항목(받는 곳·국가·항목·시기와 방법·목적·보관 기간).
// AI 업체·모델이나 호스팅을 바꾸면 이 목록과 제6조 위탁 표를 같이 고칠 것.
const OVERSEAS_TRANSFERS = [
  {
    to: "OpenAI (dsar@openai.com)",
    country: "미국",
    items:
      "고민·대화 내용, 감정 태그, 뽑은 카드, 사주 간지·성별·나이, 궁합·연애 상담 시 입력한 이름 또는 호칭",
    purpose: "AI 상담·운세 풀이 생성",
    period: "업체 정책에 따라 최대 30일 보관 후 삭제 (모델 학습에 쓰지 않음)",
  },
  {
    to: "Anthropic, PBC (privacy@anthropic.com)",
    country: "미국",
    items: "AI 처리에 필요한 메시지 내용 (위기 표현 판정, 대화 요약 등)",
    purpose: "AI 보조 처리 (위기 표현 2차 판정, 대화 요약 등)",
    period:
      "업체 정책에 따라 30일 안에 삭제 (업체 이용정책 위반으로 분류되면 최대 2년)",
  },
  {
    to: "Vercel Inc. (privacy@vercel.com)",
    country: "미국 등",
    items: "서비스 이용 중 주고받는 정보 (요청 내용, 접속 기록)",
    purpose: "웹 서비스 호스팅",
    period: "위탁 계약 종료 시까지 (로그는 업체 정책에 따름)",
  },
];

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <div className="w-full max-w-md mx-auto px-5 pt-3 pb-16 animate-fade-in">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors mb-2"
      >
        <ArrowLeft />
        <span>뒤로</span>
      </button>

      <h1 className="font-display text-[28px] text-eye-purple text-center mb-1 tracking-wide">
        개인정보처리방침
      </h1>
      <p className="text-[11px] text-text-light text-center mb-6">
        시행일: {SHIM_DATE}
      </p>

      <div className="text-[13px] text-eye-purple leading-relaxed space-y-6">
        <p className="text-[12.5px] text-text-light leading-[1.7]">
          브레이브샤인(이하 &ldquo;회사&rdquo;, 서비스명: 별콩톡)는 「개인정보 보호법」 및 「정보통신망
          이용촉진 및 정보보호 등에 관한 법률」에 따라 회원의 개인정보를
          소중히 여기며, 다음과 같이 개인정보처리방침을 수립하여 공개합니다.
        </p>

        <Article title="제1조 (수집하는 개인정보 항목)">
          회사는 다음 정보를 수집합니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li><b>회원 가입 시</b>: 카카오 계정 식별자, 닉네임, 프로필 이미지
              URL</li>
            <li><b>서비스 이용 시</b>: 입력한 고민 텍스트, 선택한 감정 태그,
              생년월일·태어난 시·성별(사주풀이), 뽑은 카드(타로), AI 대화 내용</li>
            <li><b>궁합·연애 상담 이용 시</b>: 회원이 입력한 본인과
              상대방(지인 포함)의 이름 또는 호칭, 생년월일, 태어난 시, 성별,
              관계 분류</li>
            <li><b>비회원(게스트) 무료 서비스 이용 시</b>: 표시 이름,
              생년월일, 지정한 관계 분류(예: 인연 별자리 참여)</li>
            <li><b>결제 시</b>: 결제 수단(카드사명·일부 마스킹된 번호 등),
              결제 일시, 결제 금액, 결제대행사(PG사) 거래 ID</li>
            <li><b>자동 수집</b>: 접속 IP, 쿠키(세션/익명 식별, 광고 성과
              측정), 기기·브라우저 정보, 접속 일시, 유입 경로(광고 클릭
              식별자, UTM 등)</li>
          </ol>
          <p className="mt-2 text-text-light">
            ※ 다른 사람의 정보를 입력할 때는 그 사람에게 먼저 알려 주세요.
          </p>
        </Article>

        <Article title="제2조 (개인정보 수집 방법)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>카카오 소셜 로그인 동의 절차</li>
            <li>회원 또는 비회원(게스트)이 직접 입력 (고민 텍스트, 생년월일시,
              무료 서비스 참여 정보, 채팅 메시지 등)</li>
            <li>결제 진행 시 결제대행사(PG사) 연동</li>
            <li>쿠키, 로그 등을 통한 자동 수집</li>
          </ol>
        </Article>

        <Article title="제3조 (개인정보의 이용 목적)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원 식별 및 본인 확인, 부정 이용 방지</li>
            <li>AI 사주·타로 해석 서비스 제공 및 대화 맥락 유지</li>
            <li>결제·환불 처리, 별(Star) 잔액 관리</li>
            <li>고객 문의 응대 및 분쟁 해결</li>
            <li>서비스 개선을 위한 통계 분석(비식별화 처리)</li>
          </ol>
        </Article>

        <Article title="제4조 (개인정보의 보유 및 이용 기간)">
          회원의 개인정보는 회원 탈퇴 시까지 보유하며, 탈퇴 시 즉시 파기합니다.
          단, 관계 법령에 따라 다음 정보는 정해진 기간 동안 보관합니다.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>계약·청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
            <li>대금결제 및 재화 공급 기록: 5년 (전자상거래법)</li>
            <li>소비자 불만·분쟁 처리 기록: 3년 (전자상거래법)</li>
            <li>서비스 접속 로그: 3개월 (통신비밀보호법)</li>
          </ul>
          <p className="mt-3">
            또한 부정 이용 방지(재가입 혜택 중복 수령 방지)와 서비스 통계를
            위해, 탈퇴 시 로그인 수단 식별자를 되돌릴 수 없게 바꾼 값(해시)과
            혜택 수령 기록, 가입 경로 정보(UTM 등)를 탈퇴 후 1년간 보관한 뒤
            파기합니다.
          </p>
          <p className="mt-3 text-text-light">
            비회원(게스트)이 무료 서비스(인연 별자리 등)에서 입력한 정보(표시
            이름·생년월일·관계 분류)는 해당 이용자 또는 별자리 소유자가
            삭제하거나, 이용자가 이메일로 삭제를 요청하는 즉시 파기합니다.
          </p>
        </Article>

        <Article title="제5조 (제3자 제공)">
          회사는 회원의 개인정보를 제1조의 이용 목적 범위 내에서만 처리하며,
          원칙적으로 제3자에게 제공하지 않습니다. 다만 다음의 경우 예외로
          합니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>회원이 사전에 동의한 경우</li>
            <li>법령의 규정에 따라 적법한 절차로 요구받은 경우</li>
            <li>회원 본인 또는 제3자의 생명·신체에 대한 급박한 위험을 방지하기
              위해 필요한 경우 (제5조의2 참조)</li>
          </ol>
        </Article>

        <Article title="제5조의2 (위기 시그널 감지 시 처리)">
          <p>
            본 서비스는 엔터테인먼트·자기성찰 도구이며 정신건강 상담을 대체하지
            않습니다. 다만 회원의 안전을 위해 다음과 같이 위기 시그널을 감지하고
            기록할 수 있습니다.
          </p>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">1. 감지 항목</p>
            <ul className="list-disc pl-5 space-y-0.5 text-text-light">
              <li>자살·자해</li>
              <li>학교폭력·따돌림</li>
              <li>가정폭력·아동학대</li>
              <li>성폭력·성희롱</li>
              <li>약물·알코올 의존</li>
            </ul>
          </div>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">2. 감지 방식</p>
            <p className="text-text-light">
              회원이 입력한 메시지 중 위 항목에 해당할 가능성이 있는 표현을
              자동으로 분류합니다. 일상적 대화에 대한 모니터링은 수행하지
              않으며, 분류 결과는 기계적·자동적으로만 처리됩니다.
            </p>
          </div>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">
              3. 기록되는 정보 (익명화)
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-text-light">
              <li>해당 메시지의 일부 발췌 (최대 500자)</li>
              <li>매칭된 키워드</li>
              <li>위기 카테고리 및 심각도</li>
              <li>회원 식별자 (UUID 또는 익명 식별자)</li>
              <li>감지 일시</li>
            </ul>
            <p className="text-text-light mt-1.5">
              ※ 회원의 실명·전화번호·주소 등 직접 식별 정보는 기록되지
              않습니다.
            </p>
          </div>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">4. 이용 목적</p>
            <ul className="list-disc pl-5 space-y-0.5 text-text-light">
              <li>회원에게 즉시 전문기관 연락처 안내 (자살예방상담전화 109 등)</li>
              <li>해당 대화의 공유·이미지 저장 자동 비활성화</li>
              <li>운영자의 안전성 검토 및 후속 조치</li>
              <li>서비스의 위기 대응 품질 개선</li>
            </ul>
          </div>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">
              5. 외부 기관 연계
            </p>
            <p className="text-text-light">
              심각도가 매우 높다고 판단되는 경우(예: 즉시적인 자해·타해 위험,
              현재 진행 중인 폭력 피해 등), 회사는 회원 본인 또는 제3자의
              생명·신체에 대한 급박한 위험을 방지하기 위해 「개인정보 보호법」
              제18조 제2항이 허용하는 범위 내에서 다음 기관에 정보를 제공할
              수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-text-light mt-1.5">
              <li>수사기관 (생명·신체에 대한 급박한 위험 시)</li>
              <li>전문 상담기관 (해바라기센터, 청소년상담복지센터 등)</li>
              <li>아동·여성 보호기관</li>
            </ul>
            <p className="text-text-light mt-1.5">
              ※ 외부 기관 연계는 일상적 대화에 적용되지 않으며, 운영자의
              검토를 거쳐 회원 보호를 위한 최소한의 범위로 제한됩니다.
            </p>
          </div>

          <div className="mt-3">
            <p className="font-bold text-[12.5px] mb-1.5">6. 보유 기간</p>
            <p className="text-text-light">
              감지 기록은 안전성 검토 및 서비스 품질 개선을 위해 최대 1년간
              보관 후 자동 파기됩니다. 회원 탈퇴 시 즉시 익명 처리되거나
              파기됩니다.
            </p>
          </div>
        </Article>

        <Article title="제6조 (처리 위탁)">
          회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를
          위탁하고 있습니다.
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-cream/60 text-left">
                  <th className="px-2 py-1.5 border border-lilac-soft/60 font-bold">수탁사</th>
                  <th className="px-2 py-1.5 border border-lilac-soft/60 font-bold">위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">Supabase Inc.</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">데이터베이스 호스팅 및 관리 (보관 위치: 대한민국 서울)</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">Vercel Inc.</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">웹 서비스 호스팅</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">OpenAI</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">AI 상담·운세 풀이 생성</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">Anthropic, PBC</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">AI 보조 처리 (위기 표현 2차 판정, 대화 요약 등)</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">토스페이먼츠㈜</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">결제 처리 및 결제 정보 보관</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">㈜카카오</td>
                  <td className="px-2 py-1.5 border border-lilac-soft/60">소셜 로그인 인증 및 프로필 정보 제공</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-text-light/80">
            ※ 해외 업체로의 개인정보 이전은 제6조의2에서 안내합니다.
          </p>
        </Article>

        <Article title="제6조의2 (개인정보의 국외 이전)">
          회사는 회원과 맺은 서비스 이용계약을 이행하기 위해 아래와 같이
          개인정보 처리를 해외 업체에 위탁하고 있으며, 「개인정보 보호법」
          제28조의8 제1항 제3호에 따라 다음 사항을 공개합니다.
          <div className="mt-3 space-y-2">
            {OVERSEAS_TRANSFERS.map((t) => (
              <div
                key={t.to}
                className="px-3 py-2 border border-lilac-soft/60 rounded-xl text-[12px]"
              >
                <p className="font-bold">{t.to}</p>
                <ul className="mt-1 space-y-0.5 text-text-light">
                  <li>이전 국가: {t.country}</li>
                  <li>이전 항목: {t.items}</li>
                  <li>이전 시기·방법: 서비스를 이용할 때마다 암호화된 네트워크로 전송</li>
                  <li>이용 목적: {t.purpose}</li>
                  <li>보관 기간: {t.period}</li>
                </ul>
              </div>
            ))}
          </div>
          <ul className="list-disc pl-5 mt-3 space-y-1">
            <li>회원 식별자, 카카오 닉네임, 연락처는 AI 업체에 보내지
              않습니다. 생년월일은 날짜 그대로가 아니라 사주 간지와 나이로
              바꿔 보냅니다.</li>
            <li><b>거부 방법·절차·효과</b>: 개인정보 보호책임자
              (oneulcard@gmail.com)에게 국외 이전 거부를 요청할 수 있습니다.
              다만 위 이전은 AI 해석과 서비스 운영에 꼭 필요하므로, 거부하면
              서비스를 이용할 수 없습니다. 회원 탈퇴로 저장된 정보를 모두
              지울 수 있습니다.</li>
          </ul>
        </Article>

        <Article title="제7조 (회원의 권리와 행사 방법)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 마이페이지에서 본인 정보를 언제든 열람·수정할 수
              있으며, 회원 탈퇴 메뉴를 통해 모든 정보의 삭제를 요청할 수
              있습니다.</li>
            <li>탈퇴 시 카카오 계정 연결도 함께 해제(unlink)됩니다.</li>
            <li>이메일(oneulcard@gmail.com)을 통해서도 열람·정정·삭제·처리정지
              요청이 가능합니다.</li>
          </ol>
        </Article>

        <Article title="제7조의2 (만 14세 미만 아동의 개인정보)">
          본 서비스는 만 14세 이상 이용자를 대상으로 합니다. 회사는 만 14세
          미만 아동의 개인정보를 원칙적으로 수집하지 않으며, 만 14세 미만임이
          확인된 경우 법정대리인의 동의 없이 수집된 정보는 지체 없이
          파기합니다. 법정대리인은 아동의 개인정보에 대한
          열람·정정·삭제·처리정지를 언제든 요청할 수 있습니다.
        </Article>

        <Article title="제8조 (쿠키의 사용)">
          회사는 회원의 로그인 상태 유지와 게스트 식별, 광고 성과 측정을 위해
          다음 쿠키를 사용합니다.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><b>byeolkong_anon_id</b>: 익명 식별자 (HttpOnly, Secure, SameSite=Lax)</li>
            <li><b>byeolkong_user_id</b>: 카카오 로그인 후 회원 식별자 (HttpOnly,
              Secure, SameSite=Lax)</li>
            <li><b>_fbp, _fbc</b>: Meta 광고 성과 측정 쿠키 (제8조의2 참고)</li>
          </ul>
          <p className="mt-2">
            또한 서비스 개선을 위해 방문한 페이지 경로와 유입 경로를 위 익명
            식별자 기준으로 기록합니다.
          </p>
          <p className="mt-2">
            회원은 브라우저 설정을 통해 쿠키를 차단할 수 있으나, 일부 기능
            이용에 제한이 있을 수 있습니다.
          </p>
        </Article>

        <Article title="제8조의2 (행태정보의 수집·이용·제공 및 거부)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 광고 성과를 측정하고 광고를 최적화하기 위해 다음
              행태정보를 처리합니다.
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-text-light">
                <li>항목: 방문한 페이지 주소와 시각, 주요 이용 기록(회원가입,
                  생년월일 첫 입력, 결제 화면 진입, 무료 체험 시작, 결제와 결제
                  금액), 광고 클릭 식별자, 광고 측정 쿠키(_fbp·_fbc), 접속 IP,
                  브라우저 정보</li>
                <li>방법: 웹사이트에 설치된 Meta 픽셀이 방문 기록을 자동으로
                  수집합니다. 주요 이용 기록은 회사 서버가 Meta 전환 API로
                  보내며, 이때 회원 식별자는 되돌릴 수 없는 값(해시)으로 바꿔
                  보냅니다.</li>
                <li>받는 곳: Meta Platforms, Inc. (미국)</li>
                <li>보관 기간: 회사는 유입 기록을 회원 탈퇴 시까지
                  보관합니다(탈퇴 후 보관은 제4조). Meta 쪽 보관은 Meta 정책에
                  따릅니다.</li>
              </ul>
            </li>
            <li>거부 방법
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-text-light">
                <li>브라우저에서 쿠키를 차단하거나 추적 방지 기능을 켜면 수집이
                  제한됩니다.</li>
                <li>Meta(페이스북·인스타그램) 계정의 광고 설정에서, 광고 파트너
                  활동 정보를 맞춤형 광고에 쓰지 않도록 설정할 수 있습니다.</li>
              </ul>
            </li>
          </ol>
        </Article>

        <Article title="제9조 (개인정보의 안전성 확보 조치)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>전송 구간 암호화(HTTPS/TLS)</li>
            <li>비밀번호 등 민감 인증 정보 미저장(카카오 OAuth 토큰만 사용)</li>
            <li>개인정보 처리 인원의 최소화 및 접근 권한 관리</li>
            <li>데이터베이스 접근 통제 및 정기 점검</li>
          </ol>
        </Article>

        <Article title="제10조 (개인정보 보호책임자)">
          <p>성명: 이건희</p>
          <p>직책: 대표</p>
          <p>이메일: oneulcard@gmail.com</p>
          <p>대표전화: 0502-1924-6473</p>
        </Article>

        <Article title="제11조 (권익침해 구제 방법)">
          개인정보 침해에 대한 신고 및 상담이 필요한 경우 아래 기관에
          문의하실 수 있습니다.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>개인정보침해신고센터 (privacy.go.kr / 국번없이 182)</li>
            <li>개인정보분쟁조정위원회 (kopico.go.kr / 1833-6972)</li>
            <li>대검찰청 사이버수사과 (spo.go.kr / 02-3480-3573)</li>
            <li>경찰청 사이버수사국 (ecrm.cyber.go.kr / 국번없이 182)</li>
          </ul>
        </Article>

        <Article title="제12조 (개인정보처리방침의 변경)">
          본 방침은 법령, 정책 또는 보안 기술의 변경에 따라 수정될 수
          있으며, 변경 시 시행 7일 전부터 서비스 화면에 공지합니다. 회원에게
          중대한 영향을 미치는 변경의 경우 30일 전 공지합니다.
        </Article>

        <p className="text-[12px] text-text-light pt-6 border-t border-lilac-soft/40">
          부칙: 본 방침은 {SHIM_DATE}부터 시행됩니다.
        </p>
      </div>
    </div>
  );
}

function Article({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[14px] font-bold text-eye-purple mb-1.5">{title}</h2>
      <div className="text-eye-purple/95 text-[12.5px] leading-[1.7]">
        {children}
      </div>
    </section>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="11.5 3 5 9 11.5 15" />
    </svg>
  );
}
