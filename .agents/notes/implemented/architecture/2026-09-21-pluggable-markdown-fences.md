# Agent Note: Pluggable markdown fences

Status: implemented

English | [中文](2026-09-21-pluggable-markdown-fences.zh.md)

> The [client shell and dynamic package boundaries](2026-08-15-client-shells-and-dynamic-packages.md) note owns package placement and the dynamic-versus-static decision. This note applies that model to markdown rendering and owns the seat pair, the fence request, and rule claiming.

## Problem

A rendering rule compiled into a statically linked library cannot be contributed by installation. The document renderer owns the fence dispatch as code: it recognizes a `mermaid` fence and every TeX math node through arms in the same module, so a rendering rule for a new fence language is a source edit to a package the Web shell links statically, and no plugin installed into a running profile can add one.

The same renderer serves four different surfaces - the Chat transcript, the composer's question detail, the trajectory view, and the right-sidebar document preview - through one shared component. Their markdown differences can only be expressed as library props, and each surface's copy needs its own label builder.

## Decision

### Markdown composition moves to a dynamic plugin

`@deepseek-ai/dsh-client-ui-markdown` is a dynamic client plugin. Its host half is empty; its browser half registers into the slot registry. The Web bundle mounts it as one ordinary row, so a deployment chooses whether markdown rendering is present at all, and a rendering rule ships as a plugin rather than as a change to the shell.

`ui-primitives` stays a static library and keeps everything that is not composition: the two mdast grammars (`parseGfm`, `parseGfmWithMath`), the plain-text projection (`extractMarkdownPlainText`), Shiki highlighting, `CodeBlock`, `JsonBlock`, and the two blocks that draw a third-party library's output (`MermaidBlock`, `renderTexToReact`). It no longer exports `MarkdownText` or the markdown label types.

### Every rendering surface declares a markdown seat and a fence seat

Four pairs, each at Session scope, and the surface that renders markdown declares both slots in its own entry:

| Surface | Markdown seat | Fence seat |
| --- | --- | --- |
| Chat transcript | `conversation.chat.markdown` | `conversation.chat.markdown.fence` |
| Composer question detail | `conversation.composer.markdown` | `conversation.composer.markdown.fence` |
| Trajectory records | `conversation.trajectory.markdown` | `conversation.trajectory.markdown.fence` |
| Right-sidebar document preview | `sidebar.right.tab.document.markdown` | `sidebar.right.tab.document.markdown.fence` |

The markdown seat is `kind: 'single'`; its fence sibling is `kind: 'chain'`. One slot name still has one declarer, so each surface declares its own hole and the plugin waits on that declaration with `ctx.slots.inject` before registering into it. The pair loads in either order and each surface disappears independently.

`MarkdownSeatOwnerProps` carries `text`, `streaming`, `mentions`, `pathImages`, and `renderFence`. The declaring surface owns the `renderFence` closure, which is its authorization to render that location; the closure must stay reference-stable, because the streaming render cache is keyed on its identity.

### A rule claims a request with a pure selector

The renderer dispatches one `MarkdownFenceRequest` per settled fence and per math node:

```ts
type MarkdownFenceRequest =
  | { kind: 'fence'; lang: string | undefined; info: string; source: string }
  | { kind: 'display'; source: string }
  | { kind: 'inline'; source: string }
```

A rule registers a `select` function together with its component. `select(request)` returns the rule's matched value or `null`; chain entries run in registration order and the first non-null match renders. Commands, link destinations, and image destinations never reach the seat, so a rule cannot claim them.

Two rules ship with the plugin. The Mermaid rule claims a fence whose normalized language token is `mermaid` and draws `ui-primitives`' `MermaidBlock`. The math rule claims an `inline` or `display` math node and a settled `math` fence, and typesets each through `ui-primitives`' `renderTexToReact`.

### A declined request keeps the renderer's fallback

`renderFence` returning `null` means no rule claimed the node, and the document renderer draws its own fallback: the highlighted code arm for a fence and the authored source for math. A fence language no rule claims renders exactly as a language with no special renderer does, so adding a rule never removes behavior a document already had. Math nodes dispatch on every pass; fences dispatch only on the settled pass, because an incomplete fence cannot render and re-dispatching per chunk would repeat the parse for every intermediate state.

### Copy rides the shared `common` namespace

The seat and both rules register with `locale: 'common'`. The chrome they own - `copy`, `copied`, `markdown.footnotes`, and `markdown.diagram` - is cross-feature vocabulary the `locale` plugin already carries, not markdown-specific wording. The per-feature markdown label builders are gone.

### `WebBlock` takes a renderer instead of importing one

`WebBlock` no longer renders markdown. `WebSearchBlockProps` gained `renderAnswer?: (answer: string) => ReactNode` and `WebBlockLabels` lost its `markdown` field; without `renderAnswer` the answer renders as plain text. The owning render site decides whether an answer is markdown and which renderer draws it.

## Alternatives considered

**Keep the fence dispatch in the statically linked renderer and publish a rule registry.** A registry value export would let a rule run without a package edit, but the registry itself, its ordering, and its fallback would remain compiled into `ui-primitives`, and each consuming plugin would still need a runtime value import from a static library. The slot registry already provides registration, ordering, disposal, and HMR behavior, so a second registry duplicates it.

**Publish one shared markdown seat and let every surface register into it.** The slot model gives one slot name exactly one declarer; a shared seat would need one package to declare a hole for surfaces it does not own, and each surface's owner props and fence renderer would have no declared place to arrive. Per-surface pairs keep the declaration with the code that renders the location.

**Have each surface register the built-in rules itself.** That would remove the concentrated registration cost, but a rule registers slots, which only the plugin does, and no feature plugin may runtime-import another feature plugin's values. It would also duplicate the math and Mermaid rules once per surface and let the surfaces' rendering drift.

**Keep `WebBlock` importing `MarkdownText`.** `ui-primitives` would then depend on the renderer package or keep a second markdown renderer, and a caller could not render an answer as plain text or through a different renderer.

## Consequences

Markdown rendering becomes a composition choice: the seat and the rules arrive from one plugin row, and a deployment that omits the row mounts the surfaces without it. A rule author pays a fixed registration cost - one entry per fence slot, four for a rule that serves all four surfaces. No framework mechanism enumerates the declared fence seats for a plugin, so the author writes the slot names out; publishing that list is deferred until a second rule package needs it.

The two third-party blocks stay in `ui-primitives` because a dynamic plugin bundle cannot defer them. It publishes one `lib/client.js`, so a dynamic `import()` or a bare third-party stylesheet inside it makes its own bundler emit chunk and asset files that the publication closure cannot cover - Mermaid's dynamic load alone produces about a hundred - and nothing in the client build prunes them. Keeping the blocks static leaves Mermaid's `import()` and KaTeX's stylesheet with the Web shell's own bundler, which splits Mermaid into a lazily fetched chunk. A rule that needs its own such library must place the library in a static owner first.

The seat's authorization is an owner-props closure rather than a framework-published registration channel. A surface must thread `renderFence` into the seat, and the closure's identity is load-bearing for streaming.

`ui-primitives` keeps what has no composition: the grammars, the plain-text projection, highlighting, the code and JSON blocks, and the two lazily loaded third-party blocks. Surfaces that need markdown now depend on the plugin row, and their markdown chrome comes from the shared namespace instead of their own dictionaries.

## Verification

Unit specs in `packages/client/ui-markdown/tests` cover the renderer, the built-in rules, the incremental parser, path-image rewriting, and hand-built mdast trees; the two static blocks keep their own specs in `packages/client/ui-primitives/tests`. `plugin.client.spec.tsx` boots the plugin's real `apply` on a `SlotTestRuntime`, asserts that the seat and both rules occupy all four declared pairs, renders a document whose diagram and math fences reach the rules through the chain seat, and disposes the fiber to observe every contribution leave. `markdown-dom-parity.client.spec.tsx` pins the rendered DOM byte-for-byte against `tests/fixtures/markdown-dom`, so the markup cannot drift.

A product-visible client plugin requires a non-unit real-composition test ([package rules](../../../../packages/AGENTS.md)). The document-preview markdown-registration spec boots the plugin's real `apply` against the surface's real `apply` through `SlotTestRuntime`, asserts that the seat renders through the declared pair, and disposes the surface to observe the seat leaving with the declaration. At graph level, the assembled-boot smoke in `apps/web/tests/built-boot.expected.e2e.ts` mounts the shipped bundle roster, which includes the `ui-markdown` row.

A rule is optional, and omitting the plugin proves it: the assembled-boot harness's `mountAssembledApp` takes an `exclude` list of package ids, so mounting the same composition without `@deepseek-ai/dsh-client-ui-markdown` leaves every surface's markdown seat unfilled and no rule registered. At the renderer level, a fence the selectors decline (a `ts` fence) keeps the code arm, and a math node no rule claims keeps its authored source.
