// 이어가기(저녁)·깨우기(아침) cron 일 — 둘 다 광고(설계 §3 C). 누르면 홈(이어가기 버튼이 있는 곳).
// 아침 별 흐름(morning-job)이 같은 실행에서 먼저 돈다 — 그날 아침 칸을 쓴 회원은 판정 재료의 '오늘 보낸 알림'으로 걸러진다.
import type { DispatchJob } from "./dispatch.ts";
import { adSlotsToday, FACTS_CHUNK, type FactsStore, type PushFacts } from "./facts.ts";
import { decideResume, decideWake, EVENING_OPEN_MIN } from "./comeback.ts";
import { inMorningWindow } from "./morning.ts";
import { AD_CLOSE_MIN, kstMinutes } from "./decide.ts";
import { resumeAdMessage, wakeAdMessage } from "./ad-templates.ts";

export const HOME_PATH = "/";

export interface ResumeStore {
  latestTarot(userId: string): Promise<{ readingId: string; ended: boolean; lastUserAt: string | null } | null>;
}

/** 아침 별 흐름을 받는 사람(멈춤·위기 신호는 빼고 본 자격) — 깨우기는 이 사람들에게 가지 않는다(§5-3) */
export function receivesMorning(f: PushFacts): boolean {
  return f.morningPref && !!f.profile?.birth_date && (f.subscription === "paid" || f.adConsent);
}

export function comebackJob(fs: FactsStore, rs: ResumeStore): DispatchJob {
  return async (ctx) => {
    const m = kstMinutes(ctx.now);
    const morning = inMorningWindow(ctx.now);
    const evening = m >= EVENING_OPEN_MIN && m < AD_CLOSE_MIN;
    if (!morning && !evening) return;
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
        // 광고라 동의가 먼저다 — 동의 없는 회원은 상담 조회도 하지 않는다
        if (!f || !dev || !f.adConsent) continue;
        const common = {
          now: ctx.now,
          activeDevices: dev.tokens.length,
          subscription: f.subscription,
          adConsent: f.adConsent,
          adSentToday: adSlotsToday(f),
          crisisWithin30d: f.crisisWithin30d,
        };
        try {
          if (morning) {
            const d = decideWake({ ...common, lastOpenAt: f.lastOpenAt, receivesMorning: receivesMorning(f), wakeRefsSent: f.wakeRefsSent });
            if (!d.send) continue;
            const out = await ctx.deliver({
              userId, kind: "wake", klass: "ad", refId: d.ref, tokens: dev.tokens, path: HOME_PATH, message: wakeAdMessage(d.step),
            });
            if (out.outcome === "sent") ctx.result.sent++;
            else if (out.outcome === "failed") ctx.result.failed++;
          } else {
            if (f.crisisWithin30d || adSlotsToday(f).includes("evening")) continue; // 어차피 못 보낸다 — 조회를 아낀다
            const reading = await rs.latestTarot(userId);
            const d = decideResume({ ...common, reading });
            if (!d.send || !reading) continue;
            const out = await ctx.deliver({
              userId, kind: "resume", klass: "ad", refId: reading.readingId, tokens: dev.tokens, path: HOME_PATH, message: resumeAdMessage(),
            });
            if (out.outcome === "sent") ctx.result.sent++;
            else if (out.outcome === "failed") ctx.result.failed++;
          }
        } catch (e) {
          ctx.result.failed++;
          await ctx.log(e, { route: "cron/push-dispatch", extra: { job: morning ? "wake" : "resume" } });
        }
      }
    }
  };
}
