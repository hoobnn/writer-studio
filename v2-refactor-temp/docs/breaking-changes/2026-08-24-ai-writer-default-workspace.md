---
title: AI Writer is the default fresh workspace
category: changed
severity: notice
introduced_in_pr: TBD
date: 2026-08-24
---

## What changed

Fresh installs and empty main-window sessions now open the AI Writer workspace. Writer remains visible in the sidebar alongside Assistants, while previously persisted tabs continue to restore normally.

## Why this matters to the user

New users land in the local, project-based novel writing workflow instead of an empty chat tab. Chat, Agents, and the rest of Cherry Studio remain available from the sidebar and launchpad.

## What the user should do

Nothing — automatic. Existing tab sessions are not replaced.

## Notes for release manager

The Writer workspace stores each novel in a user-selected portable folder. Model generation sends only the context shown by Writer to the selected provider and never applies a proposal without an explicit user action.
