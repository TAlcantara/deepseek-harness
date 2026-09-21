/**
 * Markdown renderer plugin, node half.
 *
 * Rendering is a host UI capability: the browser half owns the document
 * renderer and the fence dispatch seats, and composes them through the slot
 * registry. Nothing here is model-facing, so the node half has no behavior.
 */

/** Host plugin body — the browser half carries every contribution. */
export function apply(): void {}
