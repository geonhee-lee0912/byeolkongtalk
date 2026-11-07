// 화면 기억 — 화면마다 마지막으로 불러온 데이터를 메모리에 둔다. 뒤로 가거나 탭을 다시 열면 '잠시만…' 대신 이걸 바로 그리고,
// 화면은 늘 하던 대로 새로 불러와 바꾼다(그동안 대기 문구 없음). 스펙 2026-11-07-앱-화면 §6 '뒤로 간 화면' (운영자 11-07 A안).
// - 메모리만: 새로 고침·앱을 새로 켜면 비어 있다. 그래서 첫 그림(하이드레이션)은 늘 서버와 같다 — useState 초깃값으로 읽어도 된다.
// - 주인: 로그인 정보(localStorage byeolkong_user, components/auth/AuthBootstrap 이 쓴다)가 바뀌거나 지워지면(로그아웃·탈퇴·세션 만료)
//   전부 비운다 — 공용 기기에서 다른 사람의 데이터가 잠깐이라도 보이지 않게. 주인이 없으면 기억하지 않는다.

export type ScreenCache = {
  read<T>(key: string): T | undefined;
  write(key: string, value: unknown): void;
};

export function createScreenCache(getOwner: () => string | null): ScreenCache {
  const store = new Map<string, unknown>();
  let owner: string | null = null;

  /** 지금 주인 — 바뀌었으면 비운다. 못 읽거나 없으면 null */
  const current = (): string | null => {
    let now: string | null;
    try {
      now = getOwner();
    } catch {
      now = null;
    }
    if (now !== owner) {
      store.clear();
      owner = now;
    }
    return now;
  };

  return {
    read<T>(key: string): T | undefined {
      return current() === null ? undefined : (store.get(key) as T | undefined);
    },
    write(key: string, value: unknown): void {
      if (current() !== null) store.set(key, value);
    },
  };
}

/** 로그인 정보의 회원 id — 같은 사람이면 닉네임·사진이 바뀌어도 같은 주인이다 */
export function ownerFromStoredUser(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const id = (JSON.parse(raw) as { id?: unknown } | null)?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

export const screenCache = createScreenCache(() =>
  typeof window === "undefined" ? null : ownerFromStoredUser(window.localStorage.getItem("byeolkong_user")),
);
