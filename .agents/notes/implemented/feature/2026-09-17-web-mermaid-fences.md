# Agent Note: Web Mermaid fence rendering

Status: implemented

English | [中文](2026-09-17-web-mermaid-fences.zh.md)

## Problem

Assistant replies use ` ```mermaid ` fences for flowcharts, sequence diagrams, and state machines, and the Web renderer drew every one of them as plain monospace text. Mermaid is the diagram language with the deepest model training data, so the transcripts carrying the most diagrams were the ones the GUI could not draw.

The alternatives each failed a different constraint. Rendering Mermaid in the browser means shipping a large library into a shell whose JavaScript payload is about 1.27 MB. Converting outside the browser needs a host process, which the Web-only change did not justify. Teaching the model a coordinate-bearing format such as JSON Canvas or draw.io XML moves layout to the model, which estimates text width and collision poorly.

## Decision

`MarkdownText` renders a settled ` ```mermaid ` fence through a `MermaidBlock` that lives in `@deepseek-ai/dsh-client-ui-primitives`. Everything runs in the browser; no host service participates.

**Loading.** `mermaid` is a `devDependencies` entry of `ui-primitives` (a browser-only third-party input), reached through `await import('mermaid')` from the module-level loader singleton. The static browser library keeps the bare specifier and the final Vite build splits it into its own async chunk. `VENDOR_PACKAGES` in `apps/web/vite.config.ts` is an explicit allowlist whose comment already reserves it for eager code, so `mermaid` must never join it.

**Timing.** The fence keeps the code arm while the reply streams and while it sits outside the viewport. `src/useViewportActivation.ts` holds the document-wide `IntersectionObserver` that both this fence and the Shiki highlighter use; `src/markdown/useViewportHighlighting.ts` is now a thin wrapper over it. The code block doubles as the pending, failed, and offscreen appearance, so a fence has one visual transition instead of three.

**Trust.** Mermaid turns model-authored text into an SVG. `securityLevel: 'strict'` keeps its sanitizer in front of the output, and `htmlLabels: false` removes `<foreignObject>`, which reduces the result to a pure SVG element vocabulary with no HTML. `src/dom-to-react.tsx` maps that vocabulary onto React elements through the browser's HTML parser; this module is the `domToReact`/`styleObject` pair lifted out of `katex.tsx`, which applies the same technique to KaTeX output. A fence cannot lower its own security level: the `%%{init: …}%%` directive and YAML frontmatter may only override keys outside Mermaid's `secure` list, which contains `securityLevel`, and `tests/mermaid.client.spec.tsx` pins that.

**Theme.** Mermaid bakes concrete colors into its SVG and refuses CSS functions in `themeVariables` — it runs each value through a color library that rejects `var(--dsw-…)` during `initialize()`. It does pass `themeCSS` through verbatim into the SVG's own stylesheet, and that sheet resolves custom properties in the live document. Diagram paints therefore name `--dsw-*` tokens with `!important` (Mermaid scopes its own rules by the render id, which outranks plain class selectors), and a light/dark switch repaints every diagram without a re-render. Chart families whose colors encode categories rather than surface — pie, mindmap, timeline, gitgraph, sankey, radar, treemap, xychart — keep the library palette.

**Identity and caching.** Rendered SVGs are cached by fence source in a bounded module-level map, with no theme dimension because the theme is pure CSS. Mermaid scopes its stylesheet by the render id, so each mount rewrites that id to a per-instance value before insertion; without the rewrite the second mount of one cached SVG would share a DOM id and lose its styling.

**Labels.** `MarkdownLabels` gained a required `diagram` field for the rendered graphic's accessible name, because Mermaid emits `role` and `aria-roledescription` but no `<title>` or `<desc>`. Every producer was updated: `ui-chat`, `ui-tool`, `ui-trajectory`, `ui-user-questions` (twice), `ui-sidebar-documentpreview`, and the package's own test fixtures.

## Alternatives considered

**Render Mermaid on the host and return SVG.** This removes the bundle cost and gives CJK font availability for free, but it adds a process, a cache, a remote round trip, and a conversion service running on model-generated text. It also cannot serve the document-preview and trajectory consumers without the same plumbing. Deferred rather than rejected: `plantuml` and `dot` have no browser path of comparable reliability, so the next diagram language is more likely to need a host provider than a second client bundle.

**Use `themeVariables` with `var(--dsw-*)` values.** This would have needed no `themeCSS` and no `!important`. Mermaid rejects it during `initialize()`: `Theme.updateColors` derives related colors through `khroma`, which throws `Unsupported color format` on a CSS function.

**Drive the theme from a `diagramTheme` prop.** Reading the active scheme in JavaScript and re-rendering on change would work, but it forces a new prop through `MarkdownText` into every consumer and re-runs Mermaid layout on every theme switch. `themeCSS` reaches the same result through CSS alone.

**Keep `htmlLabels: true` and map the embedded HTML.** `<foreignObject>` would restore label wrapping, at the cost of mapping an HTML subtree inside SVG and widening the trust surface to markup rather than a closed element vocabulary.

**Teach the model JSON Canvas or draw.io XML.** Both require explicit geometry that a text model produces badly, and JSON Canvas expresses grouping as a rectangle drawn around other rectangles, which the model would have to compute as a bounding box.

## Consequences

A reply's ` ```mermaid ` fence becomes a diagram in the Web GUI, in both light and dark themes, and the main shell chunks do not grow. The diagram arrives after the reply settles and after it scrolls into view; until then the reader sees the source, which is the same text the model wrote.

Two limits ship with it. A label longer than its node overflows instead of wrapping, because `htmlLabels: false` is what keeps the output free of HTML. Categorical chart palettes stay Mermaid's and are fixed at render time, so they follow neither `--dsw-*` tokens nor a theme switch.

## Testing

`tests/mermaid.client.spec.tsx` replaces the lazy `import('mermaid')` with a stub, because jsdom cannot lay out SVG text, and covers the streaming gate, the viewport gate, the config, failure fallback, cache reuse and eviction, per-instance id rewriting, unmount races, and copy behavior. That stub is why the browser suite carries the burden of proving Mermaid actually draws; a fixture with `mermaid` fences belongs there. `tests/markdown-dom-parity.client.spec.tsx` does not gain a `mermaid` case: a real load is nondeterministic, and the existing corpus contains no such fence, so no fixture drifts.
