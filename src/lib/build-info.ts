/** Identifies the deployed build (Vercel commit SHA prefix, or a local timestamp) in crash reports. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';
