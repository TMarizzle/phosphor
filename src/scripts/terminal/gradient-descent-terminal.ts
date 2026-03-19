import { TerminalScript, TerminalScriptApi, TerminalScriptActionMeta } from "./types";

const ATMOSPHERE_SCREEN_IDS = [
    "floor-1-atmosphere",
    "floor-2-atmosphere",
    "floor-3-atmosphere",
    "floor-1-atmosphere-flow",
    "floor-2-atmosphere-flow",
    "floor-3-atmosphere-flow",
    "floor-4-atmosphere-flow",
    "floor-5-atmosphere-flow",
    "floor-6-atmosphere-flow",
];

const ATMOSPHERE_SCREEN_SET = new Set<string>(ATMOSPHERE_SCREEN_IDS);
const ESCAPE_POD_SCREEN_ID = "escape-pod-bay";
const ESCAPE_POD_COUNT = 11;
const MONARCH_SCREEN_ID = "monarch-link";
const QA_SCREEN_ID = "qa-inspection";
const ROOM_CONTROLS_SCREEN_ID = "room-controls";
const CIRCLE_CONTROLS_SCREEN_ID = "circle-controls";

const ATMOSPHERE_REPLENISHMENT_SCRIPT_ID = "atmosphereReplenishment";
const ATMOSPHERE_NITROGEN_SCRIPT_ID = "atmosphereNitrogen";
const ATMOSPHERE_OXYGEN_SCRIPT_ID = "atmosphereOxygen";
const ATMOSPHERE_TEMPERATURE_SCRIPT_ID = "atmosphereTemperature";
const MONARCH_ECHO_SCRIPT_ID = "monarchEcho";
const QA_RELEASE_SUBJECT_SCRIPT_ID = "qaReleaseSubject";
const QA_QUARANTINE_SCRIPT_ID = "qaQuarantineAccess";
const QA_PURGE_SCRIPT_ID = "qaPurgeQuarantine";
const ROOM_LIGHTING_SCRIPT_ID = "roomControlsLighting";
const ROOM_SIZE_SCRIPT_ID = "roomControlsSize";
const CIRCLE_CYCLE_SCRIPT_ID = "circleCycle";
const CIRCLE_RESET_SCRIPT_ID = "circleReset";
const CIRCLE_RELEASE_SUBJECT_SCRIPT_ID = "circleReleaseSubject";

const CIRCLE_CYCLE_KEY = "gradientDescent.circle.cycle";
const CIRCLE_ENDS_AT_KEY = "gradientDescent.circle.endsAt";
const CIRCLE_RESETTING_UNTIL_KEY = "gradientDescent.circle.resettingUntil";
const CIRCLE_RELEASE_SUBJECT_KEY = "gradientDescent.circle.releaseSubject";
const MONARCH_ECHO_KEY = "gradientDescent.monarch.echo";
const QA_RELEASE_SUBJECT_KEY = "gradientDescent.qa.releaseSubject";
const QA_QUARANTINE_OPEN_KEY = "gradientDescent.qa.quarantineOpen";
const QA_PURGED_KEY = "gradientDescent.qa.purged";
const ROOM_LIGHTING_KEY = "gradientDescent.roomControls.lighting";
const ROOM_SIZE_KEY = "gradientDescent.roomControls.size";
const ESCAPE_PODS_KEY = "gradientDescent.escapePods";

const DEFAULT_ATMOSPHERE_NITROGEN = 78;
const DEFAULT_ATMOSPHERE_OXYGEN = 22;
const DEFAULT_ATMOSPHERE_TEMPERATURE = 22;
const DEFAULT_ROOM_LIGHTING = 50;
const DEFAULT_ROOM_SIZE = 50;
const DEFAULT_CIRCLE_CYCLE = 3631205;
const INITIAL_CIRCLE_COUNTDOWN_SECONDS = 52;
const RESET_CIRCLE_COUNTDOWN_SECONDS = 600;
const CIRCLE_RESETTING_MS = 3000;

let circleTickerId: number | null = null;

interface AtmosphereState {
    replenishment: boolean;
    nitrogen: number;
    oxygen: number;
    temperature: number;
}

type EscapePodState = Record<string, boolean>;

const clamp = (value: number, min: number, max: number): number => {
    return Math.min(max, Math.max(min, value));
};

const normalizeInteger = (value: unknown, fallback: number): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.round(value);
};

const getAtmosphereKey = (screenId: string): string => {
    return `gradientDescent.atmosphere.${screenId}`;
};

const getAtmosphereState = (screenId: string, api: TerminalScriptApi): AtmosphereState => {
    const value = api.getVar<Partial<AtmosphereState>>(getAtmosphereKey(screenId)) || {};
    const nitrogen = clamp(
        normalizeInteger(value.nitrogen, DEFAULT_ATMOSPHERE_NITROGEN),
        0,
        100,
    );
    const oxygen = clamp(
        normalizeInteger(value.oxygen, 100 - nitrogen),
        0,
        100,
    );

    return {
        replenishment: value.replenishment !== false,
        nitrogen,
        oxygen: nitrogen + oxygen === 100 ? oxygen : (100 - nitrogen),
        temperature: clamp(
            normalizeInteger(value.temperature, DEFAULT_ATMOSPHERE_TEMPERATURE),
            -50,
            150,
        ),
    };
};

const setAtmosphereState = (
    screenId: string,
    nextState: AtmosphereState,
    api: TerminalScriptApi,
): void => {
    api.setVar(getAtmosphereKey(screenId), nextState);
};

const formatInlineValue = (label: string, value: string): string => {
    return `${label.padEnd(28, " ")}[> ${value}]`;
};

const buildAtmosphereReplenishmentStates = (screenId: string, replenishment: boolean): any[] => {
    return [
        {
            text: formatInlineValue("ATMOSPHERE REPLENISHMENT", "ON"),
            active: replenishment,
            action: "setAtmosphereReplenishment",
            target: `${screenId}:on`,
        },
        {
            text: formatInlineValue("ATMOSPHERE REPLENISHMENT", "OFF"),
            active: !replenishment,
            action: "setAtmosphereReplenishment",
            target: `${screenId}:off`,
        },
    ];
};

const syncAtmosphereScreen = (screenId: string, api: TerminalScriptApi): void => {
    const atmosphere = getAtmosphereState(screenId, api);
    api.patchScreenElement(screenId, ATMOSPHERE_REPLENISHMENT_SCRIPT_ID, {
        states: buildAtmosphereReplenishmentStates(screenId, atmosphere.replenishment),
    });
    api.patchScreenElement(screenId, ATMOSPHERE_NITROGEN_SCRIPT_ID, {
        text: formatInlineValue("NITROGEN", `${atmosphere.nitrogen}%`),
    });
    api.patchScreenElement(screenId, ATMOSPHERE_OXYGEN_SCRIPT_ID, {
        text: formatInlineValue("OXYGEN", `${atmosphere.oxygen}%`),
    });
    api.patchScreenElement(screenId, ATMOSPHERE_TEMPERATURE_SCRIPT_ID, {
        text: formatInlineValue("TEMPERATURE", `${atmosphere.temperature}°C`),
    });
};

const syncAllAtmosphereScreens = (api: TerminalScriptApi): void => {
    ATMOSPHERE_SCREEN_IDS.forEach((screenId) => {
        syncAtmosphereScreen(screenId, api);
    });
};

const getEscapePodState = (api: TerminalScriptApi): EscapePodState => {
    const value = api.getVar<EscapePodState>(ESCAPE_PODS_KEY);
    if (!value || typeof value !== "object") {
        return {};
    }

    return value;
};

const setEscapePodState = (nextState: EscapePodState, api: TerminalScriptApi): void => {
    api.setVar(ESCAPE_PODS_KEY, nextState);
};

const buildEscapePodStates = (podNumber: number, launched: boolean): any[] => {
    const label = `LAUNCH ESCAPE POD ${podNumber}`;
    return [
        {
            text: formatInlineValue(label, "DOCKED"),
            active: !launched,
            action: "setEscapePodState",
            target: `pod-${podNumber}:docked`,
        },
        {
            text: formatInlineValue(label, "LAUNCHED"),
            active: launched,
            action: "setEscapePodState",
            target: `pod-${podNumber}:launched`,
        },
    ];
};

const syncEscapePodBay = (api: TerminalScriptApi): void => {
    const state = getEscapePodState(api);
    for (let podNumber = 1; podNumber <= ESCAPE_POD_COUNT; podNumber += 1) {
        api.patchScreenElement(ESCAPE_POD_SCREEN_ID, `escapePod${podNumber}`, {
            states: buildEscapePodStates(podNumber, !!state[`pod-${podNumber}`]),
        });
    }
};

const escapeMarkdownText = (value: string): string => {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/([`*_#[\]{}()!+\-.>])/g, "\\$1");
};

const getStringVar = (key: string, api: TerminalScriptApi): string => {
    const value = api.getVar<unknown>(key);
    return typeof value === "string" ? value : "";
};

const syncMonarch = (api: TerminalScriptApi): void => {
    const echo = getStringVar(MONARCH_ECHO_KEY, api);
    api.patchScreenElement(MONARCH_SCREEN_ID, MONARCH_ECHO_SCRIPT_ID, {
        text: echo ? `> ${escapeMarkdownText(echo)}` : "",
    });
};

const syncQaInspection = (api: TerminalScriptApi): void => {
    const releaseSubject = getStringVar(QA_RELEASE_SUBJECT_KEY, api);
    const quarantineOpen = !!api.getVar<boolean>(QA_QUARANTINE_OPEN_KEY);
    const purged = !!api.getVar<boolean>(QA_PURGED_KEY);

    api.patchScreenElement(QA_SCREEN_ID, QA_RELEASE_SUBJECT_SCRIPT_ID, {
        text: releaseSubject
            ? `RELEASE SUBJECT\\#: ${escapeMarkdownText(releaseSubject)}`
            : "",
    });
    api.patchScreenElement(QA_SCREEN_ID, QA_QUARANTINE_SCRIPT_ID, {
        states: [
            {
                text: formatInlineValue("QUARANTINE ACCESS", "LOCKED"),
                active: !quarantineOpen,
                action: "setQaQuarantineAccess",
                target: "locked",
            },
            {
                text: formatInlineValue("QUARANTINE ACCESS", "OPEN"),
                active: quarantineOpen,
                action: "setQaQuarantineAccess",
                target: "open",
            },
        ],
    });
    api.patchScreenElement(QA_SCREEN_ID, QA_PURGE_SCRIPT_ID, {
        states: [
            {
                text: formatInlineValue("PURGE QUARANTINE", "READY"),
                active: !purged,
                action: "setQaPurgeState",
                target: "ready",
            },
            {
                text: formatInlineValue("PURGE QUARANTINE", "PURGE ACTIVATED"),
                active: purged,
                action: "setQaPurgeState",
                target: "purged",
            },
        ],
    });
};

const getRoomValue = (key: string, fallback: number, api: TerminalScriptApi): number => {
    return clamp(normalizeInteger(api.getVar<number>(key), fallback), 0, 100);
};

const syncRoomControls = (api: TerminalScriptApi): void => {
    const lighting = getRoomValue(ROOM_LIGHTING_KEY, DEFAULT_ROOM_LIGHTING, api);
    const size = getRoomValue(ROOM_SIZE_KEY, DEFAULT_ROOM_SIZE, api);

    api.patchScreenElement(ROOM_CONTROLS_SCREEN_ID, ROOM_LIGHTING_SCRIPT_ID, {
        text: formatInlineValue("LIGHTING", `${lighting}%`),
    });
    api.patchScreenElement(ROOM_CONTROLS_SCREEN_ID, ROOM_SIZE_SCRIPT_ID, {
        text: formatInlineValue("ROOM SIZE", `${size}%`),
    });
};

const formatCountdown = (remainingMs: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const getCircleCycle = (api: TerminalScriptApi): number => {
    return normalizeInteger(api.getVar<number>(CIRCLE_CYCLE_KEY), DEFAULT_CIRCLE_CYCLE);
};

const getCircleEndsAt = (api: TerminalScriptApi): number | null => {
    const value = api.getVar<number>(CIRCLE_ENDS_AT_KEY);
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return value;
};

const getCircleResettingUntil = (api: TerminalScriptApi): number | null => {
    const value = api.getVar<number>(CIRCLE_RESETTING_UNTIL_KEY);
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return value;
};

const ensureCircleState = (api: TerminalScriptApi): void => {
    if (!api.getVar<number>(CIRCLE_CYCLE_KEY)) {
        api.setVar(CIRCLE_CYCLE_KEY, DEFAULT_CIRCLE_CYCLE);
    }

    if (getCircleEndsAt(api) === null && getCircleResettingUntil(api) === null) {
        api.setVar(CIRCLE_ENDS_AT_KEY, Date.now() + (INITIAL_CIRCLE_COUNTDOWN_SECONDS * 1000));
    }
};

const advanceCircleState = (api: TerminalScriptApi): void => {
    ensureCircleState(api);

    const now = Date.now();
    const resettingUntil = getCircleResettingUntil(api);
    if (resettingUntil !== null) {
        if (now >= resettingUntil) {
            api.deleteVar(CIRCLE_RESETTING_UNTIL_KEY);
            api.setVar(CIRCLE_CYCLE_KEY, getCircleCycle(api) + 1);
            api.setVar(CIRCLE_ENDS_AT_KEY, now + (RESET_CIRCLE_COUNTDOWN_SECONDS * 1000));
        }
        return;
    }

    const endsAt = getCircleEndsAt(api);
    if (endsAt !== null && now >= endsAt) {
        api.deleteVar(CIRCLE_ENDS_AT_KEY);
        api.setVar(CIRCLE_RESETTING_UNTIL_KEY, now + CIRCLE_RESETTING_MS);
    }
};

const syncCircleControls = (api: TerminalScriptApi): void => {
    advanceCircleState(api);

    const cycle = getCircleCycle(api);
    const resettingUntil = getCircleResettingUntil(api);
    const endsAt = getCircleEndsAt(api);
    const releaseSubject = getStringVar(CIRCLE_RELEASE_SUBJECT_KEY, api);

    let resetText = "TIME UNTIL RESET: --:--";
    if (resettingUntil !== null && resettingUntil > Date.now()) {
        resetText = "TIME UNTIL RESET: CYCLE RESETTING";
    } else if (endsAt !== null) {
        resetText = `TIME UNTIL RESET: ${formatCountdown(endsAt - Date.now())}`;
    }

    api.patchScreenElement(CIRCLE_CONTROLS_SCREEN_ID, CIRCLE_CYCLE_SCRIPT_ID, {
        text: `CYCLE: ${cycle}`,
    });
    api.patchScreenElement(CIRCLE_CONTROLS_SCREEN_ID, CIRCLE_RESET_SCRIPT_ID, {
        text: resetText,
    });
    api.patchScreenElement(CIRCLE_CONTROLS_SCREEN_ID, CIRCLE_RELEASE_SUBJECT_SCRIPT_ID, {
        text: releaseSubject
            ? `RELEASE SUBJECT\\#: ${escapeMarkdownText(releaseSubject)}`
            : "",
    });
};

const stopCircleTicker = (): void => {
    if (circleTickerId === null) {
        return;
    }

    window.clearInterval(circleTickerId);
    circleTickerId = null;
};

const startCircleTicker = (api: TerminalScriptApi): void => {
    if (circleTickerId !== null) {
        return;
    }

    circleTickerId = window.setInterval(() => {
        syncCircleControls(api);
    }, 1000);
};

const syncAll = (api: TerminalScriptApi): void => {
    syncAllAtmosphereScreens(api);
    syncEscapePodBay(api);
    syncMonarch(api);
    syncQaInspection(api);
    syncRoomControls(api);
    syncCircleControls(api);
};

const handleAtmosphereAction = (
    target: string | undefined,
    meta: TerminalScriptActionMeta,
    api: TerminalScriptApi,
): boolean => {
    const screenId = typeof target === "string" ? target : api.getActiveScreenId();
    if (!screenId || !ATMOSPHERE_SCREEN_SET.has(screenId)) {
        return false;
    }

    const field = meta.linkTarget && typeof meta.linkTarget.field === "string"
        ? meta.linkTarget.field
        : "";
    const delta = meta.linkTarget && typeof meta.linkTarget.delta === "number"
        ? meta.linkTarget.delta
        : 0;
    if (!field || !delta) {
        return false;
    }

    const atmosphere = getAtmosphereState(screenId, api);
    if (field === "nitrogen") {
        const nitrogen = clamp(atmosphere.nitrogen + delta, 0, 100);
        atmosphere.nitrogen = nitrogen;
        atmosphere.oxygen = 100 - nitrogen;
    } else if (field === "oxygen") {
        const oxygen = clamp(atmosphere.oxygen + delta, 0, 100);
        atmosphere.oxygen = oxygen;
        atmosphere.nitrogen = 100 - oxygen;
    } else if (field === "temperature") {
        atmosphere.temperature = clamp(atmosphere.temperature + delta, -50, 150);
    } else {
        return false;
    }

    setAtmosphereState(screenId, atmosphere, api);
    syncAtmosphereScreen(screenId, api);
    return true;
};

const handleRoomControlsAction = (
    meta: TerminalScriptActionMeta,
    api: TerminalScriptApi,
): boolean => {
    const field = meta.linkTarget && typeof meta.linkTarget.field === "string"
        ? meta.linkTarget.field
        : "";
    const delta = meta.linkTarget && typeof meta.linkTarget.delta === "number"
        ? meta.linkTarget.delta
        : 0;
    if (!field || !delta) {
        return false;
    }

    if (field === "lighting") {
        api.setVar(
            ROOM_LIGHTING_KEY,
            clamp(getRoomValue(ROOM_LIGHTING_KEY, DEFAULT_ROOM_LIGHTING, api) + delta, 0, 100),
        );
    } else if (field === "size") {
        api.setVar(
            ROOM_SIZE_KEY,
            clamp(getRoomValue(ROOM_SIZE_KEY, DEFAULT_ROOM_SIZE, api) + delta, 0, 100),
        );
    } else {
        return false;
    }

    syncRoomControls(api);
    return true;
};

const gradientDescentTerminalScript: TerminalScript = {
    onMount: (api) => {
        stopCircleTicker();
        syncAll(api);
        startCircleTicker(api);
    },

    onScreenChanged: (_, api) => {
        syncAll(api);
        startCircleTicker(api);
    },

    onToggleState: (state, api) => {
        if (!state || typeof state !== "object" || typeof state.action !== "string") {
            return false;
        }

        if (state.action === "setAtmosphereReplenishment" && typeof state.target === "string") {
            const [screenId, rawValue] = state.target.split(":");
            if (!screenId || !ATMOSPHERE_SCREEN_SET.has(screenId)) {
                return false;
            }

            const atmosphere = getAtmosphereState(screenId, api);
            atmosphere.replenishment = rawValue === "on";
            setAtmosphereState(screenId, atmosphere, api);
            syncAtmosphereScreen(screenId, api);
            return true;
        }

        if (state.action === "setEscapePodState" && typeof state.target === "string") {
            const [podKey, rawState] = state.target.split(":");
            if (!podKey) {
                return false;
            }

            const escapePods = getEscapePodState(api);
            const alreadyLaunched = !!escapePods[podKey];
            if (!alreadyLaunched && rawState === "launched") {
                escapePods[podKey] = true;
                setEscapePodState(escapePods, api);
            }

            syncEscapePodBay(api);
            return true;
        }

        if (state.action === "setQaQuarantineAccess" && typeof state.target === "string") {
            api.setVar(QA_QUARANTINE_OPEN_KEY, state.target === "open");
            syncQaInspection(api);
            return true;
        }

        if (state.action === "setQaPurgeState" && typeof state.target === "string") {
            if (state.target === "purged") {
                api.setVar(QA_PURGED_KEY, true);
            }

            syncQaInspection(api);
            return true;
        }

        return false;
    },

    onPromptCommand: (command, args, api) => {
        if (!args || typeof args !== "object" || typeof args.action !== "string") {
            return false;
        }

        if (args.action === "monarchSpeak") {
            api.setVar(MONARCH_ECHO_KEY, command);
            syncMonarch(api);
            return true;
        }

        if (args.action === "qaReleaseSubject") {
            api.setVar(QA_RELEASE_SUBJECT_KEY, command);
            syncQaInspection(api);
            return true;
        }

        if (args.action === "circleReleaseSubject") {
            api.setVar(CIRCLE_RELEASE_SUBJECT_KEY, command);
            syncCircleControls(api);
            return true;
        }

        return false;
    },

    onAction: (action, target, meta, api) => {
        if (action === "adjustAtmosphere") {
            return handleAtmosphereAction(target, meta, api);
        }

        if (action === "adjustRoomControl") {
            return handleRoomControlsAction(meta, api);
        }

        return false;
    },
};

export default gradientDescentTerminalScript;
