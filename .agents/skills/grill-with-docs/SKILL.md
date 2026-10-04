---
name: grill-with-docs
description: Relentlessly interviews the user about a plan, feature, or design to establish a shared understanding, recording domain terms inline in GLOSSARY.md and hard architectural decisions in docs/adr/. Use when starting a change in a repo where requirements or domain terms are not yet settled.
---

# Grill with Docs (`/grill-with-docs`)

A structured, stateful interview skill that sharpens a feature, design, or architecture plan through iterative questioning ("grilling") while maintaining a paper trail of domain language (`GLOSSARY.md`) and architectural decisions (`docs/adr/`) directly in the codebase.

## When to Reach For It

- At the beginning of a feature, refactor, or architectural change within a repository.
- When domain concepts or plan details are still fuzzy or implicit.
- For work that can be settled within a single planning session.
- Fits at the head of the feature lifecycle:
  `grill-with-docs` ➔ `to-spec` ➔ `to-tickets` ➔ `implement` ➔ `code-review`

---

## Core Principles

1. **Stateful Documentation**: Unlike purely conversational planning, this skill records crystallizing knowledge to disk immediately during the session.
2. **Fact-Finding is Your Job, Not the User's**: Never ask the user questions that can be answered by reading the codebase. Investigate existing code, schemas, and configurations first.
3. **Decisions Belong to the User**: Formulate clear options and provide recommendations, but allow the user to make the call.
4. **Lazy File Creation**: Do not create boilerplate upfront. Create `GLOSSARY.md` only when the first term is settled, and `docs/adr/` only when the first qualifying decision is reached.

---

## Phase 1: Repository & Context Reconnaissance

Before posing any questions:
1. **Check for Existing Documentation**:
   - Look for `GLOSSARY-MAP.md` (multi-context repo) or `GLOSSARY.md` (single context).
   - Check `docs/adr/` for existing decision records.
2. **Inspect Related Code**:
   - Read relevant domain models, schema files, interfaces, or entry points related to the requested change.
   - Ground all questions in existing patterns and naming conventions.

---

## Phase 2: The Grilling Interview Loop

Model the topic as a **design tree** where high-level choices branch into downstream technical and domain implications.

### 1. Identify the Frontier
The **frontier** consists of questions whose prerequisites are already settled.
- Pick **exactly one question at a time** from the frontier to avoid overwhelming the user and to ensure deep alignment.
- Prioritize high-level architectural / UX decisions before downstream implementation details.

### 2. Format Each Question
Present the single question in a structured, actionable format with explicit recommendations:

```markdown
❓ **Q<Number>** - **<Concise Question Title>**: <Detailed question body, explaining trade-offs or listing viable choices>

➡️ **Recommended**: <Your recommended choice and justification based on codebase context>
```

### 3. Await User Input
Stop after presenting the single question. Wait for the user to respond before re-evaluating the frontier and proceeding to the next question.

---

## Phase 3: Domain Modeling & Inline Updates

Maintain the paper trail **as decisions happen during the interview**, not batched at the end.

### 1. Maintain `GLOSSARY.md` Inline
- **Challenge Inconsistencies**: When the user uses terms conflicting with `GLOSSARY.md` or existing code, call it out: *"The codebase uses `Tenant`, but you mentioned `Organization`. Are these identical or distinct concepts?"*
- **Sharpen Fuzzy Terms**: Propose precise canonical names for vague or overloaded terms.
- **Immediate Update**: As soon as a domain term resolves, immediately write or update `GLOSSARY.md`.
- **Strict Content Boundary**: `GLOSSARY.md` contains **only domain vocabulary and definitions (1–2 sentences)** with an `_Avoid_` list. Do NOT put specs, implementation details, or scratch notes in `GLOSSARY.md`.
- See [GLOSSARY-FORMAT.md](./references/GLOSSARY-FORMAT.md) for full specifications.

### 2. Record Qualifying Decisions in `docs/adr/`
Only offer an ADR when a decision meets **all three gates**:
1. **Hard to reverse**: Meaningful cost or disruption to change later.
2. **Surprising without context**: A future reader will wonder why it was done this way.
3. **Result of a real trade-off**: Deliberately chosen among valid alternatives.

- If any of the three criteria is missing, **do not write an ADR**.
- Keep ADRs minimal (1–3 sentences stating context, decision, and rationale).
- See [ADR-FORMAT.md](./references/ADR-FORMAT.md) for formatting and numbering rules.

---

## Phase 4: Completion & Handoff

The grilling session concludes when:
- The frontier is empty (all design branches explored and resolved).
- No unverified assumptions remain.
- The user confirms alignment on the plan.

### Next Steps:
- Inform the user of what was recorded (`GLOSSARY.md` updates, any generated ADRs).
- Note that conversational decisions (implementation details, logic flow) remain in context.
- Recommend transitioning directly to `/to-spec` (or `/implement` if the task is immediately actionable) in the same session without clearing the context.
