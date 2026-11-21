// 우리 사이(연애 상담)는 2026-11-21 서비스 종료 — 종료 안내만 보여 준다.
// 옛 화면(관계 허브·상담 스레드)은 git 기록에 있다. 컴포넌트(`components/relationship/*`)는 아직 지우지 않았다.
import ServiceClosedNotice from "@/components/relationship/ServiceClosedNotice";

export default function RelationshipPage() {
  return <ServiceClosedNotice />;
}
