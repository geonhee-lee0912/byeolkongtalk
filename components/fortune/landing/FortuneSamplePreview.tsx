// 시각 3종의 샘플 영역 — 실제 렌더러에 고정 더미를 먹여 잘라 보여준다.
// 🔴 실물을 보여주되 "예시"임이 화면에 드러나야 한다(라벨은 호출부 FortuneLandingSections 가 붙인다).
// 오행 차트만 더미가 아니라 진짜다 — 가상 명식을 calcSaju 로 계산해 넣는다(결정론·비용 0).
import type { ReactNode } from "react";
import { calcSaju } from "@/lib/saju/calc";
import ElementChart from "@/components/fortune/ElementChart";
import ReportCardView from "@/components/fortune/ReportCardView";
import LifeGraphView from "@/components/fortune/LifeGraphView";
import type { LandingKey } from "@/lib/fortune/outline";
import type { ReportCardReport } from "@/lib/fortune/report-card-report";
import type { LifeGraphReport } from "@/lib/fortune/life-graph-report";

/** 랜딩 샘플 전용 가상 인물 — 카피(data/fortune/landing.ts)의 발췌와 같은 사람이다.
 *  1996-04-12 07:30 → 기묘일·기토, 오행 토4·수2·목1·화1·금0. */
const SAMPLE_SAJU = calcSaju({ year: 1996, month: 4, day: 12, hour: 7, minute: 30, gender: "other" });

const SAMPLE_REPORT_CARD: ReportCardReport = {
  v: 1,
  intro: "자, 성적표 나왔다. 전반적으로 단단한데 한 과목이 눈에 띄네.",
  scores: [
    { domain: "재물운", grade: "B+", comment: "모으는 힘은 좋은데 굴리는 손이 늦어." },
    { domain: "애정운", grade: "A0", comment: "먼저 품는 쪽이라 사람이 오래 남아." },
    { domain: "직업운", grade: "B0", comment: "묵묵히 쌓는 자리에서 빛나는 결이야." },
    { domain: "건강운", grade: "A-", comment: "기본 체력은 좋아. 소화기만 챙기자." },
    { domain: "인간관계운", grade: "A+", comment: "네 주변이 네 최고 자산이야." },
  ],
  totalGrade: "B+",
  totalComment: "표현만 한 뼘 늘리면 학점이 통째로 올라가는 사주야.",
  note: "점수보다 네가 어디서 편한지가 더 중요해.",
};

const SAMPLE_LIFE_GRAPH: LifeGraphReport = {
  v: 1,
  intro: "대운 열 해씩을 이어 붙이면 네 인생은 이런 곡선을 그려.",
  decades: [
    { ageLabel: "22~31세", score: 62, headline: "뿌리를 내리는 구간", body: "자리를 잡느라 더디게 느껴지는 흐름이 보여." },
    { ageLabel: "32~41세", score: 78, headline: "가장 넓어지는 구간", body: "쌓아둔 게 한꺼번에 쓰이는 시기야." },
    { ageLabel: "42~51세", score: 55, headline: "속도를 줄이는 구간", body: "넓히기보다 고르는 쪽이 편한 흐름이야." },
  ],
  peak: "30대 중후반이 가장 환해.",
  valley: "40대 중반엔 힘을 아끼며 고르는 게 나아.",
  note: "곡선이 내려간다고 네가 내려가는 건 아니야.",
};

/** 실물 렌더러를 그대로 쓰되 높이를 잘라 "미리보기"로 만든다. */
function Clip({ children }: { children: ReactNode }) {
  return (
    <div className="relative max-h-[320px] overflow-hidden pointer-events-none">
      {children}
      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-cream-warm to-transparent" />
    </div>
  );
}

export default function FortuneSamplePreview({ landingKey }: { landingKey: LandingKey }) {
  if (landingKey === "element_balance") {
    return <div className="pointer-events-none"><ElementChart saju={SAMPLE_SAJU} /></div>;
  }
  if (landingKey === "saju_report_card") {
    return <Clip><ReportCardView report={SAMPLE_REPORT_CARD} /></Clip>;
  }
  if (landingKey === "life_graph") {
    return <Clip><LifeGraphView report={SAMPLE_LIFE_GRAPH} /></Clip>;
  }
  return null;
}
