// 2년 재확인 정보성 푸시(설계 §4-5) — 기한 7일 전까지 앱을 열지 않아 팝업을 못 본 동의자에게. cron 의 DispatchJob.
// 앱을 열어 팝업을 봤으면 last_reconfirm_notice_at 이 이미 채워져 reconfirmState 가 다음 기한을 가리킨다(여기서 안 보낸다).
import { decidePush } from "./decide.ts";
import { koreanDate, reconfirmState } from "./consent.ts";
import { kstDate } from "../admin-time.ts";
import { NOTIFICATION_SETTINGS_PATH, reconfirmMessage } from "./templates.ts";
import type { DispatchJob } from "./dispatch.ts";

export type ReconfirmCandidate = { userId: string; firstGrantedAt: string; grantedAt: string; lastReconfirmNoticeAt: string | null };

export interface ReconfirmStore {
  /** 동의 중이고 최초 동의가 cutoff 이전인 회원(첫 기한의 푸시 시점이 지났을 수 있는 사람) */
  reconfirmCandidates(cutoffIso: string): Promise<ReconfirmCandidate[]>;
  recordReconfirmNotice(userId: string, source: "reconfirm_push"): Promise<boolean>;
}

/** 첫 기한(2년)의 7일 전 — 이보다 늦게 동의한 회원은 아직 푸시 때가 아니다. 하루 여유를 둔다 */
const CANDIDATE_LEAD_DAYS = 8;

export function reconfirmJob(rs: ReconfirmStore): DispatchJob {
  return async (ctx) => {
    const cutoff = new Date(ctx.now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    cutoff.setUTCDate(cutoff.getUTCDate() + CANDIDATE_LEAD_DAYS);
    for (const c of await rs.reconfirmCandidates(cutoff.toISOString())) {
      if (ctx.overBudget()) break;
      try {
        const st = reconfirmState(c.firstGrantedAt, c.lastReconfirmNoticeAt, ctx.now);
        if (!st.push) continue;
        const tokens = await ctx.store.activeDeviceTokens(c.userId);
        // 재확인 통지는 끄는 칸이 없는 정보성(A)
        const d = decidePush({
          kind: "reconfirm", now: ctx.now, activeDevices: tokens.length, prefOn: true,
          subscription: "none", adConsent: false, adSentToday: [], crisisWithin30d: false,
        });
        if (!d.send) continue; // 기기 없음·시간 밖 — 다음 실행·다음 날 다시 본다(앱을 열면 팝업으로 알린다)
        const out = await ctx.deliver({
          userId: c.userId, kind: "reconfirm", klass: "info", refId: kstDate(st.deadline), tokens,
          path: NOTIFICATION_SETTINGS_PATH, message: reconfirmMessage(koreanDate(c.grantedAt)),
        });
        if (out.outcome === "failed") {
          ctx.result.failed++;
          continue;
        }
        // dup + delivered = 앞 실행이 보내고 기록만 못 했다 — 기록을 맞춘다
        if (out.outcome === "sent" || out.delivered) await rs.recordReconfirmNotice(c.userId, "reconfirm_push");
        if (out.outcome === "sent") ctx.result.sent++;
      } catch (e) {
        ctx.result.failed++;
        await ctx.log(e, { route: "cron/push-dispatch", extra: { job: "reconfirm" } });
      }
    }
  };
}
