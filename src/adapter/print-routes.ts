/**
 * Route-table formatter — Phase 4 API-04.
 *
 * Builds and prints a fixed-format column table (METHOD | PATH | CONTROLLER.METHOD)
 * at boot time after all routers are mounted.
 *
 * D-17: printRoutes: true logs the table to console.log after all routers mounted.
 * D-17: Route table walks library metadata ONLY — does NOT introspect Express internals.
 *        No Express internals introspection — the library owns all registered routes.
 */
import type { ControllerMetadata } from '../types/resolved.js';
import { composePath } from './router-build.js';

/** A single row in the printed route table. */
export interface RouteRow {
  /** HTTP method uppercased (e.g., 'GET', 'POST'). */
  method: string;
  /** Full path composed from routePrefix + controller basePath + action path. */
  path: string;
  /** Handler reference in 'ControllerName.methodName' format. */
  handler: string;
}

/**
 * Build the route table from library controller metadata.
 * Walks each controller's actions and composes the full path using composePath.
 *
 * @param controllers - Array of resolved ControllerMetadata from buildMetadata()
 * @param routePrefix - The global route prefix (or empty string)
 * @returns Array of RouteRow objects in mount order
 */
export function buildRouteTable(
  controllers: readonly ControllerMetadata[],
  routePrefix: string,
): RouteRow[] {
  const rows: RouteRow[] = [];

  for (const ctrl of controllers) {
    const ctrlName = (ctrl.target as { name?: string }).name ?? 'AnonymousController';

    for (const action of ctrl.actions) {
      const method = action.verb.toUpperCase();
      const path = composePath(routePrefix, ctrl.basePath, action.path);
      const methodName = typeof action.method === 'symbol'
        ? action.method.toString()
        : String(action.method);
      const handler = `${ctrlName}.${methodName}`;

      rows.push({ method, path, handler });
    }
  }

  return rows;
}

/**
 * Print the route table to console.log in fixed-width column format.
 *
 * Output format:
 *   METHOD    PATH                        HANDLER
 *   GET       /api/users                  UserController.list
 *   POST      /api/users                  UserController.create
 *
 * Columns are padded to the max width of any row's value for that column.
 *
 * @param rows - Route rows from buildRouteTable()
 */
export function printRouteTable(rows: RouteRow[]): void {
  if (rows.length === 0) {
    console.log('No routes registered.');
    return;
  }

  // Calculate column widths
  const COL_METHOD = 'METHOD';
  const COL_PATH = 'PATH';
  const COL_HANDLER = 'HANDLER';

  const methodWidth = Math.max(COL_METHOD.length, ...rows.map((r) => r.method.length));
  const pathWidth = Math.max(COL_PATH.length, ...rows.map((r) => r.path.length));
  const handlerWidth = Math.max(COL_HANDLER.length, ...rows.map((r) => r.handler.length));

  const separator = '  ';

  // Header
  const header =
    COL_METHOD.padEnd(methodWidth) +
    separator +
    COL_PATH.padEnd(pathWidth) +
    separator +
    COL_HANDLER.padEnd(handlerWidth);
  console.log(header);

  // Rows
  for (const row of rows) {
    const line =
      row.method.padEnd(methodWidth) +
      separator +
      row.path.padEnd(pathWidth) +
      separator +
      row.handler.padEnd(handlerWidth);
    console.log(line);
  }
}
