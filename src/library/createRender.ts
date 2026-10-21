import { Render } from "./Render";
import type { RenderConfigurationProps } from "./helpers/Render.config";
import { EnvironmentError, isBrowserEnvironment } from "./environment";

export { EnvironmentError, isBrowserEnvironment } from "./environment";

/**
 * Recommended entry point (E6). Validates the environment, constructs a
 * {@link Render}, and awaits `loadConfiguration(config)` so the returned
 * instance is fully configured.
 *
 * Unlike the raw `new Render(canvas)` + `await render.loadConfiguration(config)`
 * sequence (which still works), this:
 *  - throws a typed {@link EnvironmentError} synchronously under SSR/Node, and
 *  - accepts a *partial* config (matching `loadConfiguration`), filling the rest
 *    from {@link RenderConfiguration.defaultConfig}, which fixes the README's
 *    two-argument-constructor mismatch additively.
 *
 * @param canvas - The target canvas element.
 * @param config - Optional partial configuration.
 * @returns A promise resolving to a configured {@link Render}.
 * @throws {EnvironmentError} When no browser environment is available.
 */
export async function createRender(
    canvas: HTMLCanvasElement,
    config?: Partial<RenderConfigurationProps>
): Promise<Render> {
    if (!isBrowserEnvironment()) {
        throw new EnvironmentError(
            "rendraw requires a browser environment (window, document and HTMLCanvasElement). " +
            "createRender() cannot run under SSR / Node."
        );
    }

    const render = new Render(canvas);
    if (config) {
        await render.loadConfiguration(config);
    }
    return render;
}
