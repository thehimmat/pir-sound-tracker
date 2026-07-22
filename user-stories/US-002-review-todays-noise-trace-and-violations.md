---
id: US-002
title: Review today's noise trace and violations
status: delivered
created: 2026-07-22
updated: 2026-07-22
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story
As a viewer, I want today's second-by-second trace and a day-status banner, so I can tell whether a violation happened earlier.

## Acceptance criteria
AC: chart + threshold line + banner; variance-event days reflect the higher permitted limit.

## Evidence
Evidence: `TodayView.tsx`, commits `6cb7a7e`, `34f6fbf`.
