const SOUND_ENABLED_STORAGE_KEY = "phosphor:sound-enabled:v1";
const MODULES_BROWSER_VIEW_MODE_STORAGE_KEY = "phosphor:modules-browser:view-mode:v1";
const MODULES_BROWSER_FONT_MODE_STORAGE_KEY = "phosphor:modules-browser:font-mode:v1";

export type ModulesBrowserViewMode = "retro" | "web";
export type ModulesBrowserFontMode = "retro" | "normal";

export const loadPersistedSoundEnabled = (): boolean => {
    try {
        const savedValue = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
        if (savedValue === null) {
            return true;
        }

        return savedValue !== "false";
    } catch {
        return true;
    }
};

export const persistSoundEnabled = (soundEnabled: boolean): void => {
    try {
        window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? "true" : "false");
    } catch {
        // ignore storage write failures
    }
};

export const loadPersistedModulesBrowserViewMode = (): ModulesBrowserViewMode => {
    try {
        const savedValue = window.localStorage.getItem(MODULES_BROWSER_VIEW_MODE_STORAGE_KEY);
        return savedValue === "web" ? "web" : "retro";
    } catch {
        return "retro";
    }
};

export const persistModulesBrowserViewMode = (viewMode: ModulesBrowserViewMode): void => {
    try {
        window.localStorage.setItem(MODULES_BROWSER_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
        // ignore storage write failures
    }
};

export const loadPersistedModulesBrowserFontMode = (): ModulesBrowserFontMode => {
    try {
        const savedValue = window.localStorage.getItem(MODULES_BROWSER_FONT_MODE_STORAGE_KEY);
        return savedValue === "normal" ? "normal" : "retro";
    } catch {
        return "retro";
    }
};

export const persistModulesBrowserFontMode = (fontMode: ModulesBrowserFontMode): void => {
    try {
        window.localStorage.setItem(MODULES_BROWSER_FONT_MODE_STORAGE_KEY, fontMode);
    } catch {
        // ignore storage write failures
    }
};
