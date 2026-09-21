---
description: "Markdown document rendering for the dsh web client: the shared markdown seat every surface fills and the pluggable fence rules for TeX math and Mermaid diagrams."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-markdown

English | [中文](README.zh.md)

## Summary

Render authored markdown in the Web client and add fence rendering rules without touching the document renderer. Chat, the question composer, the trajectory view, and the document preview each declare a markdown seat plus a fence seat; this package fills both and registers the built-in TeX math and Mermaid rules. A rule claims a fence or math node through a selector; an unclaimed request keeps the renderer's fallback, a highlighted code block for a fence or the authored source for math. Raw HTML and unsafe link and image protocols stay blocked.

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

Mount the plugin as one composition row, and every surface that declares a markdown pair gains a renderer plus the two built-in fence rules. The surface declares the pair; this package fills it.

### The markdown pairs

A rendering surface declares a `single` markdown seat and a `chain` fence seat, both at Session scope. The seat renders the surface's authored markdown; the fence seat dispatches each fenced code block and math node.

| Surface | Markdown seat | Fence seat |
|---|---|---|
| Chat transcript | `conversation.chat.markdown` | `conversation.chat.markdown.fence` |
| Composer question detail | `conversation.composer.markdown` | `conversation.composer.markdown.fence` |
| Trajectory records | `conversation.trajectory.markdown` | `conversation.trajectory.markdown.fence` |
| Right-sidebar document preview | `sidebar.right.tab.document.markdown` | `sidebar.right.tab.document.markdown.fence` |

### Fence requests and fallbacks

The renderer dispatches one `MarkdownFenceRequest` per settled fence and per math node: `{ kind: 'fence'; lang; info; source }` for a fenced code block, where `lang` is the normalized language token and `info` the authored info string, and `{ kind: 'display'; source }` or `{ kind: 'inline'; source }` for a math node. Commands, link destinations, and image destinations never reach the fence seat.

A rule is a `select` function plus a component. The selector returns the matched value or `null`; entry selectors run in chain order, and the first rule that returns a value renders the node. A request no rule claims keeps the renderer's fallback: the highlighted code arm for a fence, the authored source for math.

### Built-in rules

The Mermaid rule claims a fence whose language token is `mermaid` and renders the diagram, keeping the code arm while the message streams, while the diagram is pending, and after a failed render. The math rule claims inline and display math nodes and a `math` fence, and typesets each through KaTeX; a `math` fence renders as display TeX.

### Minimal configuration

The plugin accepts no `Config`. A composition mounts it as one row:

```yaml
- id: ui-markdown
  name: '@deepseek-ai/dsh-client-ui-markdown'
```

The browser half injects the slot registry and the shared locale service, and waits on each surface's declaration, so this plugin and the surfaces load in either order. Registration copy rides the `common` locale namespace — `copy`, `copied`, `markdown.footnotes`, and `markdown.diagram` are cross-feature vocabulary the `locale` plugin already owns.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package contributes two things to the slot registry, and the surface declares both seats. One `MarkdownSeat` component serves all four markdown seats: it binds the `common` chrome copy and forwards the fence renderer the declaring surface passed in its owner props. The surface owns that callback's identity, because the streaming render cache is keyed on it.

The document renderer parses with the `ui-primitives` mdast grammars and walks the tree directly. While a message streams it freezes all but the trailing two blocks as cached React elements and re-parses only the tail; the settled pass asks the fence seat once per fence, while math nodes dispatch on every pass. Untrusted output keeps its policy: link and image destinations pass a protocol allowlist, raw HTML renders as literal text, and KaTeX runs without trusted commands.

### Source map

| File | Role |
|---|---|
| [`src/client/apply.ts`](src/client/apply.ts) | Fills every markdown seat and registers the two built-in rules into every fence seat |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | The four seat pairs, the request union, the owner props, and the seat renderer type |
| [`src/client/markdown/MarkdownSeat.tsx`](src/client/markdown/MarkdownSeat.tsx) | The shared seat: binds `common` chrome and forwards the surface's fence renderer |
| [`src/client/markdown/MarkdownText.tsx`](src/client/markdown/MarkdownText.tsx) | Settled and streaming rendering: incremental parse, frozen-block cache, footnote section |
| [`src/client/markdown/render.tsx`](src/client/markdown/render.tsx) | The mdast→React switch, the untrusted-output policy, fence dispatch, and footnotes |
| [`src/client/markdown/MathFence.tsx`](src/client/markdown/MathFence.tsx) | The math rule: claims three request kinds and typesets through `ui-primitives`' `renderTexToReact` |
| [`src/client/markdown/MermaidFence.tsx`](src/client/markdown/MermaidFence.tsx) | The diagram rule, over `ui-primitives`' `MermaidBlock` |
| [`src/index.ts`](src/index.ts) | Host half; the browser half carries every contribution |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages own the parser, the declaring surfaces, and the slot mechanism.

- [ui-primitives](../ui-primitives/README.md) — the mdast grammars, plain-text projection, and `CodeBlock` the renderer builds on.
- [ui-chat](../ui-chat/README.md) — declares the Chat markdown pair.
- [ui-user-questions](../ui-user-questions/README.md) — declares the composer markdown pair.
- [ui-trajectory](../ui-trajectory/README.md) — declares the trajectory markdown pair.
- [ui-sidebar-documentpreview](../ui-sidebar-documentpreview/README.md) — declares the document-preview markdown pair.
- [slots](../../../docs/subsystems/slots.md) — how a surface declares a seat and an occupant registers into it.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package renders browser UI and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the fence-seat contract and the cost of contributing a rule; they are current package constraints.

- **A rule registers once per fence slot** — one rule that serves all four surfaces needs four registrations, one into each `…markdown.fence` seat. No framework mechanism publishes the slot-name list, so a rule author names the seats explicitly.
- **A rule's third-party renderer is statically linked** — a dynamic plugin bundle publishes one file, so a rule that defers a library with `import()` or imports a bare stylesheet would emit chunk and asset files its publication cannot cover. Mermaid and KaTeX therefore live in `ui-primitives`, and each rule here composes that block; see [why the lazy renderers are static](../ui-primitives/README.md#why-the-lazy-renderers-are-static).
- **Fence dispatch runs on settled content only** — while a message streams, every fence keeps the code arm; only the settled pass asks the fence seat, so a rule cannot take over a growing fence.
- **Streaming defers cross-boundary reference resolution** — a reference-style link or footnote whose definition sits on the other side of the incremental freeze boundary renders as literal text while the reply streams; the settled full parse at finalize resolves it.
- **Categorical diagram palettes stay Mermaid's** — pie, mindmap, timeline, gitgraph, sankey, radar, treemap, and xychart colors encode categories rather than surface, so they keep the library palette and are baked at render: they follow neither `--dsw-*` tokens nor a live theme switch.
- **`htmlLabels: false` costs label wrapping** — a diagram label longer than its node overflows instead of wrapping. The setting is what keeps a diagram's output a pure SVG vocabulary with no HTML island.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Every contribution is a slot registration owned and observed by the slot registry, and the renderer's declared fallbacks are asserted directly by this package's specs.
