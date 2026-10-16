// app.config.ts 의 extra 읽기 — 순수 함수(테스트 extra.test.ts). react-native·expo import 금지(루트 CI 가 돌린다).
// 🔴 extra 는 빌드 때 @expo/config 가 직렬화한 값이다 — null 은 {} 로 바뀌어 들어온다(serializeAndEvaluate). 그래서 모양을 확인해서만 쓴다:
//    우회 값을 truthiness 로 보면 {} 가 참이라 운영 빌드의 주소·헤더에 "[object Object]" 가 실린다(웹뷰 헤더는 네이티브가 문자열로 못 읽는다)
export type AppVariant = "development" | "production";
export type AppConfig = { variant: AppVariant; scheme: string; baseUrl: string; vercelBypass: string | null };

export function parseAppExtra(extra: unknown): AppConfig {
  const e = (extra ?? {}) as Record<string, unknown>;
  const { baseUrl, scheme, vercelBypass } = e;
  // 없으면 바로 멈춘다 — 엉뚱한 서버로 붙는 빌드보다 낫다
  if (typeof baseUrl !== "string" || typeof scheme !== "string") throw new Error("app.config.ts extra 에 baseUrl·scheme 이 없다");
  const variant: AppVariant = e.variant === "production" ? "production" : "development";
  return {
    variant,
    scheme,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    // 개발용 빌드의 문자열만 — 운영 빌드엔 app.config.ts 가 넣지 않지만 여기서도 버린다
    vercelBypass: variant === "development" && typeof vercelBypass === "string" && vercelBypass !== "" ? vercelBypass : null,
  };
}
