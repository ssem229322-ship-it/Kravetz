# AGENTS.md

This repository is a TypeScript monorepo for the Kraken / Kravetz orchestration runtime. Keep changes minimal, explicit, and test-driven.

## Project snapshot

- Package manager: pnpm
- Root scripts: `pnpm test`, `pnpm build`, `pnpm lint`
- Main runtime package: `packages/core`
- Source layout:
  - `packages/core/src/` for runtime logic and exported APIs
  - `packages/core/tests/` for Jest coverage and regression tests
  - `packages/contracts/`, `packages/integrity/`, `packages/provenance/`, `packages/validation/` for adjacent subsystems

## Working conventions

- Prefer small, targeted edits over large refactors.
- Preserve public interfaces unless a change clearly requires an API update.
- Read the existing implementation and tests before changing behavior.
- Follow the current TypeScript style and avoid introducing new frameworks or tooling without clear need.
- When a file name suggests a historical version (for example `.backup`, `.broken`, `.old`), do not delete it automatically; confirm whether it is referenced or intentionally preserved.

## Architecture notes

- `packages/core/src/index.ts` is the public entry point for the core package.
- `packages/core/src/orchestrator.ts` is the orchestrator that executes workflow steps, tracks runs, and resolves final artifacts.
- `packages/core/src/types.ts` defines the core contracts for tasks, runs, executions, and artifacts.
- `packages/core/src/persistence.ts` and `packages/core/src/agentRuntime.ts` define the persistence/runtime boundaries used by the orchestrator.
- Review the core tests in `packages/core/tests/` before making behavioral changes; they are the clearest examples of intended runtime behavior.

## Validation workflow

Before claiming a fix is complete:

1. Run the smallest relevant test command that exercises the changed behavior.
2. If the change affects shared contracts or orchestration flow, also run adjacent tests in the same package.
3. If TypeScript or lint errors appear, address them before finishing.

Use these commands from the repo root:

- `pnpm test -- --runInBand packages/core/tests/orchestrator.test.ts`
- `pnpm test -- --runInBand packages/core/tests/persistence.test.ts`
- `pnpm build`
- `pnpm lint`

## Repository expectations

- Keep implementation details aligned with the existing test surface.
- Prefer regression tests when fixing bugs or adjusting orchestrator behavior.
- Avoid broad cleanup unless it is required by the task.
- If a task is ambiguous, infer the least risky interpretation that preserves current contracts and behavior.

## Delivery guidance for autonomous agents

- Discover the actual repo state before deciding on a fix.
- Validate the root cause before editing code.
- Use the smallest possible patch that addresses the issue.
- Re-run the relevant checks after the fix and report the exact evidence.
- Preserve historical or backup artifacts unless there is explicit reason to remove them.

## Useful references

- [README.md](README.md)
- [package.json](package.json)
- [packages/core/src/index.ts](packages/core/src/index.ts)
- [packages/core/src/orchestrator.ts](packages/core/src/orchestrator.ts)
- [packages/core/tests/orchestrator.test.ts](packages/core/tests/orchestrator.test.ts)
