#!/usr/bin/env bash
# Calley Pre-Launch Security & Readiness Check
# Run this before deploying to production: pnpm pre-launch-check

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
WARN=0
FAIL=0

pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }

echo "=================================================="
echo "  Calley Pre-Launch Readiness Check"
echo "=================================================="
echo ""

# ─── 1. Build Check ─────────────────────────────────
echo "--- Build ---"
if pnpm build > /dev/null 2>&1; then
  pass "Project builds successfully"
else
  fail "Project build failed"
fi

# ─── 2. Type Check ──────────────────────────────────
echo "--- Type Safety ---"
if pnpm type-check > /dev/null 2>&1; then
  pass "TypeScript type checking passes"
else
  fail "TypeScript type errors found"
fi

# ─── 3. Lint Check ──────────────────────────────────
echo "--- Linting ---"
if pnpm lint > /dev/null 2>&1; then
  pass "ESLint passes with no errors"
else
  fail "ESLint found errors"
fi

# ─── 4. Dependency Audit ────────────────────────────
echo "--- Dependency Security ---"
AUDIT_OUTPUT=$(pnpm audit 2>&1 || true)
if echo "$AUDIT_OUTPUT" | grep -q "critical"; then
  fail "Critical vulnerabilities found — run 'pnpm audit' for details"
elif echo "$AUDIT_OUTPUT" | grep -q "high"; then
  warn "High severity vulnerabilities found — run 'pnpm audit' for details"
else
  pass "No critical or high vulnerabilities in dependencies"
fi

# ─── 5. Environment File Check ──────────────────────
echo "--- Environment Files ---"
if [ -f apps/api/.env.example ]; then
  pass "API .env.example exists"
else
  fail "API .env.example missing"
fi

if [ -f apps/web/.env.example ]; then
  pass "Web .env.example exists"
else
  fail "Web .env.example missing"
fi

if [ -f docker/.env.example ]; then
  pass "Docker .env.example exists"
else
  fail "Docker .env.example missing"
fi

# ─── 6. No Secrets in Code ──────────────────────────
echo "--- Secret Scanning ---"
SECRET_PATTERNS='(password|secret|api_key|apikey|token|private_key)\s*[:=]\s*["\x27][^"\x27]{8,}'
if grep -rIi --include="*.ts" --include="*.tsx" --include="*.js" -E "$SECRET_PATTERNS" apps/ packages/ 2>/dev/null | grep -v ".env" | grep -v "example" | grep -v "test" | grep -v "mock" | grep -v "process.env" | grep -v ".d.ts" | head -5 | grep -q .; then
  warn "Potential hardcoded secrets found — review the matches above"
else
  pass "No obvious hardcoded secrets detected"
fi

# ─── 7. .env Files Not Committed ────────────────────
echo "--- Git Safety ---"
if git ls-files --cached | grep -q "^apps/.*\.env$\|^docker/\.env$"; then
  fail ".env file(s) are tracked by git — remove with 'git rm --cached'"
else
  pass "No .env files tracked by git"
fi

if grep -q "\.env" .gitignore 2>/dev/null; then
  pass ".env is in .gitignore"
else
  warn ".env not found in .gitignore"
fi

# ─── 8. Docker Build Check ──────────────────────────
echo "--- Docker ---"
if [ -f apps/api/Dockerfile ]; then
  pass "API Dockerfile exists"
else
  fail "API Dockerfile missing"
fi

if [ -f apps/web/Dockerfile ]; then
  pass "Web Dockerfile exists"
else
  fail "Web Dockerfile missing"
fi

if [ -f docker/docker-compose.yml ]; then
  pass "Production docker-compose.yml exists"
else
  fail "Production docker-compose.yml missing"
fi

# ─── 9. Required Files Check ────────────────────────
echo "--- Required Files ---"
for f in LICENSE CHANGELOG.md README.md CLAUDE.md SPECS.md TASKS.md; do
  if [ -f "$f" ]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done

# ─── 10. CI/CD Check ────────────────────────────────
echo "--- CI/CD ---"
for f in .github/workflows/ci.yml .github/workflows/deploy-production.yml .github/workflows/deploy-preview.yml; do
  if [ -f "$f" ]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done

if [ -f .github/dependabot.yml ]; then
  pass "Dependabot configured"
else
  warn "Dependabot not configured"
fi

# ─── Summary ────────────────────────────────────────
echo ""
echo "=================================================="
echo "  Results: ${GREEN}${PASS} passed${NC}, ${YELLOW}${WARN} warnings${NC}, ${RED}${FAIL} failed${NC}"
echo "=================================================="

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Pre-launch check FAILED — fix the issues above before deploying.${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "${YELLOW}Pre-launch check PASSED with warnings — review before deploying.${NC}"
  exit 0
else
  echo -e "${GREEN}Pre-launch check PASSED — ready for deployment!${NC}"
  exit 0
fi
