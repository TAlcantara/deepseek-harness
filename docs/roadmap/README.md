# Roadmap, incubation, and surveys

English | [中文](README.zh.md)

This directory is the repository's one home for status and direction documents: where the project stands, what is under consideration, and where it is heading. Current-state mechanism references follow the [documentation standard](../AGENTS.md) and decision records live in [Agent Notes](../../.agents/notes/README.md); this tier exists so status and forward-looking material never has to masquerade as either. Authoring rules live in [AGENTS.md](AGENTS.md).

## Surveys

`surveys/` holds point-in-time analyses of project or subsystem state: gaps, risks, and cross-cutting observations. A survey is named `YYYY-MM-DD-<topic>.md` and anchors the analyzed commit in its header, so a `git diff` against that anchor proves whether it still applies. Wrong claims may be corrected in place; changed code requires a new dated survey that supersedes the old one.

No surveys yet.

## Incubation

`incubation/` holds requirement drafts still being developed. A draft either graduates into a proposed Agent Note or a shipped change, or it is dropped — dropped drafts stay frozen with their status marked at the top when their analysis remains useful.

No requirements incubating.

## Roadmaps

`roadmaps/` holds thin Now/Next/Later status boards per theme: one row per item with a status and a link to its draft, note, or shipped change — intent, never commitments.

No roadmaps yet.
