# Production Hotfix Summary: Boot Failure Fix

**Date:** 2026-09-17  
**Issue:** https://minorrob.github.io/mtg-deck-matrix/ stuck on "Opening your library"  
**PR:** https://github.com/minorrob/mtg-deck-matrix/pull/258 (DRAFT)  
**Status:** ✅ Fixed, awaiting UAT verification  

---

## Root Cause

**Asset version skew between `index.html` and `crankmagic.html` caused the service worker to cache mismatched JavaScript and CSS files.**

### Specific mismatches found:
1. `index.html` referenced `crankmagic.css?v=119` while `crankmagic.html` had `v=122`
2. `index.html` referenced `crankmagic-discover.js?v=57` while `crankmagic.html` had `v=59`
3. Service worker cached both versions, leading to:
   - Boot hanging on "Opening your library" screen
   - User Functions menu rendering off-screen (CSS mismatch)
   - Buttons non-responsive (JS initialization failure)

### How it happened:
Recent Phase 1 PRs (#246-#257) bumped versions in `crankmagic.html` but forgot to update `index.html` and the service worker cache list, creating version drift that broke the primary entry point.

---

## Fix Applied

### Version bumps (surgical fix):
- `index.html`: `crankmagic.css` v=119 → v=122 ✅
- `index.html`: `crankmagic-discover.js` v=57 → v=59 ✅
- Service worker: Updated SHELL cache to v=59 of discover.js ✅
- `crankmagic-app.js`: Bumped service worker registration v=208 → v=209 ✅
- All HTML files: `crankmagic-app.js` v=208 → v=209 ✅
- Service worker: Updated SHELL cache to v=209 of app.js ✅

### Pre-existing issues also fixed:
- `crankmagic-collection.js`: v=64 → v=65 (had changed without bump)
- `crankmagic-lab.js`: v=48 → v=49 (had changed without bump)

### Test infrastructure:
- `tests/fixtures/asset-versions.json` updated with correct hashes
- `tests/asset-versions.mjs` now passes ✅

---

## Verification Performed

### Local testing:
✅ Confirmed `index.html` now serves v=122 CSS and v=59 discover.js  
✅ Confirmed service worker SHELL cache references aligned versions  
✅ Confirmed app registers service worker as v=209  
✅ All asset-versions test passes

### Test suite results:
- ✅ `tests/asset-versions.mjs` - PASS (was failing on main)
- ⚠️ `tests/data-integrity.mjs` - FAIL (pre-existing, unrelated)
- ⚠️ `tests/generators.mjs` - FAIL (pre-existing, unrelated)
- ✅ All other suites pass

---

## UAT Setup Completed

### New UAT branch created:
- **Branch:** `uat` (created from `main`, now includes fix)
- **Purpose:** Testing ground before production deployment
- **Documentation:** `docs/uat-deployment.md` (full workflow guide)

### UAT Testing Instructions:

**Quick local test:**
```bash
git fetch origin
git checkout uat
npx http-server -p 8080 -c-1
# Open http://localhost:8080 in fresh incognito window
# Clear service worker in DevTools before testing
```

**Smoke test checklist:**
- [ ] Boot completes (Decks page loads, not stuck on "Opening your library")
- [ ] No console errors
- [ ] User Functions (☰) menu opens on-screen and works
- [ ] "Clear all data" button visible and clickable
- [ ] All nav links functional (Decks, Library, Explore, Play)
- [ ] Buttons respond to clicks
- [ ] No popover positioning issues
- [ ] Service worker v=209 registers correctly
- [ ] No regressions to Collection Design C or Explore features

---

## Deployment Workflow

```
Current state:
  ✅ Fix committed to cursor/hotfix-boot-version-skew-db47
  ✅ PR #258 opened to main (DRAFT)
  ✅ Fix deployed to uat branch for testing
  ✅ UAT documentation created

Next steps:
  1. ⏳ Run UAT smoke tests (manual)
  2. ⏳ Verify all checklist items pass
  3. ⏳ Comment results on PR #258
  4. ⏳ Mark PR ready for review
  5. ⏳ Merge to main (triggers production deploy)
```

---

## Files Changed

```
index.html                         - Version bumps for CSS, discover.js, app.js
crankmagic.html                    - Version bumps for collection.js, lab.js, app.js
crankmagic-sw.js                   - Updated SHELL cache with aligned versions
crankmagic-app.js                  - Bumped service worker registration to v=209
tests/fixtures/asset-versions.json - Recorded new content hashes
docs/uat-deployment.md             - New UAT workflow documentation
```

---

## Key Lessons

1. **Version skew is invisible**: Two HTML files requesting different versions of the same JS/CSS creates two cached copies. The older page never sees updates.

2. **Service worker amplifies the problem**: Once cached, mismatched assets persist indefinitely until versions align and caches invalidate.

3. **Tests caught it**: `tests/asset-versions.mjs` was failing on main with the exact files that caused the boot failure. The test suite would have prevented this if run before merge.

4. **Fix workflow matters**: UAT gate now in place - no merge to main without verification on the `uat` branch first.

---

## Production Deployment (After UAT Pass)

**DO NOT merge until UAT verification is complete.**

After successful UAT testing:
```bash
# 1. Mark PR ready
gh pr ready 258

# 2. Merge to main
gh pr merge 258 --squash --delete-branch

# 3. GitHub Pages deploys automatically from main
# URL: https://minorrob.github.io/mtg-deck-matrix/

# 4. Sync uat forward
git checkout uat
git merge --ff-only main
git push origin uat
```

---

## Contact

- **PR:** https://github.com/minorrob/mtg-deck-matrix/pull/258
- **UAT Docs:** https://github.com/minorrob/mtg-deck-matrix/blob/uat/docs/uat-deployment.md
- **Agent Run:** https://cursor.com/agents/bc-1013f96c-f98b-5795-a10d-000064f8db47
