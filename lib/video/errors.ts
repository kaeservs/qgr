/**
 * A video failure in words a person can act on. Kept apart from render.ts so
 * the pages can recognise one without loading Mediabunny until it is needed.
 */
export class RenderError extends Error {}
