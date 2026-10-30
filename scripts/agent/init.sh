#!/bin/bash
# 세션 시작 때 1회: scripts/agent/init.sh (두 번째부터는 수 초)
# dev 리소스인지 확인 → 빈 .env.local → 의존성(필요할 때만) → 필수 키 이름 확인. 키 값은 출력하지 않는다.
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "저장소 안에서 실행할 것"; exit 1; }
cd "$root" || exit 1

# 키는 환경 변수(클라우드) 또는 .env.local(로컬)에 있다
from_file() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }
has() { [ -n "${!1}" ] || [ -n "$(from_file "$1")" ]; }

# dev Supabase 프로젝트가 아니면 멈춘다. 공개 저장소라 프로젝트 ref 원문 대신 sha256 으로 대조한다
DEV_REF_SHA256=824c4ca106c4ac8b112ea1a2bb1de581a46dabcfaab73c44dec1d78edaebdef4
url=${NEXT_PUBLIC_SUPABASE_URL:-$(from_file NEXT_PUBLIC_SUPABASE_URL)}
ref=$(printf %s "$url" | sed -nE 's#^https://([a-z0-9]+)\.supabase\.co.*#\1#p')
if [ "$(printf %s "$ref" | sha256sum | cut -d' ' -f1)" != "$DEV_REF_SHA256" ]; then
  echo "중단: NEXT_PUBLIC_SUPABASE_URL 이 dev 프로젝트가 아니다"
  exit 1
fi

# qa·smoke 의 --env-file=.env.local 용. 없을 때만 빈 파일을 만든다(클라우드에선 키를 파일에 쓰지 않는다)
[ -f .env.local ] || : >.env.local

# 의존성: node_modules 가 없거나, 이 스크립트가 설치한 트리에서 lockfile 이 바뀌었을 때만 npm ci.
# 해시 파일이 없는 트리(사람이 관리하는 공유 트리)는 건드리지 않는다 — 다른 세션의 node_modules 를 비울 수 있다
hashes=node_modules/.bk-init.sha256
if [ ! -d node_modules ] || { [ -f "$hashes" ] && ! sha256sum --check --status "$hashes" 2>/dev/null; }; then
  npm ci --no-audit --no-fund || { echo "npm ci 실패"; exit 1; }
  sha256sum package.json package-lock.json >"$hashes"
elif [ ! -f "$hashes" ]; then
  echo "node_modules 는 이 스크립트가 관리하지 않는다 — 의존성이 이상하면 운영자에게 알릴 것"
fi

want=$(tr -d '[:space:]' <.nvmrc 2>/dev/null)
have=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
[ -z "$want" ] || [ "$have" = "$want" ] || echo "주의: Node $have — 이 저장소는 $want(.nvmrc, CI 와 같음). 테스트 결과가 CI 와 다를 수 있다"

# Codex 로그인 복원(환경이 CODEX_AUTH_B64 를 줄 때만). 이미 있으면 덮지 않는다 — Codex 가 갱신한 토큰이 더 새것이다
if [ -n "$CODEX_AUTH_B64" ] && [ ! -s ~/.codex/auth.json ]; then
  mkdir -p ~/.codex
  (umask 077; printf %s "$CODEX_AUTH_B64" | base64 -d >~/.codex/auth.json)
fi
command -v codex >/dev/null && codex login status 2>&1 | head -1

for k in NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CLAUDE_API_KEY OPENAI_API_KEY AUTH_TOKEN_SECRET NEXT_PUBLIC_BASE_URL; do
  has "$k" || echo "키 없음: $k"
done
echo "init 완료 ($(git rev-parse --abbrev-ref HEAD), Node $(node -v))"
