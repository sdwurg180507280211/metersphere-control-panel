---
name: kiro-specs
description: Structure software work using Kiro-style Specs for features and bug fixes. Use when Codex should turn an idea, requirement set, architecture draft, implementation plan, API design, PRFAQ, or bug report into a spec workflow with `requirements.md` or `bugfix.md`, `design.md`, and `tasks.md`; classify work as feature or bugfix; choose between Requirements-First and Design-First; write EARS requirements; preserve unchanged behavior in bugfixes; or use property-based testing to validate correctness and prevent regressions.
---

# Kiro Specs

Use this skill to drive work as a specification-first workflow instead of jumping straight into code.

## Quick Triage

Make three decisions up front:

1. Is this a **Feature Spec** or a **Bugfix Spec**?
2. If it is a feature, should it be **Requirements-First** or **Design-First**?
3. Does this task need a **full spec**, or only a **lightweight spec mindset**?

Default choices:

- Use **Feature Spec** for new capabilities, architecture evolution, system integration, platformization, or multi-step implementation.
- Use **Bugfix Spec** for defects that need root-cause analysis, regression prevention, or strict control over what must not change.
- Use a **lightweight spec mindset** instead of a full spec for trivial, clearly bounded, low-risk edits.

Load `references/decision-rules.md` when classification is ambiguous, when choosing the workflow, or when converting existing documents into spec artifacts.

## Core Artifacts

Organize each spec around three files:

- `requirements.md` for feature requirements, or `bugfix.md` for bug analysis
- `design.md` for architecture, data flow, interfaces, testing, and trade-offs
- `tasks.md` for discrete implementation tasks with clear outcomes

If the repo already contains a `.kiro/specs/` structure, follow it. Otherwise, mirror the same three-artifact model in the local project conventions.

## Feature Spec Workflow

### Requirements-First

Follow this order:

1. Define the desired behavior in `requirements.md`
2. Review and refine edge cases, acceptance criteria, and user stories
3. Produce `design.md` from confirmed requirements
4. Break implementation into `tasks.md`
5. Execute tasks and keep task status current

Use this workflow when product behavior is known before technical design.

### Design-First

Follow this order:

1. Define the architecture or low-level design in `design.md`
2. Capture constraints such as latency, throughput, security, compliance, fixed stack choices, or operational requirements
3. Derive feasible requirements into `requirements.md`
4. Break implementation into `tasks.md`
5. Execute tasks and keep task status current

Use this workflow when technical constraints shape what is possible.

## Requirements Style

Write requirements in EARS form whenever possible:

```text
WHEN [condition or event]
THE SYSTEM SHALL [expected behavior]
```

Prefer requirements that are:

- unambiguous
- testable
- traceable to implementation
- explicit about edge cases and failures

When refining feature requirements, check:

- who the user is
- what they want to accomplish
- why it matters
- success criteria
- edge cases
- error handling
- compatibility constraints

## Bugfix Spec Workflow

Use `bugfix.md` to capture three things explicitly:

### Current Behavior

```text
WHEN [condition]
THEN the system [incorrect behavior]
```

### Expected Behavior

```text
WHEN [condition]
THEN the system SHALL [correct behavior]
```

### Unchanged Behavior

```text
WHEN [condition]
THEN the system SHALL CONTINUE TO [existing behavior]
```

Always preserve unaffected behavior explicitly. Treat this as a first-class regression-prevention mechanism, not an optional note.

Then use `design.md` to document:

- root cause
- proposed fix
- scope boundaries
- what must not change
- how the fix will be validated

Then use `tasks.md` to implement:

- reproduction coverage
- fix implementation
- regression checks

## Source-to-Spec Guidance

When the user provides existing material, do not copy it mechanically. Convert it:

- turn plans, PRFAQs, and product docs into user stories and EARS requirements
- turn architecture, API, and operations docs into design constraints and implementation structure
- turn bug reports and regression notes into current behavior, expected behavior, and unchanged behavior
- turn long narratives into executable tasks with phases, dependencies, and validation steps

Load `references/decision-rules.md` for detailed mapping rules.

## Correctness and Testing

Prefer property-based testing when the requirement describes a general rule rather than a single example.

Translate suitable requirements into universal properties such as:

- for any valid input meeting condition X, behavior Y holds
- unchanged behavior continues to hold across broad input ranges

Use property-based testing especially for:

- EARS-style feature requirements
- bugfix regression prevention
- validation across many input combinations
- finding edge cases humans may not enumerate manually

Do not claim formal proof. Treat PBT as stronger evidence of correctness than example-only tests.

## Iteration Rules

When specs change, keep downstream artifacts synchronized:

- If `requirements.md` changes, update `design.md` and `tasks.md`
- If `design.md` changes in Design-First flow, re-validate or regenerate requirements
- If code already exists, scan the implementation and mark completed tasks before adding new ones

Do not switch a Feature Spec workflow mid-stream unless there is a strong reason. Prefer starting a new spec if the entire framing changes.

## Practical Defaults

When asked to help with Kiro-style work, default to this operating mode:

- classify the request as Feature Spec or Bugfix Spec
- choose Requirements-First or Design-First with a brief justification
- decide whether full spec ceremony is warranted
- draft the three artifacts in order
- keep tasks granular and executable
- include regression-preservation statements for bugfixes
- suggest property-based tests when requirements describe broad behavioral rules

## Output Templates

### Minimal feature requirement

```text
## [Feature Name]

WHEN [condition]
THE SYSTEM SHALL [behavior]
```

### Minimal bugfix analysis

```text
## Current Behavior
WHEN [condition]
THEN the system [incorrect behavior]

## Expected Behavior
WHEN [condition]
THEN the system SHALL [correct behavior]

## Unchanged Behavior
WHEN [condition]
THEN the system SHALL CONTINUE TO [existing behavior]
```

## References

- Load `references/decision-rules.md` when you need detailed classification rules, workflow selection criteria, source-to-spec mapping, or guidance on when not to build a full spec.
- Load `references/kiro-specs-reference.md` when you need a compact reminder of artifact structure, workflow flow, bugfix rules, and correctness guidance.
