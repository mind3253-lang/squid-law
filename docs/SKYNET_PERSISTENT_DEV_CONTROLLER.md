# SKYNET autonomous development controller — architecture (2026-10-22)

## Goal
Build a persistent GPT API-based development operator, not a ChatGPT conversation-dependent workflow. Repository: mind3253-lang/squid-law. Target: Gabia host, production database and analysis worker. GitHub Actions provides the CI/CD execution channel.

## Durable execution contract
- Persist task ID, instruction, plan version, stage, checkpoint, changed file SHA, test results, errors and deployment result in PostgreSQL before any API response.
- Stages: queued -> analyzing -> editing -> testing -> awaiting_approval (only for consequential changes) -> deploying -> verifying -> completed/failed.
- Workers claim tasks transactionally with SKIP LOCKED and leases. Expired leases are recoverable. Idempotency keys prevent duplicated deployment actions.
- Each GPT API call receives a bounded, server-built context from durable records, repo diffs and current logs; model conversation history is not authoritative state.
- Preserve user-defined priorities and exclusions across sessions. Compare newly provided evidence against prior analyses rather than reprocessing unchanged data.
- A failed task records the exact failure and suggested recovery; it must not silently report success.

## Control plane
- GitHub repository is source of truth for code.
- GitHub Actions runs lint/tests, builds, deployment and service checks using scoped SSH credentials.
- Gabia service runner handles authorized operations; no arbitrary shell sourced from model text.
- Operator UI exposes task queue, current phase, last verified commit, error, retry and stop controls.
- API credentials and server secrets stay in GitHub Actions secrets or root-owned environment files; never in prompts or logs.

## Initial implementation sequence
1. Confirm existing SSH GitHub Action green and actual sudo scope.
2. Establish a repeatable CI/CD pipeline with controlled operations and audit logs.
3. Add PostgreSQL durable task schema and queue worker with crash recovery.
4. Add GPT API planner/editor/executor integration with structured tool outputs.
5. Connect UI to the durable queue and display verified outcomes.
6. Complete Gabia worker environment configuration and verify real end-to-end analysis before speed tuning.

## Acceptance tests
- Kill/restart worker mid-task; it resumes from saved checkpoint without repeating irreversible actions.
- New chat/session reads the same task and last verified outcome.
- Multiple users enqueue concurrently; work is processed without loss.
- Invalid deployment does not change the active production version.
- Logs never reveal secret values.
