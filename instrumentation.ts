import type { Instrumentation } from "next";

/**
 * Hook oficial de Next para capturar TODO error del servidor (Server
 * Components, route handlers y server actions) en un solo lugar. Sin esto,
 * un error de producción solo dejaba un stack suelto en los logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { reportError } = await import("@/lib/observability");
  reportError(error, {
    runtime: "server",
    source: `${context.routerKind}:${context.routePath}`,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });
};
