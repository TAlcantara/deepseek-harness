# AGENTS.md — Roadmap, incubation, and surveys

This directory is the documentation tier for status and direction: dated current-state surveys, incubating requirements, and thematic roadmaps. Follow [docs/AGENTS.md](../AGENTS.md); this file adds the local rules. The [README](README.md) orients readers and indexes current documents.

## The three kinds

Each kind owns one subdirectory, created together with its first document. Every document is a bilingual pair under the [i18n contract](../i18n/README.md); this AGENTS.md itself stays English-only.

### `surveys/` — dated current-state analysis

A survey is a point-in-time analysis of where the project, a subsystem, or a cross-cutting concern stands: gaps, risks, and observations that span packages and that no single reference document owns. Name it `surveys/YYYY-MM-DD-<topic>.md` with the survey date. A survey is a snapshot: never update its body after it lands. Re-survey the same topic as a new dated file, add a one-line `Superseded by: […](…)` pointer directly under the older file's language switcher (both languages, re-recorded), and move the README index row to the newest survey.

### `incubation/` — requirement drafts

An incubation document develops a requirement that is not yet a decision: problem space, user scenarios, candidate directions, open questions. Name it `incubation/<topic>.md` and open the body with `Status: incubating` on its own line. Keep the document current while it is active. Every incubation ends in one of two ways, and either way its file leaves the directory in the closing change:

- **Graduated** — the requirement becomes a `proposed/` [Agent Note](../../.agents/notes/README.md) or a direct code/docs change. Delete the file; the graduation target is the durable record and links whatever remains worth keeping.
- **Dropped** — the requirement will not be pursued. When the reasoning prevents re-litigation, record it as a `rejected/` Agent Note; otherwise just delete the file.

### `roadmaps/` — thematic direction

A roadmap states intended direction for one theme: priorities, sequencing intent, and known unknowns. Name it `roadmaps/<theme>.md`. A roadmap is a living document, updated in place as direction changes. It states intent, never commitment: an item on a roadmap authorizes nothing by itself. When a roadmap item turns into concrete work, it leaves the roadmap as a `proposed/` Agent Note or a shipped change, and the roadmap links there.

## Boundaries

- Status, direction, and forward-looking content live only in this tier. Other tiers stay current-state mechanism prose; the [slop checklist](../AGENTS.md#the-slop-checklist) rejects status annotations there.
- This tier holds no decision rationale ([Agent Notes](../../.agents/notes/README.md) own the why), no mechanism references ([subsystems/](../subsystems/README.md) own types and semantics), and no incident stories ([postmortem/](../postmortem/README.md) owns those).
- Every claim here about current behavior must verify against source. A survey that has drifted from the code is re-surveyed or deleted, never patched into a claim about the present.

## Index duty

The [README](README.md) indexes every current document, one row per document, grouped by kind; the first document of a kind replaces that section's empty-marker line with the index table. Add, move, or remove the row in the same change as the document. Survey rows carry the survey date, newest first; incubation rows carry the status; roadmap rows name the theme.
