#!/bin/bash
# 세션 시작 때 1회: scripts/agent/init.sh (두 번째부터는 수 초)
# 키가 있으면 dev 리소스인지 확인 → 빈 .env.local → 의존성(필요할 때만) → 필수 키 이름 확인. 키 값은 출력하지 않는다.
# 비밀값이 전혀 없는 트리(클라우드 기본 환경)에서도 통과한다.
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "저장소 안에서 실행할 것"; exit 1; }
cd "$root" || exit 1

# 키는 환경 변수(클라우드) 또는 .env.local(로컬)에 있다. 키의 "있음"은 값을 읽지 않고 grep -q 로만 본다(값이 셸 변수·추적에 실리지 않게).
# 값을 읽는 것은 Supabase 주소 하나뿐(비밀값 아님). 파일 값의 따옴표와 CR(Windows 줄 끝)은 벗긴다 — Node 의 --env-file 과 같은 해석
from_file() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r' | sed -E "s/^'//; s/'$//"; }
has() { [ -n "${!1}" ] || grep -qE "^$1=[\"']?[^\"'[:space:]]" .env.local 2>/dev/null; }

# Supabase 주소가 있으면 dev 프로젝트인지 대조하고, 아니면 멈춘다. 공개 저장소라 프로젝트 ref 원문 대신 sha256 으로 대조한다.
# 주소가 없으면(비밀값 0 인 클라우드 기본 환경) 대조할 것이 없으니 안내만 하고 지나간다.
DEV_REF_SHA256=824c4ca106c4ac8b112ea1a2bb1de581a46dabcfaab73c44dec1d78edaebdef4
url=${NEXT_PUBLIC_SUPABASE_URL:-$(from_file NEXT_PUBLIC_SUPABASE_URL)}
if [ -z "$url" ]; then
  echo "비밀값 없음 — 클라우드 기본 환경이면 정상, 로컬이면 .env.local 을 확인할 것"
else
  ref=$(printf %s "$url" | sed -nE 's#^https://([a-z0-9]+)\.supabase\.co.*#\1#p')
  if [ "$(printf %s "$ref" | sha256sum | cut -d' ' -f1)" != "$DEV_REF_SHA256" ]; then
    echo "중단: NEXT_PUBLIC_SUPABASE_URL 이 dev 프로젝트가 아니다"
    exit 1
  fi
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

for k in NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CLAUDE_API_KEY OPENAI_API_KEY AUTH_TOKEN_SECRET NEXT_PUBLIC_BASE_URL; do
  has "$k" || echo "키 없음: $k"
done
echo "init 완료 ($(git rev-parse --abbrev-ref HEAD), Node $(node -v))"
