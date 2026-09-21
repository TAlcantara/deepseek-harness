/**
 * Client-side Mermaid fence rendering. A settled ```mermaid fence becomes a
 * diagram; everything else about the fence keeps the code-block arm.
 *
 * Trust: Mermaid turns model-authored text into an SVG. `securityLevel:
 * 'strict'` keeps its own sanitizer in front of the output, `htmlLabels: false`
 * removes `<foreignObject>` so the result is a pure SVG element vocabulary with
 * no HTML, and `dom-to-react.ts` maps that vocabulary onto React elements
 * instead of injecting markup. The fence cannot lower the security level: the
 * `init` directive and YAML frontmatter may only override keys outside
 * Mermaid's `secure` list, which includes `securityLevel`.
 *
 * Theme: Mermaid bakes concrete colors into the SVG, so a diagram cannot pick
 * up `--dsw-*` tokens through `themeVariables` — Mermaid runs those through a
 * color library that rejects CSS functions. It does pass `themeCSS` through
 * verbatim into the SVG's own stylesheet, and that sheet resolves custom
 * properties in the live document. Diagram colors therefore follow the theme by
 * CSS alone: switching light/dark repaints without re-rendering, and a cached
 * render is theme-independent.
 *
 * Chart families whose colors encode categories (pie, mindmap, timeline,
 * gitgraph, sankey, radar, treemap, xychart) keep Mermaid's own palette; a
 * token would collapse distinctions those diagrams exist to show.
 *
 * @module @deepseek-ai/dsh-client-ui-primitives/mermaid
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { writeClipboard } from '../clipboard.ts'
import { domToReact } from '../dom-to-react.tsx'
import { useViewportActivation } from '../useViewportActivation.ts'
import { CodeBlock } from './CodeBlock.tsx'
import type { MarkdownLabels } from './render.tsx'
import codeCss from './CodeBlock.module.css'
import css from './DiagramBlock.module.css'

/**
 * The id every render is generated under. Instances rewrite it (see
 * {@link MermaidBlock}) so one cached SVG can back several mounts without
 * sharing a DOM id — Mermaid scopes its own stylesheet by that id, and a
 * duplicate would leave every mount after the first unstyled.
 */
const RENDER_ID = 'dsh-mermaid'

/** Rendered diagrams retained by source. Bounded so an idle session cannot grow without limit. */
export const CACHE_LIMIT = 50

/**
 * Paint overrides for the structural diagram vocabulary. `!important` is
 * required: Mermaid scopes its own rules by the render id, which outranks these
 * plain class selectors on specificity alone.
 *
 * Card families (pie, gitgraph, mindmap, timeline) are deliberately absent.
 */
const DIAGRAM_THEME_CSS = `
[data-look="neo"].node rect, [data-look="neo"].node circle, [data-look="neo"].node polygon,
[data-look="neo"].node ellipse, [data-look="neo"].node path,
.node rect, .node circle, .node ellipse, .node polygon, .node path,
.cluster rect, .statediagram-cluster rect, g.classGroup rect, g.stateGroup rect,
rect.note, polygon.labelBox, .actor-man circle, rect.actor, .labelBox {
  fill: var(--dsw-alias-bg-layer-1) !important;
  stroke: var(--dsw-alias-border-l1) !important;
}
text, tspan, span, .label, .nodeLabel, .classTitleText, .messageText,
.cluster span, .cluster-label text, .state-title, text.actor > tspan {
  fill: var(--dsw-alias-label-primary) !important;
  color: var(--dsw-alias-label-primary) !important;
}
/* Mermaid carries its actor border colour on the actor class whether the
   element is the participant box or the label, which leaves the label with a
   stray outline over its glyphs. Diagram text never wants one. */
text, tspan {
  stroke: none !important;
}
.edgePath .path, .flowchart-link, .relation, .transition, .messageLine0, .messageLine1,
.loopLine, .actor-line, [data-look="neo"].node .neo-line path, line, g.classGroup line,
g.stateGroup line, .divider, g.divider,
[id$="-arrowhead"] path, [id$="-barbEnd"], [id$="-dependencyEnd"], [id$="-dependencyStart"] {
  stroke: var(--dsw-alias-border-l2) !important;
}
.arrowheadPath, .marker, [id$="-aggregationEnd"], [id$="-aggregationStart"],
[id$="-compositionEnd"], [id$="-compositionStart"], [id$="-extensionEnd"],
[id$="-extensionStart"], [id$="-lollipopEnd"], [id$="-lollipopStart"],
[id$="-sequencenumber"] {
  fill: var(--dsw-alias-border-l2) !important;
  stroke: var(--dsw-alias-border-l2) !important;
}
.edgeLabel rect, .labelBkg, .edgeLabel .label rect {
  fill: var(--dsw-alias-bg-layer-2) !important;
}
svg.erDiagram circle {
  fill: var(--dsw-alias-bg-layer-1) !important;
  stroke: var(--dsw-alias-border-l1) !important;
}
.error-icon, .error-text {
  fill: var(--dsw-alias-state-error-primary) !important;
  stroke: var(--dsw-alias-state-error-primary) !important;
}
`.trim()

/** Mermaid configuration: fixed for every diagram this package renders. */
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  theme: 'base',
  htmlLabels: false,
  fontFamily: 'var(--dsw-font-family)',
  themeVariables: { background: 'transparent' },
} as const

type MermaidApi = typeof import('mermaid')['default']

/** One module-level load: the dynamic import splits Mermaid into its own chunk and runs once. */
let loader: Promise<MermaidApi> | undefined

function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then((module) => {
    const mermaid = module.default
    mermaid.initialize({ ...MERMAID_CONFIG, themeCSS: DIAGRAM_THEME_CSS })
    return mermaid
  })
  return loader
}

/** Rendered SVGs by fence source; insertion order doubles as recency for eviction. */
const cache = new Map<string, string>()

function readCache(source: string): string | undefined {
  const hit = cache.get(source)
  // Re-insert so the oldest entry is always first.
  if (hit !== undefined) {
    cache.delete(source)
    cache.set(source, hit)
  }
  return hit
}

function writeCache(source: string, svg: string): void {
  cache.set(source, svg)
  if (cache.size <= CACHE_LIMIT) return
  const oldest = cache.keys().next()
  /* v8 ignore next -- the size check above proves the map holds a first key. */
  if (oldest.done) return
  cache.delete(oldest.value)
}

/** Render one fence, reusing a cached SVG when the same source was rendered before. */
async function renderDiagram(source: string): Promise<string> {
  const hit = readCache(source)
  if (hit !== undefined) return hit
  const mermaid = await loadMermaid()
  const { svg } = await mermaid.render(RENDER_ID, source)
  writeCache(source, svg)
  return svg
}

/**
 * Parse a Mermaid SVG document into React elements.
 * @param svg - The rendered SVG markup.
 * @returns The mapped SVG root, or undefined when the markup produced no root element.
 */
function svgToReact(svg: string): ReactNode | undefined {
  const parsed = new DOMParser().parseFromString(svg, 'text/html')
  const root = parsed.body.firstElementChild
  if (root === null) return undefined
  return domToReact(root, 0)
}

/**
 * One Markdown fence rendered as a diagram, falling back to the source code
 * block while the diagram is pending, when it fails, and before it scrolls into
 * view — the placeholder reserves the geometry so activation replaces content
 * in place.
 * @param props - Fence source and the localized markdown chrome.
 * @returns The diagram, or the code-block arm.
 */
export function MermaidBlock({ source, labels }: {
  source: string
  labels: MarkdownLabels
}): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | undefined>(() => readCache(source))
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const active = useViewportActivation(rootRef, svg === undefined && !failed)

  useEffect(() => {
    if (!active || failed) return
    let cancelled = false
    renderDiagram(source).then(
      (rendered) => { if (!cancelled) setSvg(rendered) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [active, failed, source])

  // Mermaid scopes its stylesheet by the render id, so each mount needs its own.
  const instanceId = `${RENDER_ID}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const diagram = useMemo(
    () => (svg === undefined ? undefined : svgToReact(svg.replaceAll(RENDER_ID, instanceId))),
    [svg, instanceId],
  )

  const onCopy = useMemo(() => () => {
    void writeClipboard(source).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [source])

  if (svg === undefined || diagram === undefined) {
    return (
      <div
        ref={rootRef}
        className={css.pending}
        data-diagram-block
        // Stable semantic hook for owner styling and DOM tests: the pending and
        // failed arms share one appearance on purpose, so the state is the only
        // observable difference between them.
        data-diagram-state={failed ? 'failed' : 'pending'}
      >
        <CodeBlock
          code={`${source}\n`}
          lang="mermaid"
          copyLabel={labels.code.copyLabel}
          copiedLabel={labels.code.copiedLabel}
        />
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`${codeCss.block} ${css.block}`} data-diagram-block data-diagram-state="ready">
      <div className={codeCss.bannerWrap}>
        <div className={codeCss.banner} data-code-block-banner>
          <div className={codeCss.infostring}>mermaid</div>
          <div className={codeCss.action}>
            <button type="button" className={codeCss.copyButton} onClick={onCopy}>
              {copied ? labels.code.copiedLabel : labels.code.copyLabel}
            </button>
          </div>
        </div>
      </div>
      <div className={css.canvas} role="img" aria-label={labels.diagram}>
        {diagram}
      </div>
    </div>
  )
}
