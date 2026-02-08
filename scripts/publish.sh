#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ─── Colors ──────────────────────────────────────────────────────────────────
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# ─── Usage ───────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $(basename "$0") <patch|minor|major> [--dry-run]

Bump the version, build, test, publish to npm, and push a git tag.

  patch      0.1.0 → 0.1.1
  minor      0.1.0 → 0.2.0
  major      0.1.0 → 1.0.0
  --dry-run  Do everything except the actual npm publish and git push
EOF
  exit 1
}

# ─── Parse args ──────────────────────────────────────────────────────────────
BUMP=""
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP="$arg" ;;
    --dry-run)         DRY_RUN=true ;;
    -h|--help)         usage ;;
    *)                 red "Unknown argument: $arg"; usage ;;
  esac
done

if [ -z "$BUMP" ]; then
  red "Error: version bump type required (patch, minor, or major)"
  usage
fi

# ─── Preflight checks ───────────────────────────────────────────────────────
bold "Preflight checks"

# Clean working tree
if [ -n "$(git status --porcelain)" ]; then
  red "Error: working directory is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi
green "  ✓ Working tree clean"

# On main branch
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  red "Error: not on main branch (currently on '$BRANCH')"
  exit 1
fi
green "  ✓ On main branch"

# Up to date with remote
git fetch origin main --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" != "$REMOTE" ]; then
  red "Error: local main is not up to date with origin/main"
  dim "  Run: git pull origin main"
  exit 1
fi
green "  ✓ Up to date with origin/main"

# npm auth
if ! npm whoami &>/dev/null; then
  red "Error: not logged in to npm. Run 'npm login' first."
  exit 1
fi
NPM_USER="$(npm whoami)"
green "  ✓ Logged in to npm as $NPM_USER"

# ─── Compute new version ────────────────────────────────────────────────────
CURRENT="$(node -p "require('./package.json').version")"

IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT"

case "$BUMP" in
  patch) V_PATCH=$((V_PATCH + 1)) ;;
  minor) V_MINOR=$((V_MINOR + 1)); V_PATCH=0 ;;
  major) V_MAJOR=$((V_MAJOR + 1)); V_MINOR=0; V_PATCH=0 ;;
esac

NEXT="${V_MAJOR}.${V_MINOR}.${V_PATCH}"

echo ""
bold "Version: $CURRENT → $NEXT ($BUMP)"
if $DRY_RUN; then
  dim "  (dry run — will not publish or push)"
fi
echo ""

# ─── Bump version in all package.json files ──────────────────────────────────
bold "Bumping versions"

PACKAGE_FILES=(
  package.json
  packages/server/package.json
  packages/client/package.json
  packages/shared/package.json
)

for f in "${PACKAGE_FILES[@]}"; do
  # Use node to do a clean JSON edit (preserves formatting better than sed)
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$f', 'utf8'));
    pkg.version = '$NEXT';
    fs.writeFileSync('$f', JSON.stringify(pkg, null, 2) + '\n');
  "
  green "  ✓ $f → $NEXT"
done

# ─── Build ───────────────────────────────────────────────────────────────────
echo ""
bold "Building"
npm run build
green "  ✓ Build complete"

# ─── Test ────────────────────────────────────────────────────────────────────
echo ""
bold "Running server tests"
npm run test:server
green "  ✓ Server tests passed"

# ─── Pack (always, so you can inspect) ───────────────────────────────────────
echo ""
bold "Packing"
npm pack
TARBALL="pi-deck-${NEXT}.tgz"
TARBALL_SIZE="$(du -h "$TARBALL" | cut -f1 | xargs)"
green "  ✓ Created $TARBALL ($TARBALL_SIZE)"

# ─── Publish ─────────────────────────────────────────────────────────────────
echo ""
if $DRY_RUN; then
  bold "Publish (dry run)"
  npm publish --dry-run
  dim "  Skipped actual publish (--dry-run)"
else
  bold "Publishing to npm"
  npm publish
  green "  ✓ Published pi-deck@$NEXT"
fi

# ─── Git tag & push ─────────────────────────────────────────────────────────
echo ""
bold "Git tag & push"

git add "${PACKAGE_FILES[@]}"
git commit -m "v${NEXT}"

git tag -a "v${NEXT}" -m "v${NEXT}"

if $DRY_RUN; then
  dim "  Skipped git push (--dry-run)"
  dim "  To undo: git reset HEAD~1 && git tag -d v${NEXT}"
else
  git push origin main
  git push origin "v${NEXT}"
  green "  ✓ Pushed commit and tag v${NEXT}"
fi

# ─── Cleanup ─────────────────────────────────────────────────────────────────
rm -f "$TARBALL"

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
if $DRY_RUN; then
  bold "Dry run complete for v${NEXT}"
  dim "To undo version bump: git checkout -- ${PACKAGE_FILES[*]}"
  dim "To undo commit/tag:   git reset HEAD~1 && git tag -d v${NEXT}"
else
  green "🚀 Published pi-deck@${NEXT}"
  dim "   npm: https://www.npmjs.com/package/pi-deck"
  dim "   tag: v${NEXT}"
fi
