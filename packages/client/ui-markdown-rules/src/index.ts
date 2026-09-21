/**
 * Markdown fence rules plugin, node half.
 *
 * Fence rendering is a host UI capability: the browser half registers rules
 * into the fence seats that markdown surfaces declare. Nothing here is
 * model-facing, so the node half has no behavior.
 */

/** Host plugin body — the browser half carries every contribution. */
export function apply(): void {}
