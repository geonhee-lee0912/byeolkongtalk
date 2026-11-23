// 푸시 토큰 등록·해제의 순서 규칙 — OS·서버 호출은 register.ts 가 넣는다(순수 모듈 — react-native·expo import 금지, 루트 CI 가 돌린다).
// 해제(로그아웃·reset)할 때마다 번호(epoch)를 올린다. 그 전에 시작한 등록은
//   서버에 보내기 전이면 그만두고, 보낸 뒤면 방금 등록한 토큰을 스스로 지운다(로그아웃한 기기에 이전 계정 알림이 가지 않게).
// 🔴 서버 호출(등록·뒤늦은 지우기·해제)은 한 줄로 세운다 — 기기 토큰은 계정이 바뀌어도 같아서, A 의 뒤늦은 지우기가 B 의 등록 뒤에
//    도착하면 B 까지 지운다. 한 줄이면 A 등록→A 지우기→해제→B 등록 순서로 서버에 닿아 마지막이 B 다.
// 🔴 Expo 토큰 받기는 줄 밖에서 한다 — 거기서 멈춰도 해제가 같이 멈추지 않게. 줄 안의 서버 호출은 요청 시간 제한(api.ts)이 있다.

export type PushSyncDeps = {
  /** 이 기기의 Expo 푸시 토큰. 못 받는 기기(시뮬레이터·projectId 없음)면 null */
  getExpoToken(): Promise<string | null>;
  /** 서버에 이 회원 기기로 등록(앱 토큰으로) */
  post(token: string, access: string): Promise<void>;
  /** 서버에서 이 기기 토큰을 지운다(로그인 없이 받는 라우트) */
  del(token: string): Promise<void>;
  /** 로그아웃 때 지울 토큰의 기억 */
  saved: { get(): Promise<string | null>; set(token: string): Promise<void>; clear(): Promise<void> };
  warn(message: string, e: unknown): void;
};

export function createPushSync(deps: PushSyncDeps) {
  let epoch = 0;
  let queue: Promise<unknown> = Promise.resolve();
  function serial(job: () => Promise<void>): Promise<void> {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  }

  /** 지운다 → 성공하면 기억도 지운다. 실패면 기억을 남긴다(다음 로그아웃·reset 때 다시) */
  async function drop(token: string): Promise<void> {
    await deps.del(token);
    await deps.saved.clear();
  }

  /** 로그인 안 됨·토큰 못 받음이면 아무것도 안 한다. 던지지 않는다 */
  async function register(ensureToken: () => Promise<string | null>): Promise<void> {
    const started = epoch;
    try {
      const access = await ensureToken();
      if (!access || epoch !== started) return;
      const token = await deps.getExpoToken();
      if (!token || epoch !== started) return;
      await serial(async () => {
        if (epoch !== started) return;
        await deps.post(token, access);
        await deps.saved.set(token);
        // 보내는 사이 로그아웃했다 — 해제는 이 토큰을 못 봤을 수 있다
        if (epoch !== started) await drop(token).catch((e) => deps.warn("[push] 로그아웃 뒤 늦게 끝난 등록을 못 지웠다 — 다음에 다시", e));
      });
    } catch (e) {
      deps.warn("[push] 토큰 등록 실패 — 다음 실행 때 다시", e);
    }
  }

  /** 로그아웃·reset — 기억한 토큰을 서버에서 지운다. 던지지 않는다 */
  function unregister(): Promise<void> {
    epoch++;
    return serial(async () => {
      const token = await deps.saved.get();
      if (token) await drop(token);
    }).catch((e) => deps.warn("[push] 토큰 해제 실패", e));
  }

  return { register, unregister };
}
