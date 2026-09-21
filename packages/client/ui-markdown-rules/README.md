---
description: "Built-in markdown fence rules for the dsh web client: TeX math and Mermaid diagrams contributed into the four markdown fence seats."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-markdown-rules

English | [中文](README.zh.md)

## Summary

Render a fence beyond its code arm by mounting the plugin that carries the built-in rules. Four chain seats — Chat, the composer, the trajectory view, and the document preview — accept one entry per rule; the Mermaid rule claims a settled `mermaid` fence and the math rule typesets inline, display, and `math` fence TeX through KaTeX. A rule is a `select` function plus a component, and the first non-null match in the chain renders. A request no rule claims keeps the renderer's fallback, so omitting this row keeps every fence on the code arm.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin as one composition row, and every surface whose fence seat is declared gains the two built-in rules. The [renderer package](../ui-markdown/README.md) owns the seats, the request type, and the fallback; this package owns the rules.

### What a rule is

A rule is a `select` function plus a component. `select(request)` returns the rule's matched value or `null`; a fence seat is a chain, so its entries run in registration order and the first non-null match renders the node. A request no rule claims keeps the renderer's own fallback: the highlighted code arm for a fence, the authored source for math.

### The two built-in rules

| Rule | Requests it claims | Renders |
|---|---|---|
| Mermaid diagrams | A settled fence whose normalized language token is `mermaid` | `ui-primitives`' `MermaidBlock`, which keeps the code arm while the message streams and while the diagram is pending or failed |
| TeX math | An `inline` math node, a `display` math node, and a settled `math` fence | `ui-primitives`' `renderTexToReact`; a `math` fence typesets as display TeX with the trailing newline its body needs |

Both rules decline a fence that is still streaming, because an incomplete fence cannot render. The Mermaid rule therefore replaces the code arm only once the reply settles.

### How a rule is registered

A registration is one entry in one fence seat, so a rule that serves all four surfaces registers four times, one entry per `…markdown.fence` seat. `ctx.slots.inject` waits for the surface's declaration before registering, so this plugin and the surfaces load in either order and a surface that loses its declaration takes only its own entries.

Registration copy rides the `common` locale namespace: `copy`, `copied`, and `markdown.diagram` name fence chrome the `locale` plugin already carries.

### Minimal configuration

The plugin accepts no `Config`. A composition mounts it as one row beside the renderer:

```yaml
- id: ui-markdown
  name: '@deepseek-ai/dsh-client-ui-markdown'
- id: ui-markdown-rules
  name: '@deepseek-ai/dsh-client-ui-markdown-rules'
```

The two packages are separate rows, so a deployment that omits the rules row still renders markdown and keeps every fence on the code arm.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Two selectors and two components carry the package. Each selector is a pure function over `MarkdownFenceRequest`; each component renders the matched value through a statically linked `ui-primitives` block and binds its chrome from the shared namespace. A rule owns no stylesheet and no third-party dependency of its own.

### Source map

| File | Role |
|---|---|
| [`src/client/apply.ts`](src/client/apply.ts) | Registers four entries per rule — one per fence seat — through `ctx.slots.inject` |
| [`src/client/rules/MathFence.tsx`](src/client/rules/MathFence.tsx) | The math rule: `selectMath`, `MathFence`, and the exported `MathMatch` |
| [`src/client/rules/MermaidFence.tsx`](src/client/rules/MermaidFence.tsx) | The diagram rule: `selectMermaid` and `MermaidFence` |
| [`src/index.ts`](src/index.ts) | Host half; the browser half carries every contribution |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages own the seats the rules register into, the blocks they compose, and the decision behind the split.

- [ui-markdown](../ui-markdown/README.md) — owns the four seat pairs, the fence request, the document renderer, and the fallback a declined request keeps.
- [ui-primitives](../ui-primitives/README.md) — hosts `MermaidBlock` and `renderTexToReact`, and states [why the lazy renderers are static](../ui-primitives/README.md#why-the-lazy-renderers-are-static).
- [slots](../../../docs/subsystems/slots.md) — how a surface declares a chain seat and an occupant registers into it.
- [pluggable markdown fences](../../../.agents/notes/implemented/architecture/2026-09-21-pluggable-markdown-fences.md) — the decision behind the seat pair and rule claiming.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package renders browser UI and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what a rule can claim and the cost of contributing one; they are current package constraints.

- **A rule registers once per fence seat** — one rule that serves all four surfaces needs four registrations, one into each `…markdown.fence` seat. No framework mechanism enumerates the declared seats, so a rule author writes the seat names out.
- **A rule's third-party renderer is statically linked** — a dynamic plugin bundle publishes exactly the files its manifest lists, so a dynamic `import()` or a bare stylesheet inside it would emit chunk and asset files its publication closure cannot cover. Mermaid and KaTeX therefore live in `ui-primitives`, and each built-in rule composes that block; see [why the lazy renderers are static](../ui-primitives/README.md#why-the-lazy-renderers-are-static).
- **Fence dispatch runs on settled content only** — while a message streams, every fence keeps the code arm; only the settled pass asks the fence seat, so a rule cannot take over a growing fence.
- **Third-party renderers keep their own safety defaults** — KaTeX runs without `trust`, so `\href` and `\includegraphics` in authored TeX stay literal text, and Mermaid runs at `securityLevel: 'strict'` with `htmlLabels: false`, so a diagram's output is an SVG element vocabulary with no HTML island.
- **Categorical diagram palettes stay Mermaid's** — pie, mindmap, timeline, gitgraph, sankey, radar, treemap, and xychart colors encode categories rather than surface, so they keep the library palette and are baked at render: they follow neither `--dsw-*` tokens nor a live theme switch.
- **`htmlLabels: false` costs label wrapping** — a diagram label longer than its node overflows instead of wrapping. The setting is what keeps a diagram's output a pure SVG vocabulary with no HTML island.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Every contribution is a slot registration owned and observed by the slot registry, and the selectors' claims and the renderer's fallbacks are asserted directly by this package's specs.
