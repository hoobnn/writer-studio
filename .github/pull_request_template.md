> ### Branch strategy
>
> - This repository is a fork of [Cherry Studio](https://github.com/CherryHQ/cherry-studio).
> - Active development targets `product/writer`.
> - Fixes to upstream Cherry Studio itself belong in the [upstream repository](https://github.com/CherryHQ/cherry-studio), not here.

### What this PR does

Before this PR:

After this PR:

<!-- (optional, in `fixes #<issue number>` format, will close the issue when the PR gets merged) -->

Fixes #

### Why we need it

The following tradeoffs were made:

The following alternatives were considered:

### Breaking changes

<!-- optional -->

If this PR introduces breaking changes, describe the change and its impact on users.

### Special notes for your reviewer

<!-- optional -->

### Checklist

- [ ] Branch: This PR targets `product/writer`
- [ ] Scope: Changes trace to the stated purpose; no unrelated refactoring
- [ ] Tests: `pnpm lint` and the tests covering this change pass locally
- [ ] Upstream: If this touches files shared with upstream, the diff avoids
      gratuitous re-indentation (`git diff -w` matches `git diff`)
