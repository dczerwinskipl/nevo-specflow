#!/usr/bin/env bash
# Runs a command on Linux (Docker, Node image) against a COMMITTED state of this repository.
#
# Why: real-Git integration tests (Engine, Runtime HTTP, CLI) spawn many Git processes and create
# many small files; on Windows they take minutes per file (process start, antivirus, NTFS), on Linux
# seconds. The repository is cloned INSIDE the container (not bind-mounted), so it uses the
# container's own filesystem.
#
# Usage:   tools/dev/linux-test.sh [options] -- <command to run in the clone>
# Options: --ref <branch>   local branch or commit to test (default: the current branch)
#          --memory <size>  container memory limit (default 10g)
#          --cpus <n>       container CPU limit (default 6)
#          --image <name>   Docker image (default node:24-bookworm)
# Example: tools/dev/linux-test.sh -- 'pnpm turbo run build --filter=@nevo/specflow-engine^... \
#            && cd packages/specflow-engine && npx vitest run test/create/create-commit.test.ts --testTimeout=240000'
# Only COMMITTED changes are tested (the clone is made from the local repository's objects).
set -euo pipefail

ref="$(git rev-parse --abbrev-ref HEAD)"
memory="10g"
cpus="6"
image="node:24-bookworm"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) ref="$2"; shift 2 ;;
    --memory) memory="$2"; shift 2 ;;
    --cpus) cpus="$2"; shift 2 ;;
    --image) image="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [[ $# -eq 0 ]]; then
  echo "usage: tools/dev/linux-test.sh [options] -- <command>" >&2
  exit 2
fi
command_to_run="$*"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "warning: uncommitted changes are NOT included in the Linux run (commit them first)." >&2
fi

git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if command -v cygpath >/dev/null 2>&1; then
  git_dir="$(cygpath -m "$git_dir")"
fi

inner='
set -euo pipefail
git config --global --add safe.directory "*"
git config --global user.name tester
git config --global user.email tester@example.invalid
git clone -q /src.git /work
cd /work
git checkout -q "$NEVO_REF"
echo "linux-test: $(git rev-parse --short HEAD) on $(uname -sr), node $(node -v)"
corepack enable
corepack prepare "$(node -p "require(\"./package.json\").packageManager")" --activate >/dev/null
pnpm install --frozen-lockfile >/dev/null
bash -c "$NEVO_COMMAND"
'

MSYS_NO_PATHCONV=1 docker run --rm \
  --memory="$memory" --cpus="$cpus" \
  -e NEVO_REF="$ref" -e NEVO_COMMAND="$command_to_run" \
  -v "$git_dir:/src.git:ro" \
  "$image" bash -c "$inner"
