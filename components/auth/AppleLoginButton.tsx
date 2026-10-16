"use client";

// 애플 로그인 버튼 — 카카오 버튼 바로 아래. 노출 규칙은 lib/auth/apple-login-flag.ts(웹=스위치, iOS 앱=보임, 안드로이드 앱=숨김).
// iOS 앱에서는 앱이 이 주소로 가는 이동을 가로채 네이티브 애플 로그인을 띄운다 — 웹 코드는 같다. 스펙 2026-10-12-앱-1 §6.
// 마운트 전(서버 렌더 포함)엔 아무것도 그리지 않는다 — 하이드레이션 어긋남 방지. 아이콘 path 는 simple-icons(CC0)의 Apple.
import { useAppInfo } from "@/lib/use-app-info";
import { showAppleLogin } from "@/lib/auth/apple-login-flag";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export interface AppleLoginButtonProps {
  /** 로그인 뒤 돌아갈 내부 경로 — 같은 화면 카카오 버튼의 next 와 같은 값 */
  next: string;
  /** 계측 — 어느 로그인 벽인지 */
  surface: "login_page" | "start_page" | "draw_sheet";
  meta?: Record<string, string>;
  /** 같은 자리 카카오 버튼이 작은 지면(/start 가입 박스 — py-3 · 14px)에 맞춘다. 애플 HIG: 다른 로그인 버튼과 같은 크기 */
  compact?: boolean;
  className?: string;
}

export default function AppleLoginButton({ next, surface, meta, compact = false, className = "" }: AppleLoginButtonProps) {
  const { ready, app } = useAppInfo();
  if (!ready || !showAppleLogin(app)) return null;
  return (
    <div className={`w-full ${className}`}>
      <a
        href={`/api/auth/login/apple?next=${encodeURIComponent(next)}`}
        onClick={() => trackUiEvent("login_apple_clicked", { meta: { surface, ...meta } })}
        className={`w-full flex items-center justify-center gap-2 ${compact ? "py-3 text-[14px]" : "py-3.5 text-[15px]"} rounded-xl bg-black text-white font-bold hover:opacity-90 active:scale-[0.98] transition`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
        Apple로 계속하기
      </a>
      <p className="mt-1.5 text-[11px] text-text-light/80 text-center">이미 카카오로 가입했다면 카카오로 로그인해줘</p>
    </div>
  );
}
