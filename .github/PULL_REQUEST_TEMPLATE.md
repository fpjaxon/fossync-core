<!--
Thanks for contributing to fossync! A few quick things before you open this PR:
 - By submitting it, you agree to the contributor terms in CONTRIBUTING.md.
 - Keep PRs focused — one change per PR is easier to review and ship.
-->

## Summary

<!-- What does this change do, and why? -->

Closes #<!-- issue number, if any -->

## Type of change

- [ ] Bug fix
- [ ] New or updated site module
- [ ] New feature / enhancement
- [ ] Docs only
- [ ] Refactor / chore

## How was this tested?

<!-- Describe what you ran. For sync-affecting changes, the two-tab check below is the real test. -->

- [ ] `pnpm -r test` passes
- [ ] `pnpm -r typecheck` passes
- [ ] Manually verified two tabs stay in sync (play / pause / seek follow within a tick)

## Checklist

- [ ] I've read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to the **contributor terms** (Floatpoint, LLC may use my contribution commercially in fossync Cloud).
- [ ] A new site module follows the existing `SiteModule` pattern in `apps/extension/src/sites/`.
- [ ] This change does **not** stream, store, or proxy video — fossync only syncs control signals.
- [ ] I updated docs (README / CONTRIBUTING) if the change needs it.
- [ ] My commits follow the conventional-commit style used in this repo (e.g. `feat(extension): …`).
