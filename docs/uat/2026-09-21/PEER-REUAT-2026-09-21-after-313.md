# Peer re-UAT after Claude #313/#314 — 2026-09-21 ~12:53 PM ET

**Stance:** Zero code. Accepted Claude dispositions (CM-DS-010 auto-fill lock; UAT-DELTA-01 Start+countdown stays; DR-P05 → game surface).

**Host:** Personal-HP tip `3c3e285` (#314). Fresh `serve-review.mjs` after restart. Doctor → JDK `CrankMagic\runtime\jdk-17.0.20.1+1`. Pins game.js?v=61 · online.js?v=13.

## Cleared this re-run

| ID | Result | Evidence |
|----|--------|----------|
| **UAT-START-02** | **PASS** | Start→Forge → `/api/live` **ready**; Forge pid 10944; ~30s; no javac ENOENT |
| **UAT-START-01** | PASS | Host+3AI prepare CommanderPodPack |
| **UAT-GUEST-01/02 / ENV-02** | **PASS (ops path)** | https guestOrigin via cloudflared; invite `#table=&invite=` minted; guest.mjs 200. Full browser seat-join not driven |
| **E-01b** | PASS | Explore page heads (not Discover) |
| **EXP-J2-01** | PASS | Facets after Advanced Tools open |
| **EXP-J4-01** | PASS | Add/Buy → To Buy |

## Still open (agree with Claude — Library / design debt)

| ID | Severity | Note |
|----|----------|------|
| LIB-06 | S2 | want-list entries excluded from To buy |
| L-02 | S2 | Sheet Bench/To buy not editable; chrome vs gallery |
| LIB-01 / LIB-04 | S3 | Head order; identity pips |
| CM-DS-005 | S3 Partial | Aether on primary matrix buttons; brass residual on nav links + form fields in crankmagic.css |
| CM-DS-009 / 012 | S2 | Library .compact 32px |
| CM-DS-001 / 004 / 011 | S2 | Dead v-* sweep needs dedicated PR |
| EXP-J1-01 | — | Needs seeded deck for Decks→scoped Explore |
| DR-P09 | ops | Desktop shortcut WD vs repo (if still dual) |
| lobby-permutations | infra | Playwright ESM import fail on node helper |

## Not re-filed
CM-DS-010 · UAT-DELTA-01 · DR-P05 (lobby)

## Highest-value next (optional)
1. Browser guest join to minted invite (one click path).  
2. Seed Load Live → EXP-J1-01 deck-scoped Explore.  
3. Host+3AI through R3 once (Forge already ready).  
4. Library PR for LIB-06 + L-02 when Claude picks that lane.
