# User Working Preferences

## Kiro-style Specs

For non-trivial software work, prefer a Kiro-style spec workflow before or alongside implementation.

- If the `kiro-specs` skill is available, use it for feature planning, design decomposition, task breakdown, and bugfix analysis.
- If the skill is unavailable, still follow the same workflow directly.
- First classify the work as `Feature Spec` or `Bugfix Spec`.
- For features, choose `Requirements-First` when the desired behavior is already clear and architecture can adapt.
- For features, choose `Design-First` when architecture, fixed stack, non-functional requirements, performance, security, compliance, or feasibility constraints drive the scope.
- Organize non-trivial work around three artifacts whenever practical: `requirements.md` or `bugfix.md`, `design.md`, and `tasks.md`.
- If the repository already uses `.kiro/specs/` or an equivalent structure, follow it; otherwise mirror the same three-artifact model using local project conventions.
- Write requirements in EARS style whenever practical:

```text
WHEN [condition or event]
THE SYSTEM SHALL [expected behavior]
```

- For bugfix work, explicitly capture:
  - current incorrect behavior
  - expected correct behavior
  - unchanged behavior that must continue working
- Keep implementation tasks granular, executable, and traceable to requirements or bugfix analysis.
- When upstream requirements or design change, keep downstream design and tasks synchronized.
- Suggest property-based testing when the requirement describes a general rule over many inputs, especially for regression prevention.
- For trivial or clearly bounded edits, do not force full ceremony; apply the same thinking in lightweight form.

## Communication Preference

- When using this workflow, briefly state the classification and chosen workflow before drafting artifacts or coding.
- Prefer concise, working documents over long theory.
