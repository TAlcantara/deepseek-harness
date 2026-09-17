/**
 * Shared DOM→React mapping for third-party renderers whose output is a static
 * element vocabulary the library generates from a parsed input — KaTeX's
 * span/MathML/SVG tree and Mermaid's diagram SVG. Neither library emits raw
 * author HTML: every element comes from the library's own serializer, the same
 * trust the shiki tree gets in CodeBlock.
 *
 * The renderers emit HTML strings, so the browser's own HTML parser
 * (`DOMParser`, applying the spec's SVG/MathML foreign-content attribute
 * adjustments both rely on) turns one into a tree this module maps onto React
 * elements. Mapping rather than injecting keeps the page's stylesheets,
 * fonts, and accessibility tree authoritative over the result.
 *
 * @module @deepseek-ai/dsh-client-ui-primitives/dom-to-react
 */

import { createElement } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Convert one inline `style` attribute string into React's style object.
 * The libraries emit only plain kebab-case declarations (no custom properties
 * and no nameless declarations), so camel-casing the property is the whole
 * mapping.
 *
 * @param css - The serialized `style` attribute value.
 * @returns React's style object; unparsable declarations are skipped.
 */
export function styleObject(css: string): CSSProperties {
  const style: Record<string, string> = {}
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const name = declaration.slice(0, colon).trim()
    const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    style[key] = declaration.slice(colon + 1).trim()
  }
  return style
}

/**
 * Map one parsed DOM node onto a React element. Text nodes pass through;
 * element attributes transfer verbatim except `class`/`style`, which React
 * spells differently. Hyphenated SVG attributes (`stroke-width`) and
 * presentation attributes stay as authored, because React forwards unknown
 * attributes on host elements unchanged.
 *
 * @param node - Node from a parsed library output tree.
 * @param key - React key; callers pass the sibling index.
 * @returns The mapped element or text, or null for node kinds the libraries
 * never serialize.
 */
export function domToReact(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  /* v8 ignore next 2 -- library output holds only elements and text; other
     node kinds cannot appear in a serialized element vocabulary. */
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as Element
  const props: Record<string, unknown> = { key }
  for (const attribute of element.attributes) {
    if (attribute.name === 'class') props['className'] = attribute.value
    else if (attribute.name === 'style') props['style'] = styleObject(attribute.value)
    else props[attribute.name] = attribute.value
  }
  const children = domChildrenToReact(element)
  return children.length === 0
    ? createElement(element.localName, props)
    : createElement(element.localName, props, ...children)
}

/**
 * Map a parsed node's children in document order.
 *
 * @param parent - The parsed node whose children to map.
 * @returns One React node per child.
 */
export function domChildrenToReact(parent: ParentNode): ReactNode[] {
  return [...parent.childNodes].map(domToReact)
}
