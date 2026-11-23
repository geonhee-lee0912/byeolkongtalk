// 아침 알림(오늘의 별 흐름) cron 일 — 08:30~11:00 실행마다 오늘 아직 안 받은 회원에게 보낸다(설계 §3 B·C).
// 유료 구독자는 정보성 틀, 동의한 비구독·체험자는 광고 틀(분류는 decide.ts). 오늘 보낸 회원은 push_sends 유니크로 한 번만.
import type { DispatchJob } from "./dispatch.ts";
import { adSlotsToday, FACTS_CHUNK, type FactsStore } from "./facts.ts";
import { decideMorning, inMorningWindow } from "./morning.ts";
import { todayFlow } from "./today-flow.ts";
import { BYEOLMARU_TODAY_PATH, morningInfoMessage } from "./templates.ts";
import { morningAdMessage } from "./ad-templates.ts";

export function morningJob(fs: FactsStore): DispatchJob {
  return async (ctx) => {
    if (!inMorningWindow(ctx.now)) return;
    const devices = await fs.activeDevices();
    const ids = [...devices.keys()];
    for (let i = 0; i < ids.length; i += FACTS_CHUNK) {
      if (ctx.overBudget()) return;
      const chunk = ids.slice(i, i + FACTS_CHUNK);
      const facts = await fs.facts(chunk, ctx.now, ctx.today);
      for (const userId of chunk) {
        if (ctx.overBudget()) return;
        const f = facts.get(userId);
        const dev = devices.get(userId);
        if (!f || !dev) continue;
        try {
          const d = decideMorning({
            now: ctx.now,
            activeDevices: dev.tokens.length,
            morningPref: f.morningPref,
            subscription: f.subscription,
            adConsent: f.adConsent,
            adSentToday: adSlotsToday(f),
            crisisWithin30d: f.crisisWithin30d,
            lastOpenAt: f.lastOpenAt,
            sentToday: f.sendsToday.some((s) => s.kind === "morning"),
            hasFlow: !!f.profile?.birth_date,
          });
          if (!d.send) continue;
          const flow = todayFlow(f.profile, ctx.today);
          if (!flow) continue; // 생일은 있는데 계산이 안 되는 프로필 — 보내지 않는다
          const out = await ctx.deliver({
            userId,
            kind: "morning",
            klass: d.klass,
            refId: ctx.today,
            tokens: dev.tokens,
            path: BYEOLMARU_TODAY_PATH,
            message: d.klass === "info" ? morningInfoMessage(flow) : morningAdMessage(flow),
          });
          if (out.outcome === "sent") ctx.result.sent++;
          else if (out.outcome === "failed") ctx.result.failed++;
        } catch (e) {
          ctx.result.failed++;
          await ctx.log(e, { route: "cron/push-dispatch", extra: { job: "morning" } });
        }
      }
    }
  };
}
