# Local build recovery

If `git pull` reports a conflict in `src/components/account/AgeVerificationGate.tsx`, keep the current `main` version unless you intentionally need an older local change. The production version includes the parent-approval error-response handling.

Recommended recovery from the repository root:

```powershell
git status
git checkout --theirs -- src/components/account/AgeVerificationGate.tsx
git add src/components/account/AgeVerificationGate.tsx
git status
npm.cmd test
npm.cmd run build
```

If you need the stashed local edit, inspect it first with:

```powershell
git stash list
git stash show -p 'stash@{0}'
```

Do not run `npm.cmd run buildnpm.cmd run build`; that is interpreted as an npm script named `buildnpm.cmd`.
