# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

This repo contains scheduled GitHub Actions "watch jobs" that monitor ioBroker's central data sources (repository files, adapter list, statistics file) and alert maintainers by email and Telegram when a source becomes stale or unreachable. The check logic lives in Node.js scripts under `scripts/`, each driven by a workflow under `.github/workflows/`.

## Conventions

- Node.js ≥ 22. Scripts are plain CommonJS (`require`, `'use strict'`).
- Run `npm run lint` before committing changes to JavaScript.

## Maintaining the README

Whenever a check-workflow changes or is added, update `README.md` in the same change:

- **New check-workflow added:** add a row to the "Watch workflows" table (workflow name, script, monitored data source, cron schedule, staleness limit) and document any new secret it needs in the "Required secrets" table.
- **Existing check-workflow changed:** if the change affects the schedule, staleness limit, monitored data source, notification behaviour, or required secrets, update the corresponding README entry to match.

Keep the README the single source of truth for what each watch job does.
