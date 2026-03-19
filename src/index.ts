/**
 * EureClaw entry point.
 * Thin wrapper that re-exports public API and starts the app.
 */

// Re-exports for backwards compatibility
export { escapeXml, formatMessages } from './router.js';
export { getAvailableWorkspaces } from './workspace-manager.js';
export { _setRegisteredWorkspaces } from './state.js';

import { logger } from './logger.js';
import { main } from './startup.js';

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start EureClaw');
    process.exit(1);
  });
}
