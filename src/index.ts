/**
 * Open Insights is a library for building customized RUM clients.
 *
 * @remarks
 * This is the Open Insights core module. It defines business logic shared by
 * all RUM clients. An Open Insights "provider" specifies the logic particular
 * to a particular RUM service. Each of these is contained within its own
 * package. A "tag owner" builds a RUM client in their own package by importing
 * and utilizing features from the core module and one or more provider modules.
 *
 * @example
 * ```typescript
 * import { init, ClientSettingsBuilder } from 'open-insights'
 * import { Provider, ProviderSettings } from 'open-insights-provider-foo'
 *
 * const settingsBuilder = new ClientSettingsBuilder()
 * const fooSettings: ProviderSettings = {
 *   setting1: 'some value',
 *   setting2: 'some value,
 * }
 *
 * settingsBuilder.addProvider(new Provider(fooSettings))
 *
 * // Execute a RUM session
 * init(settingsBuilder.toSettings())
 *     .then(result => {
 *         // `result` contains the results from the RUM session after
 *         // completion
 *     })
 * ```
 *
 * @packageDocumentation
 */
import { ClientSettings, ExecutableContainer, SessionResult } from "./@types"
import defaultSessionProcessFunc from "./util/defaultSessionProcessFunc"
import whenReady from "./util/loadWhenDocumentReady"

/**
 * Called by tag owner code to initialize a RUM session, either immediately or
 * after some delay.
 *
 * @remarks
 * Waits for the page to load before processing.
 *
 * @param settings Specifies settings affecting client behavior. These are
 * determined by the tag owner at runtime, so may be used to specify page-level
 * overrides to general defaults.
 */
export default function init(settings: ClientSettings): Promise<SessionResult> {
    return whenReady().then(() => {
        if (settings.preConfigStartDelay) {
            return startLater(settings.preConfigStartDelay, settings)
        }
        return start(settings)
    })
}

/**
 * Called internally if a non-zero {@link ClientSettings.preConfigStartDelay}
 * setting has been specified. Calls {@link start} after the delay.
 *
 * @param delay The approximate time to wait (in milliseconds).
 * @param settings The settings object passed to {@link init}.
 */
function startLater(
    delay: number,
    settings: ClientSettings,
): Promise<SessionResult> {
    return new Promise((resolve) => {
        setTimeout(() => {
            start(settings).then((result) => resolve(result))
        }, delay)
    })
}

/**
 * Called immediately by {@link init} if no
 * {@link ClientSettings.preConfigStartDelay} setting has been specified.
 *
 * @param settings The settings object passed to {@link init}.
 */
function start(settings: ClientSettings): Promise<SessionResult> {
    return Promise.allSettled(
        settings.providers
            .filter((provider) => provider.shouldRun())
            .map((provider) => provider.fetchSessionConfig()),
    ).then((settled) => {
        const sessionConfigs = settled
            .filter((r) => r.status === "fulfilled")
            .map(
                (r) => (r as PromiseFulfilledResult<ExecutableContainer>).value,
            )
        sessionConfigs.forEach((v, i) => {
            const p = settings.providers[i]
            p.setSessionConfig(v)
            v.executables = p.expandTasks()
        })

        const process = settings.sessionProcess || defaultSessionProcessFunc
        return process(sessionConfigs)
    })
}
