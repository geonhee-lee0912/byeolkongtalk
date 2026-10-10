// components/admin/daily/SubscriptionRow.tsx — 별마루 구독 신규·만료(오늘/7일) + 현재 활성.
import { Stat } from "@/components/admin/Stat";

interface Sub { started: number; expired: number; activeNow: number }

export function SubscriptionRow({ today, last7 }: { today: Sub; last7: Sub }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label="구독 신규 (오늘)" value={today.started} />
      <Stat label="구독 만료 (오늘)" value={today.expired} />
      <Stat label="구독 신규 (7일)" value={last7.started} />
      <Stat label="구독 만료 (7일)" value={last7.expired} />
      <Stat label="구독 중 (현재)" value={last7.activeNow} />
    </div>
  );
}
