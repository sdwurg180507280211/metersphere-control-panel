# Kiro Spec Bootstrap Pack

This pack is a portable starter kit for bringing Kiro-style Spec workflows into another repository.

## Contents

- `global/AGENTS.md` - global preference template for `~/AGENTS.md`
- `repo/AGENTS.md.template` - repository-level AGENTS template
- `specs/feature/` - feature spec templates
- `specs/bugfix/` - bugfix spec templates
- `skill/kiro-specs/` - portable copy of the reusable `kiro-specs` skill

## Fastest path

1. Install or copy `skill/kiro-specs/` into `~/.codex/skills/`
2. Merge `global/AGENTS.md` into `~/AGENTS.md`
3. Create repo-level `AGENTS.md` from `repo/AGENTS.md.template`
4. Copy `.kiro/specs/_templates/` from this pack into the target repository
5. Create a real spec from an existing design doc, implementation plan, PRFAQ, or bug report

## Scripted bootstrap

Run:

```bash
scripts/bootstrap-kiro-spec.sh --target-dir /path/to/target-repo --install-skill
```

Optional:

```bash
scripts/bootstrap-kiro-spec.sh \
  --target-dir /path/to/target-repo \
  --project-name my-project \
  --install-skill \
  --install-global-agents
```
