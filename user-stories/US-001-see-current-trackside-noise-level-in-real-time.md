---
id: US-001
title: See the current trackside noise level in real time
status: delivered
created: 2026-07-22
updated: 2026-07-22
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story
As a Portland resident near PIR, I want the live dB reading and over/under-limit status, so I know if the raceway is currently exceeding its noise agreement.

## Acceptance criteria
AC: live view updates each second via WebSocket vs the active limit; feed-down shows a clear offline cause, not a stale number.

## Evidence
Evidence: `LiveView.tsx`, commit `36115d1`.
