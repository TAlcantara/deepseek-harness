# AGENTS.md — Roadmap, incubation, and surveys

This directory is the documentation tier for status and direction: anchored surveys, incubating requirements, and roadmap boards. Follow [docs/AGENTS.md](../AGENTS.md); this file adds the local rules. The [README](README.md) indexes current documents.

## The three kinds

Each kind owns one subdirectory, created with its first document. Every document is a bilingual pair under the [i18n contract](../i18n/README.md); this AGENTS.md itself stays English-only.

### `surveys/` — anchored current-state snapshots

A survey is a point-in-time analysis of where the project, a subsystem, or a cross-cutting concern stands: gaps, risks, and observations that span packages and that no single reference document owns. Name it `surveys/YYYY-MM-DD-<topic>.md`, and anchor it under the language switcher with `Surveyed at: <short-sha>` for the analyzed commit and `Scope: <paths>` for its paths. The anchor makes freshness mechanical: `git diff <sha>..HEAD -- <scope>` proves whether the analysis still applies. The anchor pins the code baseline, not the prose: correct a wrong claim in place, never update a claim to match newer code — that mixes baselines. When the code in scope moves, re-survey as a new dated file, add a one-line `Superseded by: […](…)` pointer under the older file's switcher (both languages, re-recorded), and move the README index row to the newest survey.

### `incubation/` — requirement drafts

An incubation document develops a requirement that is not yet a decision: problem space, user scenarios, candidate directions, open questions. Name it `incubation/<topic>.md` and open the body with `Status: incubating` on its own line. Keep it current while active. Every incubation ends in one of two ways:

- **Graduated** — the requirement becomes a `proposed/` [Agent Note](../../.agents/notes/README.md) or a direct code/docs change. Delete the file; the graduation target is the durable record and links whatever remains worth keeping.
- **Dropped** — the requirement will not be pursued. Set `Status: dropped` at the top with a one-line reason and the date, freeze the body, and keep the file when its analysis or scenarios would save a future restart; delete it only when nothing is worth keeping. A dropped draft is never cited as a decision — a `rejected/` Agent Note owns any "why not".

### `roadmaps/` — thematic status boards

A roadmap is a thin status board for one theme with three sections: `Now` (active), `Next` (agreed direction, not started), and `Later` (acknowledged interest, no commitment). Each row is one outcome line plus a link to its draft, note, or shipped change. Name it `roadmaps/<theme>.md`; create a board only when a theme has two or three items moving. A board states intent, never commitment: a row authorizes nothing and never restates its link target's content. Rows update in the same change as their item; a row whose link target is gone is removed, not patched.

## Boundaries

- Status, direction, and forward-looking content live only in this tier; the [slop checklist](../AGENTS.md#the-slop-checklist) rejects status annotations in the mechanism tiers.
- This tier holds no decision rationale ([Agent Notes](../../.agents/notes/README.md) own the why), no mechanism references ([subsystems/](../subsystems/README.md) own types and semantics), no incident stories ([postmortem/](../postmortem/README.md) owns those).
- Every claim here about current behavior must verify against source at the recorded anchor; a survey that has drifted is re-surveyed or deleted, never patched into a claim about the present.

## Index duty

The [README](README.md) indexes every current document, one row per document, grouped by kind; the first document of a kind replaces that section's empty-marker line with the index table. Update rows in the same change as the document. Survey rows carry the date, newest first; incubation rows carry the status, dropped drafts listed apart; roadmap rows name the theme.
