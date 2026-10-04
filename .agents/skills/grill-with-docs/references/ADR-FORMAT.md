# Architecture Decision Record (ADR) Format

ADRs live in `docs/adr/` and use sequential numbering with kebab-case slugs: `0001-slug.md`, `0002-slug.md`, etc.

Create the `docs/adr/` directory lazily: only when the first qualifying ADR is decided.

## Template

```md
# {Short title of the decision}

{1–3 sentences: what is the context, what was decided, and why.}
```

Keep ADRs brief. An ADR can be a single concise paragraph. Its value lies in recording *that* an architectural decision was made and *why*, preserving rationale without documentation bloat.

## Optional Sections

Include optional sections only when they provide critical context:

- **Status** (frontmatter or header): `proposed | accepted | deprecated | superseded by ADR-NNNN`
- **Considered Options**: Only when rejected alternatives are crucial to prevent future backtracking.
- **Consequences**: Only when non-obvious downstream impacts need to be explicitly recorded.

## Numbering

Scan `docs/adr/` for the highest existing prefix number and increment it by one (padded to four digits: e.g. `0001`, `0002`).

## The Three Gates for an ADR

Only propose an ADR when **all three** criteria are satisfied simultaneously:

1. **Hard to reverse**: The cost or complexity of unwinding this decision later is significant (e.g. storage schema, architectural paradigm, external dependencies).
2. **Surprising without context**: A future reader or engineer looking at the code would wonder "Why on earth was it built this way?"
3. **Result of a real trade-off**: There were valid alternative approaches, and one was chosen for specific, deliberate reasons.

If any criterion is missing, **do not write an ADR**.
- Easy to reverse? Skip it.
- Obvious / standard practice? Skip it.
- No reasonable alternative? Skip it.

### Examples of Qualifying Decisions
- Architectural paradigm (e.g. event sourcing, CQRS, monorepo structure).
- Inter-service or inter-context communication patterns (e.g. async event bus vs synchronous RPC).
- Foundational technology choices with lock-in (e.g. database engine, auth provider).
- Intentional deviations from standard idiomatic practices (e.g. raw SQL instead of ORM for specific throughput constraints).
- System boundary decisions (e.g. which service owns specific entities).
