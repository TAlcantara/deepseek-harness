/**
 * TeX-to-React via KaTeX, replicating the rehype-katex pipeline this renderer
 * replaced: the same three-arm error chain (strict render, `strict: 'ignore'`
 * retry, error span) and a DOM-identical element tree, so settled math keeps
 * its exact markup. KaTeX emits an HTML string; `dom-to-react.ts` turns it into
 * React elements through the browser's own HTML parser.
 *
 * React 18 has no MathML support, so the `.katex-mathml` subtree's elements
 * land in the HTML namespace — exactly as they did under the replaced
 * hast-util-to-jsx-runtime pipeline. The visual arm is the `.katex-html`
 * span tree; the MathML arm serves assistive technology, which reads it by
 * tag name regardless of namespace.
 */

import type { ReactNode } from 'react'
import katex from 'katex'
import { domChildrenToReact } from '../dom-to-react.tsx'
// KaTeX's markup is unstyled without its own sheet, and this module is the only
// renderer that emits that markup, so the sheet loads with it.
import 'katex/dist/katex.min.css'

/**
 * Render TeX source to React elements through KaTeX.
 * @param value - The TeX source (math node value; fenced `math` blocks append
 * their trailing newline to match the replaced pipeline's text extraction).
 * @param displayMode - Display (block) versus inline rendering.
 * @returns KaTeX's element tree, or the error span when the source does not
 * parse (colored with KaTeX's stock `errorColor`, matching rehype-katex).
 */
export function renderTexToReact(value: string, displayMode: boolean): ReactNode {
  let html: string
  try {
    html = katex.renderToString(value, { displayMode, throwOnError: true })
  } catch (error) {
    try {
      html = katex.renderToString(value, { displayMode, strict: 'ignore', throwOnError: false })
    } catch {
      // KaTeX renders ParseErrors itself under throwOnError: false; only its
      // internal errors reach here, so mirror rehype-katex's manual span.
      /* v8 ignore next 8 */
      return (
        <span
          className="katex-error"
          style={{ color: '#cc0000' }}
          title={String(error)}
        >
          {value}
        </span>
      )
    }
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return domChildrenToReact(parsed.body)
}
