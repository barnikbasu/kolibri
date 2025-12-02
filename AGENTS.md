<!-- Generic guidance for all coding agents (Claude Code, Zed, Cursor, etc.)
     For Claude Code specific notes, see Claude.md -->

# Kolibri Development Guide for AI Coding Agents

**Project:** Kolibri - Offline learning platform for low-resource communities
**Stack:** Python/Django backend, Vue.js 2.7 frontend, pytest/Jest testing

## Quick Start

1. **Setup:** Follow `docs/getting_started.rst` completely
2. **Critical:** Run `pre-commit install` after setup (see `docs/getting_started.rst`)
3. **Required:** Export `KOLIBRI_RUN_MODE=dev` before running server

## Documentation Map

- **Setup & Workflow:** `docs/getting_started.rst`, `docs/development_workflow.rst`
- **Architecture:** `docs/stack.rst`, `docs/frontend_architecture/`, `docs/backend_architecture/`
- **Testing:** `docs/testing.rst` (TDD principles), `docs/frontend_architecture/unit_testing.rst`, `docs/backend_architecture/testing.rst`
- **How-tos:** `docs/howtos/` (specific tasks like rebasing, PR reviews)

## Critical Agent Gotchas

### ⚠️ Vuex is Deprecated
**DO NOT** create new Vuex stores or extend existing ones. Use Vue composables instead.
→ See `docs/frontend_architecture/composables.rst` and `docs/frontend_architecture/vuex.rst`

### ⚠️ Testing is Required
Nearly all code changes need tests:
- **Python:** Use pytest, write tests for all backend code
- **Vue:** Use Vue Testing Library (NOT vue-test-utils for new tests)
- **TDD:** Write failing test first for bugs, build features incrementally

→ See `docs/testing.rst` for TDD principles, specific testing docs for patterns

### ⚠️ Pre-commit Auto-fixes Files
When commit fails:
1. Pre-commit auto-fixes many issues (formatting, imports)
2. **You must `git add` the auto-fixed files again**
3. Then re-commit

→ See "Pre-commit hooks" section in `docs/getting_started.rst`

## Project Structure

```
kolibri/
├── docs/              # Developer documentation (your primary resource)
├── kolibri/
│   ├── core/         # Core: auth, content, logger, tasks (always enabled)
│   └── plugins/      # Plugins: learn, coach, facility (can be disabled)
```

→ See `docs/backend_architecture/plugins.rst` for core vs plugins decision guide

## Finding Patterns

**Don't guess - look at existing code:**
- API patterns → `docs/backend_architecture/api_patterns.rst` (ValuesViewset preferred)
- Component patterns → Search recent components, check `docs/frontend_architecture/`
- Test patterns → Look at existing test files in `__tests__/` or `test/` directories

## Common Commands

```bash
yarn run devserver       # Development server
yarn run test           # Frontend tests (Jest)
pytest                  # Backend tests
pre-commit run --all-files  # Run all linting checks
```

→ Full command reference in `docs/getting_started.rst`

## External Resources

- Design system: https://design-system.learningequality.org/
- User docs: https://kolibri.readthedocs.io/
