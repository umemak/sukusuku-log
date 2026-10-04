# GLOSSARY.md Format

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
A formal request by a customer to purchase one or more items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best canonical term and list the others under `_Avoid_`.
- **Keep definitions tight.** 1–2 sentences maximum. Define what it IS, not how it is implemented or what it does procedurally.
- **Domain-specific terms only.** General programming concepts (e.g., timeouts, caches, error types, utility helpers) do not belong, even if used extensively in the project. Ask: "Is this concept unique to this domain/business context?" Only domain concepts belong.
- **No implementation details or specs.** `GLOSSARY.md` must remain strictly a glossary. Do not record API endpoints, database schemas, function signatures, or scratch notes here.
- **Inline updates.** Add or update terms immediately as soon as they are clarified and agreed upon during the interview. Do not batch them at the end.
- **Group terms under subheadings** when natural clusters emerge in a larger domain.

## Single vs Multi-Context Repositories

### Single Context (Standard)
A single `GLOSSARY.md` at the repository root.

### Multiple Contexts (Bounded Contexts / Monorepos)
A `GLOSSARY-MAP.md` at the repository root lists each context, where its glossary lives, and how contexts interact:

```md
# Glossary Map

## Contexts

- [Ordering](./src/ordering/GLOSSARY.md): receives and tracks customer orders
- [Billing](./src/billing/GLOSSARY.md): generates invoices and processes payments
- [Fulfillment](./src/fulfillment/GLOSSARY.md): manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

### Context Resolution
1. If `GLOSSARY-MAP.md` exists at the root, read it to locate the relevant context glossary.
2. If only a root `GLOSSARY.md` exists, treat the repo as a single context.
3. If neither exists, lazily create root `GLOSSARY.md` when the first term is agreed upon.
