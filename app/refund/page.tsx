"use client";

import { useRouter } from "next/navigation";

const SHIM_DATE = "2026년 6월 22일";

export default function RefundPage() {
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
        환불정책
      </h1>
      <p className="text-[11px] text-text-light text-center mb-6">
        시행일: {SHIM_DATE}
      </p>

      <div className="text-[13px] text-eye-purple leading-relaxed space-y-6">
        <p className="text-[12.5px] text-text-light leading-[1.7]">
          브레이브샤인(이하 &ldquo;회사&rdquo;, 서비스명: 별콩톡)는 회원이 결제한 별(Star)에 대해 다음과
          같이 환불정책을 운영합니다. 본 정책은 「전자상거래등에서의
          소비자보호에 관한 법률」 및 「콘텐츠산업진흥법」에 근거합니다.
        </p>

        <Article title="제1조 (환불 가능한 경우)">
          다음 중 하나에 해당하는 경우 환불이 가능합니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li><b>미사용 별 환불</b>: 결제일로부터 7일 이내이며 충전한 별을
              <u>전혀 사용하지 않은 경우</u> 결제 금액 전액 환불.</li>
            <li><b>서비스 장애</b>: 회사의 귀책사유로 서비스를 정상적으로
              이용하지 못한 경우 사용 분량을 제외한 금액 환불.</li>
            <li><b>중복 결제</b>: 동일 상품이 중복 결제된 경우 중복분 즉시 환불.</li>
            <li><b>법령상 청약철회</b>: 콘텐츠 제공이 개시되지 않은 결제분에
              대해 결제일로부터 7일 이내 청약철회 가능(전자상거래법 제17조).</li>
          </ol>
        </Article>

        <Article title="제2조 (환불 불가한 경우)">
          다음 중 하나에 해당하는 경우 환불이 제한됩니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li><b>이미 사용된 별</b>: 사주·타로 리딩 진행 등에 사용된 별은 환불
              대상에서 제외됩니다(콘텐츠 제공이 개시된 것으로 봄).</li>
            <li><b>일부 사용된 패키지</b>: 충전한 별 중 일부라도 사용한 경우
              미사용분에 대한 부분 환불은 불가합니다.</li>
            <li><b>보너스 별·이벤트 별</b>: 회사가 무상으로 지급한 별
              (가입 보너스, 이벤트 지급분 등)은 환불 대상이 아닙니다.</li>
            <li><b>유효기간 만료</b>: 충전된 별의 이용기간과 환불가능기간은
              <b>결제시점으로부터 1년 이내로 제한되며</b>, 기간 경과 시
              자동 소멸된 별은 환불되지 않습니다. (별의 소멸 기한은 5년 내
              가맹점 정책에 따릅니다)</li>
            <li><b>결제일 7일 경과</b>: 결제일로부터 7일이 지난 경우, 미사용
              상태라 하더라도 환불이 제한될 수 있습니다(소비자보호법상
              디지털콘텐츠 청약철회 기간).</li>
            <li><b>회원 간 양도</b>: 충전된 별은 <b>회원 간 양도가 불가능</b>하며,
              양도·매매·증여 등을 통해 이전된 별에 대한 환불은 처리되지
              않습니다.</li>
          </ol>
        </Article>

        <Article title="제3조 (환불 신청 방법)">
          환불을 원하시는 회원은 아래 이메일로 다음 정보를 보내주시기 바랍니다.
          <div className="mt-3 px-4 py-3 rounded-2xl bg-cream/50 border border-lilac-soft/60">
            <p className="font-bold mb-1.5">📧 oneulcard@gmail.com</p>
            <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
              <li>회원 카카오 닉네임</li>
              <li>가입 이메일 (선택)</li>
              <li>결제 일시 및 금액</li>
              <li>환불 사유</li>
              <li>환불받을 계좌 정보 (은행명, 계좌번호, 예금주)</li>
            </ul>
          </div>
        </Article>

        <Article title="제4조 (환불 처리 기간)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>환불 신청 접수 후 영업일 기준 <b>3~5일 이내</b> 환불 가능 여부를
              안내합니다.</li>
            <li>환불 승인 후 영업일 기준 <b>3~7일 이내</b> 환불을 처리합니다.</li>
            <li>카드 결제의 경우 카드사 사정에 따라 환불 반영이 영업일 기준
              7~14일 정도 소요될 수 있습니다.</li>
          </ol>
        </Article>

        <Article title="제5조 (환불 금액 산정)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>환불은 실제 결제 금액을 기준으로 합니다.</li>
            <li>할인·프로모션이 적용된 결제건은 할인 후 결제 금액 기준으로
              환불됩니다.</li>
            <li>결제대행사 수수료, 환급 송금 비용은 환불액에서 차감될 수
              있습니다.</li>
            <li>환불은 반드시 <b>결제가 이루어진 수단</b>으로 진행되며,
              부득이한 사유로 동일 수단 환불이 불가능한 경우에 한하여 회원이
              지정한 계좌로 입금됩니다.</li>
          </ol>
        </Article>

        <Article title="제6조 (결제 취소)">
          결제 직후 별이 지급되기 전에 결제 자체를 취소하고자 하는 경우,
          결제 수단의 취소 기능을 이용하시거나 즉시 고객센터(이메일)로
          연락해주시기 바랍니다. 별이 이미 지급된 후에는 본 환불정책의
          절차를 따릅니다.
        </Article>

        <Article title="제7조 (기간제 이용권)">
          기간 단위로 제공되는 이용권(예: 우리 사이 패스)에는 다음이 적용됩니다.
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li><b>이용 개시 전</b>: 구매 후 대화 등 서비스 이용을 시작하지 않은 경우,
              사용한 별 전액이 잔액으로 반환됩니다.</li>
            <li><b>이용 개시 후</b>: 첫 이용이 발생한 시점부터 기간제 디지털 콘텐츠
              제공이 개시된 것으로 보아 반환이 제한됩니다.</li>
            <li><b>서비스 장애</b>: 회사의 귀책사유로 이용권 기간 중 서비스를
              이용하지 못한 경우, 해당 기간만큼의 이용기간 연장 또는 일할 계산한
              별 반환 중 선택할 수 있습니다.</li>
            <li>이용권 구매에 사용된 별의 현금 환불은 제1조·제2조를 따릅니다.</li>
          </ol>
        </Article>

        <Article title="제8조 (회원 탈퇴 시 잔여 별)">
          회원 탈퇴 시점에 보유 중인 잔여 별은 환불 가능 조건(제1조)을
          충족하는 경우에 한해 환불 신청이 가능합니다. 별도 환불 신청 없이
          탈퇴할 경우 잔여 별은 자동 소멸되며 회복되지 않습니다.
        </Article>

        <Article title="제9조 (분쟁 해결)">
          환불 관련 분쟁이 발생하는 경우, 「전자상거래등에서의 소비자보호에
          관한 법률」 및 공정거래위원회 표준약관, 「콘텐츠 분쟁조정위원회」
          규정에 따라 해결합니다.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>한국소비자원 (www.kca.go.kr / 1372)</li>
            <li>콘텐츠분쟁조정위원회 (www.kcdrc.kr / 1588-2701)</li>
            <li>공정거래위원회 (www.ftc.go.kr / 044-200-4114)</li>
          </ul>
        </Article>

        <Article title="제10조 (문의)">
          환불 및 결제 관련 문의는 다음 연락처로 부탁드립니다.
          <p className="mt-2">이메일: oneulcard@gmail.com</p>
          <p>대표전화: 0502-1924-6473</p>
          <p>처리 시간: 평일 10:00 ~ 18:00 (주말·공휴일 제외)</p>
        </Article>

        <p className="text-[12px] text-text-light pt-6 border-t border-lilac-soft/40">
          부칙: 본 환불정책은 {SHIM_DATE}부터 시행됩니다.
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
