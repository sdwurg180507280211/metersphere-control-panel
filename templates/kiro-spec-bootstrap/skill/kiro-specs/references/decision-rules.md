# Kiro Specs Decision Rules

Use this reference when deciding whether to create a spec, what kind of spec to create, how to choose the workflow, and how to convert existing documents into spec artifacts.

## 1. Full spec or lightweight mode

Use a **full spec** when one or more of the following is true:

- the work spans multiple files, services, or layers
- the implementation will take multiple meaningful steps
- there are compatibility, migration, operational, or rollout concerns
- there are real architectural choices or trade-offs
- the task is likely to require iteration with the user
- regression risk is meaningful
- the result should remain as long-lived project documentation

Use a **lightweight spec mindset** instead when all of the following are true:

- the change is small and clearly bounded
- the expected behavior is obvious
- there is little ambiguity or architectural choice
- regression risk is low
- a full three-file spec would add more ceremony than value

In lightweight mode, still do this briefly:

1. classify the work
2. state the expected behavior or fix boundary
3. list a short implementation plan
4. mention validation

## 2. Feature Spec vs Bugfix Spec

Choose **Feature Spec** when the work is primarily about:

- adding new capability
- extending or platformizing behavior
- redesigning or re-architecting a subsystem
- integrating systems or introducing new workflows
- formalizing a plan, design, PRFAQ, or roadmap into executable work

Choose **Bugfix Spec** when the work is primarily about:

- incorrect existing behavior
- diagnosing a defect
- preventing regressions around an existing code path
- constraining what must stay unchanged
- recovering from repeated failed fix attempts

If the user says "fix" but the solution clearly requires major new capability, split the problem:

- keep a narrow **Bugfix Spec** for the original defect
- create a separate **Feature Spec** for the new capability

## 3. Requirements-First vs Design-First

Choose **Requirements-First** when:

- the desired behavior is already clear
- the main uncertainty is how to implement the behavior
- product/user needs should lead the design
- architecture is flexible
- the input is mostly stories, outcomes, acceptance criteria, or business intent
- the user is giving you a fresh request and expects you to derive the requirements yourself

Default principle: if the user is expressing a new need directly, prefer a requirements-oriented `requirements.md` first, and keep low-level implementation detail out of that file unless it is a true external constraint.

Choose **Design-First** when:

- architecture or low-level design already exists
- the main uncertainty is what is feasible under technical constraints
- non-functional requirements dominate scope
- the tech stack, topology, compliance, security, latency, throughput, or operations model is largely predetermined
- the input is mostly implementation plans, API designs, architecture docs, runbooks, or operational constraints

When in doubt, ask:

- "Do we already know what the system must do?" → lean Requirements-First
- "Do we already know or need to fix how it must be built?" → lean Design-First

## 4. Source-to-spec mapping

### Plan or implementation proposal

Typical inputs:

- implementation plan
- migration plan
- roadmap slice
- technical rollout proposal

Mapping:

- `design.md`: target architecture, phases, risks, constraints, file mapping
- `requirements.md`: user-visible or operator-visible behaviors and guarantees
- `tasks.md`: phased implementation steps, compatibility work, validation work

Default bias: usually **Feature Spec + Design-First**

### Architecture or API design document

Typical inputs:

- API contract
- architecture diagram explanation
- component design
- operations baseline

Mapping:

- `design.md`: primary source of truth
- `requirements.md`: derive feasible behavioral requirements from the design
- `tasks.md`: implementation, integration, migration, and verification work

Default bias: usually **Feature Spec + Design-First**

### PRFAQ, product requirement, feature request

Typical inputs:

- product memo
- PRFAQ
- user story list
- feature request

Mapping:

- `requirements.md`: primary source of truth
- `design.md`: derive architecture and implementation approach from requirements
- `tasks.md`: build sequence and validation

Default bias: usually **Feature Spec + Requirements-First**

### Bug report, regression note, incident review

Typical inputs:

- bug ticket
- regression report
- incident postmortem with a code defect
- reproduction notes

Mapping:

- `bugfix.md`: current behavior, expected behavior, unchanged behavior
- `design.md`: root cause, fix boundary, regression protection
- `tasks.md`: reproduce, fix, verify, prevent regressions

Default bias: usually **Bugfix Spec**

## 5. How to extract requirements from design-heavy documents

When the input is design-heavy, avoid copying implementation detail into `requirements.md`.

Instead, derive statements about what the system must guarantee:

- externally visible behavior
- operator-visible outcomes
- compatibility requirements
- recovery guarantees
- observability requirements
- concurrency or safety guarantees

Good derived requirement examples:

- WHEN a long-running service control task starts, THE SYSTEM SHALL return a stable `jobId`.
- WHEN a locked resource is already in use, THE SYSTEM SHALL return a conflict response with a structured error.
- WHEN recovery scanning completes, THE SYSTEM SHALL expose the converged terminal state to clients.

## 6. How to extract design from requirement-heavy documents

When the input is requirement-heavy, use `design.md` to answer:

- what layers or components change
- what data model or contract is needed
- what states or transitions are required
- what error handling and rollback paths exist
- what validation or observability mechanisms are necessary

Do not leave `design.md` as generic prose; make it implementation-shaping.

## 6A. Requirements tone principle

Treat `requirements.md` as the statement of intended behavior, not as a dump of implementation detail.

Default style by input type:

- if the user gives a fresh feature request, make `requirements.md` primarily user-facing, operator-facing, or behavior-facing
- if the input is design-heavy, it is acceptable for `requirements.md` to be more engineering-oriented, but it should still describe guarantees rather than implementation mechanics
- keep Redis internals, lock algorithms, topology choices, helper names, and file-level implementation detail in `design.md` unless they are externally visible constraints

Do not treat a design-first, engineering-heavy `requirements.md` as the universal default template. That is a special case driven by technical source material.


## 7. Task decomposition rules

Good tasks are:

- executable
- scoped to a meaningful unit of work
- traceable to requirements or bugfix analysis
- explicit about compatibility or migration work
- explicit about validation work

Include tasks for:

- new files or components
- modification of existing interfaces
- compatibility bridges
- migration or rollout support
- validation, recovery, and regression checks
- documentation updates when the change affects long-lived behavior

Avoid tasks that are too vague, such as:

- "implement backend"
- "update frontend"
- "fix the bug"

Prefer tasks like:

- "add `jobService` for task persistence and lock management"
- "update `buildController` to return `jobId` while preserving `buildId` compatibility"
- "verify absolute command path handling for `mvnw` and `npm` execution"

## 8. When not to preserve the existing workflow

Sometimes the source document reflects a poor framing. In that case, preserve the goal, not the exact structure.

You may restructure the source material when:

- the document mixes requirements, design, and tasks chaotically
- the document contains duplicate sections
- the document is too implementation-heavy for `requirements.md`
- the document is too vague for `design.md`

But do not silently drop important constraints. Re-home them into the right artifact.

## 9. Sync rules after implementation starts

After code work begins:

- update `tasks.md` to reflect completed work
- revise `design.md` if the technical approach changes materially
- revise `requirements.md` only when the intended behavior truly changes
- add validation results or follow-up notes to repo docs when useful

If reality diverges sharply from the original framing, prefer creating a new spec instead of mutating the old one beyond recognition.

## 10. Execution truthfulness rule

Keep the spec honest about execution state.

You may improve an unexecuted spec by adding:

- glossary or key concepts
- clearer diagrams or earlier visual summaries
- better task granularity
- checkpoint definitions
- validation plans

You must not imply execution that has not happened. In particular, do not:

- mark tasks as complete without real execution
- fabricate checkpoint results
- write validation outcomes that have not been observed
- make an unexecuted spec look like an in-progress or completed rollout

Distinguish clearly between:

- task design
- checkpoint design
- actual execution progress
- actual validation results

## 11. Spec execution sync rule

Once implementation starts, keep `tasks.md` synchronized continuously instead of updating it only at the end.

Execution workflow:

1. before implementation, read `tasks.md` and use it as the execution plan
2. after finishing a meaningful batch of work, immediately update `tasks.md`
3. after real verification is performed, update `Checkpoint` and `Validation` items
4. do not wait until all coding is done to backfill task progress

Practical guidance:

- mark implementation tasks complete only after the corresponding code change is actually landed
- keep checkpoint items pending until the checkpoint is actually exercised
- keep validation items pending until the corresponding verification really ran
- if implementation scope changes mid-flight, update `tasks.md` before continuing too far

This rule exists to prevent drift between spec state and code state during long or multi-phase work.
