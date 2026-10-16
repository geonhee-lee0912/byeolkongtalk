// lib/session.test.ts 전용 가짜 next/headers — getSession 이 읽는 요청 헤더·쿠키를 테스트가 setRequest 로 넣는다
// (테스트의 resolve 훅이 next/headers 자리에 이 파일을 끼운다). lib/session.ts 가 쓰는 것(headers().get · cookies().get)만 흉내 낸다 —
// getSession 이 다른 메서드를 쓰기 시작하면 TypeError 로 테스트가 깨진다(여기부터 늘리라는 신호).
let reqHeaders = new Headers();
let reqCookies = new Map<string, string>();

export function setRequest(r: { authorization?: string; cookies?: Record<string, string> }): void {
  // Headers 는 값 앞뒤 공백을 지운다 — 실제 요청도 서버엔 그렇게 온다("Bearer " → "Bearer")
  reqHeaders = new Headers(r.authorization === undefined ? {} : { authorization: r.authorization });
  reqCookies = new Map(Object.entries(r.cookies ?? {}));
}

export async function headers(): Promise<Headers> {
  return reqHeaders;
}

export async function cookies(): Promise<{ get(name: string): { name: string; value: string } | undefined }> {
  return {
    get: (name: string) => {
      const value = reqCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  };
}
