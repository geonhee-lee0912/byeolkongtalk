// 푸시 토큰 등록·해제의 순서 규칙 — OS·서버 호출은 register.ts 가 넣는다(순수 모듈 — react-native·expo import 금지, 루트 CI 가 돌린다).
// 🔴 로그아웃(해제)은 진행 중인 등록을 기다리지 않는다 — 등록이 Expo 토큰을 못 받고 서 있으면 로그아웃이 같이 멈춘다.
//    대신 해제할 때마다 번호(epoch)를 올리고, 그 전에 시작한 등록은
//    서버에 보내기 전이면 그만두고, 보낸 뒤면 방금 등록한 토큰을 스스로 지운다(로그아웃한 기기에 이전 계정 알림이 가지 않게).
//    서버는 같은 토큰을 덮어쓰고 지우기도 여러 번 해도 같다 — 해제와 뒤늦은 지우기가 겹쳐도 된다.

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
      await deps.post(token, access);
      await deps.saved.set(token);
      // 보내는 사이 로그아웃했다 — 해제는 이 토큰을 못 봤을 수 있다
      if (epoch !== started) await drop(token).catch((e) => deps.warn("[push] 로그아웃 뒤 늦게 끝난 등록을 못 지웠다 — 다음에 다시", e));
    } catch (e) {
      deps.warn("[push] 토큰 등록 실패 — 다음 실행 때 다시", e);
    }
  }

  /** 로그아웃·reset — 기억한 토큰을 서버에서 지운다. 던지지 않는다 */
  async function unregister(): Promise<void> {
    epoch++;
    try {
      const token = await deps.saved.get();
      if (token) await drop(token);
    } catch (e) {
      deps.warn("[push] 토큰 해제 실패", e);
    }
  }

  return { register, unregister };
}
