# Kiro Specs Reference

This note condenses the Kiro Specs documentation into a lightweight working reference.

## Core model

Every spec centers on three artifacts:

- `requirements.md` or `bugfix.md`
- `design.md`
- `tasks.md`

The high-level lifecycle is:

1. define what should happen
2. define how it should work
3. define how to implement and validate it

## Feature Specs

Use for:

- complex features
- work needing structured planning
- documentation for collaboration
- requirements or design that will iterate

### Requirements-First

Best when:

- desired system behavior is already known
- architecture can adapt
- product/customer needs drive the work
- starting greenfield

Flow:

1. `requirements.md`
2. `design.md`
3. `tasks.md`

### Design-First

Best when:

- architecture already exists
- strict non-functional requirements exist
- feasibility matters before scope commitment
- prototyping uses a fixed stack

Flow:

1. `design.md`
2. `requirements.md`
3. `tasks.md`

Design-First can start from:

- high-level architecture
- low-level design or pseudocode
- imported diagrams or documents

## EARS requirements

Preferred requirement shape:

```text
WHEN [condition/event]
THE SYSTEM SHALL [expected behavior]
```

Benefits:

- clarity
- testability
- traceability
- easier conversion into properties and tests

## Bugfix Specs

Use for:

- non-trivial bugs
- critical paths
- fixes with regression risk
- cases needing root-cause documentation

`bugfix.md` should capture:

- current incorrect behavior
- expected correct behavior
- unchanged behavior that must continue working

The unchanged-behavior section is essential because it protects surrounding functionality from accidental breakage.

## Correctness and PBT

Property-based testing is especially useful when the requirement describes a rule that should hold across many inputs.

Use it to validate:

- feature behavior over broad input spaces
- bug reproduction and bug elimination
- unchanged behavior for regression prevention

Treat PBT as strong empirical evidence, not absolute proof.

## Operational guidance

- keep multiple focused specs instead of one giant repo-wide spec
- store specs with the code in version control
- update tasks when implementation already exists
- use a new Feature Spec if a workflow must fundamentally change
- use quick chat fixes only for simple, well-understood issues
