# Agent Note: A roadmap tier for status and direction documents

Status: implemented

English | [中文](2026-09-22-docs-roadmap-tier.zh.md)

## Problem

The [documentation tier taxonomy](../../../../docs/AGENTS.md) gives every committed document one home, but all of those homes hold current-state mechanism prose, decision records, incidents, procedures, or product guides. Point-in-time surveys of where the project stands, requirement drafts that are not yet decisions, and thematic roadmaps had no committed home: the slop checklist rejects status annotations in mechanism docs, so this material either broke the standard or stayed in uncommitted scratch files, invisible to the team and unlinkable from committed docs. The local scratch ignore name `local-doc` also said nothing about what belonged there.

## Decision

- **`docs/roadmap/` is the status-and-direction tier**, with three kinds that each own a subdirectory created with its first document. `surveys/` holds dated snapshots (`surveys/YYYY-MM-DD-<topic>.md`) that are never edited in place after landing; a newer survey of the same topic supersedes the older one with a pointer line. `incubation/` holds requirement drafts opened by `Status: incubating`; a draft is ephemeral and its file leaves the directory when it graduates into a `proposed/` Agent Note or shipped change, or when it is dropped — with reasoning worth keeping recorded as a `rejected/` note. `roadmaps/` holds living per-theme direction documents that state intent, never commitment; an item that becomes concrete work leaves as a `proposed/` note or a shipped change.
- **Authoring rules live in [docs/roadmap/AGENTS.md](../../../../docs/roadmap/AGENTS.md)**, English-only like the other agent-instruction files and listed in the pairing-manifest exclusions; the bilingual [README](../../../../docs/roadmap/README.md) orients readers and indexes current documents, one row per document, updated in the same change as the document.
- **[docs/AGENTS.md](../../../../docs/AGENTS.md) names the tier** in its taxonomy table, its placement line, and the slop checklist, so status and forward-looking material has exactly one home and mechanism docs stay free of it. Its ceiling rises from 1320 to 1435 words: the tier row and pointers genuinely need the space (1361 words, restoring at least 5% headroom), per the raise-with-justification rule.
- **The local scratch directory is renamed** from `local-doc` to `scratch` in `.gitignore` and on disk; it remains uncommitted human working material, distinct from the committed tier.

The [doc-tiers note](2026-07-04-doc-tiers-and-budgets.md) owns the taxonomy and budget rationale this decision extends.

## Alternatives considered

**Agent Notes as the home for roadmaps and drafts.** Rejected: an Agent Note is a path-encoded record of one decision and its alternatives; a thematic roadmap spans many still-open items and a survey records no decision, so neither satisfies the note skeleton or its gates, and forcing them in would fill the active tree with spec-speak.

**A root-level English-only directory.** Rejected: every committed human-facing document in this repository is bilingual under the universal pairing requirement, and a tree outside `docs/**` would also escape `verify-md-links` and `verify-md-wrap` coverage — two gates lost to dodge one.

**Keep status material uncommitted.** Rejected: a shared understanding of status and direction is exactly the content that rots fastest when invisible, and uncommitted files cannot be cross-linked from committed docs.

**`docs/plans/` as the name.** Rejected: `plan` already names the plan-mode package and its logged state; `roadmap/` avoids overloading a runtime term.

## Consequences

- Status, direction, and forward-looking content has one committed home; the slop checklist now points mechanism-doc authors at it.
- The tier starts empty: rules and index are committed, and each kind's subdirectory appears only with its first document.
- Every document in the tier costs a bilingual pair; surveys additionally cost a successor-pointer edit in both languages when re-surveyed.
- The directory cannot accumulate abandoned drafts, because an incubation file exists only while its requirement is actively developed.
- The scratch rename touches only `.gitignore` and the untracked local directory; no committed content referenced `local-doc`.
