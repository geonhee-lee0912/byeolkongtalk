"use client";

import { useRouter } from "next/navigation";

const SHIM_DATE = "2026년 6월 22일";

export default function TermsPage() {
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
        이용약관
      </h1>
      <p className="text-[11px] text-text-light text-center mb-6">
        시행일: {SHIM_DATE}
      </p>

      <div className="text-[13px] text-eye-purple leading-relaxed space-y-6">
        <Article title="제1조 (목적)">
          이 약관은 브레이브샤인(이하 &ldquo;회사&rdquo;)이 운영하는 AI 사주·타로
          상담 서비스 &lsquo;별콩톡&rsquo;(이하 &ldquo;서비스&rdquo;)을 이용함에
          있어 회사와 이용자(이하 &ldquo;회원&rdquo;)의 권리, 의무 및 책임사항을
          규정함을 목적으로 합니다.
        </Article>

        <Article title="제2조 (정의)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>&ldquo;서비스&rdquo;란 회사가 제공하는 AI 기반 사주풀이 및 타로
              카드 해석, 상담 대화, 결과 저장 및 공유 기능 일체를 의미합니다.</li>
            <li>&ldquo;회원&rdquo;이란 카카오 계정으로 본 서비스에 가입하여
              이용하는 자를 말합니다.</li>
            <li>&ldquo;별&rdquo;이란 서비스 내에서 사주·타로 리딩에 사용되는
              디지털 재화로, 결제 또는 회사가 제공하는 무료 정책에 따라
              지급됩니다.</li>
            <li>&ldquo;콘텐츠&rdquo;란 회사가 제공하는 AI 해석 텍스트, 카드
              이미지, 캐릭터 일러스트 등 모든 디지털 자료를 의미합니다.</li>
          </ol>
        </Article>

        <Article title="제3조 (약관의 게시와 변경)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 본 약관을 회원이 쉽게 알 수 있도록 서비스 화면에
              게시합니다.</li>
            <li>회사는 약관을 변경할 수 있으며, 변경 시 적용일자 7일 전부터
              공지합니다. 회원에게 불리한 변경의 경우 30일 전 공지하고 별도
              안내합니다.</li>
            <li>변경 후 회원이 서비스를 계속 이용할 경우 변경된 약관에 동의한
              것으로 봅니다.</li>
          </ol>
        </Article>

        <Article title="제4조 (이용계약의 체결)">
          이용계약은 회원이 카카오 로그인으로 가입을 신청하고 회사가 이를
          승낙함으로써 성립합니다. 회사는 다음 각 호에 해당하는 경우 가입을
          제한할 수 있습니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>가입 신청자가 본 약관 위반으로 자격을 상실한 적이 있는 경우</li>
            <li>허위 정보를 기재하거나 타인의 정보를 도용한 경우</li>
            <li>만 14세 미만의 아동이 법정대리인 동의 없이 신청하는 경우</li>
          </ol>
        </Article>

        <Article title="제5조 (회원 정보의 변경)">
          회원은 마이페이지에서 닉네임, 프로필 사진 등 본인 정보를 열람·수정할 수
          있습니다. 변경 사항을 회사에 정확히 알리지 않아 발생한 불이익에 대해
          회사는 책임지지 않습니다.
        </Article>

        <Article title="제6조 (회원의 의무)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 가입 신청 또는 정보 변경 시 허위 정보를 기재해서는 안
              됩니다.</li>
            <li>타인의 계정·정보를 도용하거나 도용을 시도해서는 안 됩니다.</li>
            <li>회사가 제공하는 콘텐츠를 무단으로 복제·배포·상업적 이용을 해서는
              안 됩니다.</li>
            <li>서비스 운영을 방해하는 행위(자동화 프로그램, 비정상 접근, 다량
              결제 후 환불 반복 등)를 해서는 안 됩니다.</li>
          </ol>
        </Article>

        <Article title="제7조 (서비스의 제공 및 변경)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 다음의 서비스를 제공합니다.
              <ul className="list-disc pl-5 mt-1">
                <li>AI 기반 사주풀이·타로 카드 해석 및 1:1 대화 상담</li>
                <li>리딩 결과 저장, 공유, 다시보기</li>
                <li>별(Star) 충전 및 사용</li>
                <li>기타 회사가 추가로 정하는 서비스</li>
              </ul>
            </li>
            <li>서비스는 연중무휴 24시간 제공을 원칙으로 하나, 시스템 점검,
              장애 등 부득이한 사유로 일시 중단될 수 있습니다.</li>
            <li>회사는 운영상·기술상 필요에 따라 서비스의 일부 또는 전부를
              변경할 수 있으며, 변경 시 사전 공지합니다.</li>
          </ol>
        </Article>

        <Article title="제8조 (별의 충전과 사용)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 회사가 정한 가격으로 별을 충전할 수 있으며, 결제 즉시
              해당 수량의 별이 계정에 지급됩니다.</li>
            <li>별은 서비스 내에서만 사용할 수 있으며 현금으로 환급되지
              않습니다(환불정책 별도).</li>
            <li>충전된 별의 이용기간과 환불가능기간은 결제시점으로부터
              <b> 1년 이내로 제한됩니다.</b> 기간 경과 시 자동 소멸됩니다.
              (별의 소멸 기한은 5년 내 가맹점 정책에 따릅니다)</li>
            <li>회사가 무료로 제공하는 보너스 별, 이벤트 별 등은 환불 대상에서
              제외됩니다.</li>
            <li>환불은 반드시{" "}
              <b>결제가 이루어진 수단</b>으로 진행됩니다.</li>
            <li>충전된 별은{" "}
              <b>회원 간 양도가 불가능</b>합니다.</li>
            <li>스프레드별 별 차감 비용 및 무료 제공 정책은 서비스 화면에서
              안내합니다.</li>
          </ol>
        </Article>

        <Article title="제9조 (환불정책)">
          별 결제에 대한 환불 가능·불가 조건, 환불 절차 및 처리 기간은 별도의{" "}
          <a
            href="/refund"
            className="text-lilac-deep underline underline-offset-2"
          >
            환불정책
          </a>
          에서 정하는 바를 따릅니다.
        </Article>

        <Article title="제10조 (저작권 및 콘텐츠 이용)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>서비스 내 모든 콘텐츠(AI 해석 텍스트, 캐릭터 이미지, UI 요소
              등)에 대한 저작권은 회사 및 정당한 권리자에게 있습니다.</li>
            <li>회원은 회사의 사전 동의 없이 콘텐츠를 영리 목적으로 사용하거나
              제3자에게 양도, 판매할 수 없습니다.</li>
            <li>회원이 서비스 내에 게시·입력한 정보(고민 텍스트 등)의
              저작권은 회원 본인에게 귀속됩니다. 단, 회사는 서비스 운영 및
              개선 목적으로 비식별화 처리하여 활용할 수 있습니다.</li>
          </ol>
        </Article>

        <Article title="제11조 (서비스의 성격 및 면책)">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>본 서비스는 <b>엔터테인먼트 및 자기성찰을 위한 도구</b>이며,
              제공되는 사주·타로 해석과 AI 대화는 오락·위로·자기 탐색을 위한 참고
              자료입니다. 점술·예언·의료·법률·재무·심리치료 조언이 아닙니다.</li>
            <li>본 서비스는 <b>정신건강 진단·치료·위기 상담을 대체하지
              않습니다.</b> 자살·자해 충동, 심각한 우울, 학교폭력·가정폭력·성폭력
              피해, 약물·알코올 의존 등 위기 상황에서는 즉시 아래 전문기관에
              연락하시기 바랍니다.
              <ul className="list-disc pl-5 mt-1.5 space-y-0.5 text-text-light">
                <li>자살예방상담전화: <b>109</b> (24시간 무료)</li>
                <li>정신건강위기상담: <b>1577-0199</b></li>
                <li>청소년 사이버상담: <b>1388</b> (학교폭력 포함)</li>
                <li>여성긴급전화: <b>1366</b> (가정폭력)</li>
                <li>해바라기센터: <b>1899-3075</b> (성폭력)</li>
                <li>마약퇴치본부: <b>1342</b></li>
              </ul>
            </li>
            <li>회사는 AI가 생성하는 해석의 정확성·신뢰성·적합성을 보증하지
              않으며, 회원이 해석에 의존하여 내린 결정으로 발생한 결과에 대해
              책임지지 않습니다.</li>
            <li>회사는 천재지변, 전시, 정전, 통신사·결제대행사 장애 등
              불가항력으로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
          </ol>
        </Article>

        <Article title="제11조의2 (위기 상황 감지 및 안내)">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>회사는 회원의 안전을 위해 대화 내 자살·자해·학교폭력·가정폭력·
              성폭력·약물 등 위기 시그널이 의심되는 표현을 자동으로 감지할 수
              있습니다.</li>
            <li>위기 시그널이 감지되면 서비스는 즉시 화면에 전문기관 연락처를
              표시하며, 해당 대화는 공유·이미지 저장 기능이 자동으로
              비활성화됩니다.</li>
            <li>감지된 사실은 회원의 안전과 운영자 검토를 위해 <b>익명화된
              형태</b>로 기록될 수 있으며, 자세한 내용은 개인정보처리방침
              제5조의2(위기 시그널 감지 시 처리)에서 확인할 수 있습니다.</li>
            <li>운영자는 심각도가 매우 높다고 판단되는 경우(예: 즉시적인
              자해·타해 위험), 회원 보호와 공익적 사유에 한해 관련 법령이
              허용하는 범위 내에서 수사기관·전문 상담기관 등 연계 기관에
              전달할 수 있습니다.</li>
            <li>본 조의 처리는 회원의 안전을 보호하기 위한 최소한의 조치이며,
              일상적 대화 모니터링이나 콘텐츠 검열을 의미하지 않습니다.</li>
          </ol>
        </Article>

        <Article title="제12조 (계약 해지 및 이용 제한)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 마이페이지의 회원 탈퇴 메뉴를 통해 언제든 계약을 해지할
              수 있습니다. 탈퇴 시 회원 정보 및 리딩 기록은 즉시 삭제되며,
              잔여 별은 환불정책의 환불 가능 조건을 충족하는 경우에 한하여
              환불 가능합니다.</li>
            <li>회사는 회원이 본 약관 또는 관련 법령을 위반하는 경우, 사전
              통지 후 서비스 이용을 제한하거나 계약을 해지할 수 있습니다.
              긴급한 경우 사후 통지로 갈음할 수 있습니다.</li>
          </ol>
        </Article>

        <Article title="제13조 (분쟁의 해결)">
          본 약관에 명시되지 않은 사항은 전자상거래등에서의 소비자보호에 관한
          법률, 약관의 규제에 관한 법률 등 관계 법령에 따릅니다. 분쟁 발생 시
          회사와 회원은 상호 신의에 따라 원만한 해결을 위해 노력하며, 협의가
          이루어지지 않을 경우 회사 본점 소재지를 관할하는 법원(서울남부지방법원)을
          제1심 관할 법원으로 합니다.
        </Article>

        <Article title="제14조 (문의)">
          서비스 이용 관련 문의는 다음 연락처로 보내주시기 바랍니다.
          <p className="mt-2">이메일: oneulcard@gmail.com</p>
          <p>대표전화: 010-7456-6473</p>
        </Article>

        <p className="text-[12px] text-text-light pt-6 border-t border-lilac-soft/40">
          부칙: 본 약관은 {SHIM_DATE}부터 시행됩니다.
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
