# UAT Deployment Setup

## Overview

The `uat` branch provides a testing environment for changes before they reach production (`main` branch → GitHub Pages).

## Current Setup

- **Production branch**: `main`
- **Production URL**: https://minorrob.github.io/mtg-deck-matrix/
- **UAT branch**: `uat`
- **UAT URL**: See testing options below

## UAT Testing Options

### Option 1: Local HTTP Server (Recommended for immediate testing)

```bash
# Clone and checkout uat branch
git fetch origin
git checkout uat

# Serve locally
npx http-server -p 8080 -c-1

# Open in fresh browser session
# URL: http://localhost:8080
# Use incognito/private mode to avoid cached service worker
```

**Important**: Clear service worker cache in DevTools (Application → Service Workers → Unregister) before testing.

### Option 2: Temporary GitHub Pages Switch

**⚠️ This affects the production URL temporarily**

```bash
# Temporarily switch GitHub Pages to uat branch
gh api -X PATCH repos/minorrob/mtg-deck-matrix/pages \
  -f source[branch]=uat \
  -f source[path]=/

# Test at: https://minorrob.github.io/mtg-deck-matrix/
# Wait 1-2 minutes for deployment

# Switch back to main when done
gh api -X PATCH repos/minorrob/mtg-deck-matrix/pages \
  -f source[branch]=main \
  -f source[path]=/
```

### Option 3: GitHub Actions Workflow (Future enhancement)

Create `.github/workflows/uat-deploy.yml`:

```yaml
name: Deploy UAT
on:
  push:
    branches: [uat]
  workflow_dispatch:

jobs:
  deploy-uat:
    runs-on: ubuntu-latest
    environment:
      name: uat
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

This would deploy to a separate GitHub Pages environment (requires GitHub Enterprise or paid plan for multiple environments).

## UAT Smoke Test Checklist

Before promoting any change from `uat` to `main`, verify:

- [ ] App boots successfully past "Opening your library" screen
- [ ] User Functions menu (☰) opens on-screen and is usable
- [ ] "Clear all data" button is visible and functional
- [ ] Navigation works (Decks, Library, Explore, Play)
- [ ] All buttons respond to clicks
- [ ] No console errors during normal operation
- [ ] Service worker registers correctly (check DevTools)
- [ ] No layout/CSS issues with popovers or menus
- [ ] No regressions to Collection Design C Wanted
- [ ] No regressions to Explore progressive disclosure

## Promoting from UAT to Production

After successful UAT verification:

```bash
# Ensure uat has the tested changes
git checkout uat
git log -1  # Verify the commit

# Merge to main (fast-forward only for safety)
git checkout main
git merge --ff-only uat

# Push to production
git push origin main

# GitHub Pages will automatically deploy from main
```

## Workflow Summary

```
feature branch → PR to main (DRAFT)
                 ↓
              uat branch (testing)
                 ↓
            UAT verification
                 ↓
          Mark PR ready → Merge to main
                 ↓
         Production deploy (GitHub Pages)
```

## Notes

- The `uat` branch should always be a fast-forward of `main` plus tested changes
- Never force-push to `uat` or `main`
- Each hotfix/feature should go through UAT verification
- Keep `uat` in sync with `main` after each merge:
  ```bash
  git checkout uat
  git merge --ff-only main
  git push origin uat
  ```
