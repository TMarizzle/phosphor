import React, { Component, ReactElement } from "react";
import type { Session } from "@supabase/supabase-js";
import "./style.scss";

import Phosphor from "../Phosphor";
import ScriptCreator from "../ScriptCreator";
import ModulesPanel from "../ModulesPanel";
import { BUNDLED_SCRIPTS, BundledScript, DEFAULT_SCRIPT } from "../../data";
import {
    THEMES,
    Theme,
    CustomThemeConfig,
    createCustomTheme,
    loadPersistedCustomTheme,
    loadPersistedTheme,
    persistCustomTheme,
    persistTheme,
    applyTheme,
    sanitizeCustomTheme,
} from "../../themes";
import {
    ModuleRecord,
    ModuleVisibility,
    fetchAccessibleModuleById,
    getCurrentSession,
    getProfileRole,
    isModuleLinkShareable,
    isSupabaseConfigured,
    listOwnModules,
    listSubscribedModules,
    onAuthStateChange,
    saveModule,
    signInWithGoogle,
    signOut,
    subscribeToModule,
} from "../../lib/modules";
import { APP_TITLE } from "../../lib/branding";
import {
    loadPersistedSoundEnabled,
    loadPersistedSubscribedScriptsVisibility,
    persistSoundEnabled,
    persistSubscribedScriptsVisibility,
} from "../../lib/preferences";
import { getModulesBrowserUrl, getTerminalAppUrl } from "../../lib/routes";

const CUSTOM_SCRIPTS_STORAGE_KEY = "phosphor:custom-scripts:v1";
const ACTIVE_SCRIPT_STORAGE_KEY = "phosphor:active-script:v1";
const MAX_CUSTOM_SCRIPTS = 50;
const MODULE_SCRIPT_ID_PREFIX = "module:";
const MODULE_QUERY_PARAM = "module";

interface AppState {
    activeScript: BundledScript;
    activeScriptRevision: number;
    activeTerminalScreenId: string | null;
    customScripts: BundledScript[];
    activeTheme: Theme;
    customTheme: CustomThemeConfig;
    customThemeEditorOpen: boolean;
    headerCompact: boolean;
    soundEnabled: boolean;
    scriptDropdownOpen: boolean;
    optionsDropdownOpen: boolean;
    mobileMenuOpen: boolean;
    creatorOpen: boolean;
    creatorInitialScript: any | null;
    modulesOpen: boolean;
    previewMode: boolean;
    uploadError: string | null;
    authSession: Session | null;
    authLoading: boolean;
    modulesBusy: boolean;
    modulesError: string | null;
    modulesNotice: string | null;
    myModules: ModuleRecord[];
    subscribedModules: ModuleRecord[];
    subscribedScriptsVisibilityById: Record<string, boolean>;
    activeModule: ModuleRecord | null;
}

class App extends Component<any, AppState> {
    private _headerRef: React.RefObject<HTMLElement>;
    private _titleRef: React.RefObject<HTMLAnchorElement>;
    private _controlsRef: React.RefObject<HTMLDivElement>;
    private _headerLayoutRafId: number | null = null;
    private _authSubscription: { unsubscribe: () => void } | null = null;

    constructor(props: any) {
        super(props);

        const persistedTheme = loadPersistedTheme();
        const customTheme = loadPersistedCustomTheme();
        const soundEnabled = loadPersistedSoundEnabled();
        const subscribedScriptsVisibilityById = loadPersistedSubscribedScriptsVisibility();
        const customScripts = this._loadCustomScripts();
        const activeScript = this._resolveInitialActiveScript(customScripts);
        const initialThemeState = this._resolveThemeStateForScript(activeScript.json, persistedTheme, customTheme);
        this._headerRef = React.createRef<HTMLElement>();
        this._titleRef = React.createRef<HTMLAnchorElement>();
        this._controlsRef = React.createRef<HTMLDivElement>();
        this.state = {
            activeScript,
            activeScriptRevision: 0,
            activeTerminalScreenId: null,
            customScripts,
            activeTheme: initialThemeState.activeTheme,
            customTheme: initialThemeState.customTheme,
            customThemeEditorOpen: false,
            headerCompact: false,
            soundEnabled,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            mobileMenuOpen: false,
            creatorOpen: false,
            creatorInitialScript: null,
            modulesOpen: this._hasAuthReturnParams(),
            previewMode: false,
            uploadError: null,
            authSession: null,
            authLoading: isSupabaseConfigured(),
            modulesBusy: false,
            modulesError: null,
            modulesNotice: null,
            myModules: [],
            subscribedModules: [],
            subscribedScriptsVisibilityById,
            activeModule: null,
        };

        this._handleScriptSelect    = this._handleScriptSelect.bind(this);
        this._handleThemeSelect     = this._handleThemeSelect.bind(this);
        this._handleThemeColorChange = this._handleThemeColorChange.bind(this);
        this._handleCustomThemeEditorToggle = this._handleCustomThemeEditorToggle.bind(this);
        this._handleFileChange      = this._handleFileChange.bind(this);
        this._handleDropdownToggle  = this._handleDropdownToggle.bind(this);
        this._handleOptionsDropdownToggle = this._handleOptionsDropdownToggle.bind(this);
        this._handleMobileMenuToggle = this._handleMobileMenuToggle.bind(this);
        this._handleWindowResize = this._handleWindowResize.bind(this);
        this._scheduleHeaderLayoutUpdate = this._scheduleHeaderLayoutUpdate.bind(this);
        this._updateHeaderLayout = this._updateHeaderLayout.bind(this);
        this._handleClickOutside    = this._handleClickOutside.bind(this);
        this._handleReloadCurrentScript = this._handleReloadCurrentScript.bind(this);
        this._handleClearData       = this._handleClearData.bind(this);
        this._handleSoundToggle     = this._handleSoundToggle.bind(this);
        this._handleCreatorOpen     = this._handleCreatorOpen.bind(this);
        this._handleCreatorClose    = this._handleCreatorClose.bind(this);
        this._handleCreatorApply    = this._handleCreatorApply.bind(this);
        this._handleCreatorPreview  = this._handleCreatorPreview.bind(this);
        this._handlePreviewReturn   = this._handlePreviewReturn.bind(this);
        this._handlePhosphorScreenChanged = this._handlePhosphorScreenChanged.bind(this);
        this._handleModulesOpen     = this._handleModulesOpen.bind(this);
        this._handleModulesClose    = this._handleModulesClose.bind(this);
        this._handleModulesDismissError = this._handleModulesDismissError.bind(this);
        this._handleModulesDismissNotice = this._handleModulesDismissNotice.bind(this);
        this._handleGoogleSignIn    = this._handleGoogleSignIn.bind(this);
        this._handleSignOut         = this._handleSignOut.bind(this);
        this._handleRefreshModules  = this._handleRefreshModules.bind(this);
        this._handleModuleLoad      = this._handleModuleLoad.bind(this);
        this._handleModuleSubscribe = this._handleModuleSubscribe.bind(this);
        this._handleModuleSave      = this._handleModuleSave.bind(this);
        this._handleModuleCopyLink  = this._handleModuleCopyLink.bind(this);
        this._handleToggleSubscribedScriptVisibility = this._handleToggleSubscribedScriptVisibility.bind(this);
    }

    public componentDidMount(): void {
        applyTheme(this.state.activeTheme);
        document.addEventListener("click", this._handleClickOutside);
        window.addEventListener("resize", this._handleWindowResize);
        this._scheduleHeaderLayoutUpdate();
        void this._initializeModules();
    }

    public componentDidUpdate(_prevProps: any, prevState: AppState): void {
        this._scheduleHeaderLayoutUpdate();
        if (prevState.activeScript.id !== this.state.activeScript.id) {
            this._persistActiveScriptId(this.state.activeScript.id);
        }
    }

    public componentWillUnmount(): void {
        document.removeEventListener("click", this._handleClickOutside);
        window.removeEventListener("resize", this._handleWindowResize);
        if (this._headerLayoutRafId !== null) {
            window.cancelAnimationFrame(this._headerLayoutRafId);
            this._headerLayoutRafId = null;
        }
        if (this._authSubscription) {
            this._authSubscription.unsubscribe();
            this._authSubscription = null;
        }
    }

    private _loadCustomScripts(): BundledScript[] {
        try {
            const raw = localStorage.getItem(CUSTOM_SCRIPTS_STORAGE_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .map((entry: any) => {
                    if (!entry || typeof entry !== "object") {
                        return null;
                    }
                    if (typeof entry.id !== "string" || typeof entry.label !== "string") {
                        return null;
                    }
                    if (!entry.json || typeof entry.json !== "object" || !Array.isArray(entry.json.screens) || !entry.json.screens.length) {
                        return null;
                    }
                    return {
                        id: entry.id,
                        label: entry.label,
                        json: entry.json,
                    } as BundledScript;
                })
                .filter((entry: BundledScript | null): entry is BundledScript => !!entry)
                .slice(0, MAX_CUSTOM_SCRIPTS);
        } catch {
            return [];
        }
    }

    private _persistCustomScripts(customScripts: BundledScript[]): void {
        try {
            localStorage.setItem(CUSTOM_SCRIPTS_STORAGE_KEY, JSON.stringify(customScripts));
        } catch {
            // ignore storage write failures
        }
    }

    private _upsertCustomScripts(currentScripts: BundledScript[], nextScript: BundledScript): BundledScript[] {
        const withoutExisting = currentScripts.filter((script) => script.id !== nextScript.id);
        return [nextScript, ...withoutExisting].slice(0, MAX_CUSTOM_SCRIPTS);
    }

    private _resolveInitialActiveScript(customScripts: BundledScript[]): BundledScript {
        const persistedId = this._readPersistedActiveScriptId();
        if (!persistedId) {
            return DEFAULT_SCRIPT;
        }

        const availableScripts = [...BUNDLED_SCRIPTS, ...customScripts];
        const restored = availableScripts.find((script) => script.id === persistedId);
        return restored || DEFAULT_SCRIPT;
    }

    private _readPersistedActiveScriptId(): string | null {
        try {
            const raw = localStorage.getItem(ACTIVE_SCRIPT_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            return raw;
        } catch {
            return null;
        }
    }

    private _persistActiveScriptId(scriptId: string): void {
        if (!scriptId || scriptId.startsWith("custom:preview:") || this._isModuleScriptId(scriptId)) {
            return;
        }
        try {
            localStorage.setItem(ACTIVE_SCRIPT_STORAGE_KEY, scriptId);
        } catch {
            // ignore storage write failures
        }
    }

    private _isModuleScriptId(scriptId: string): boolean {
        return scriptId.startsWith(MODULE_SCRIPT_ID_PREFIX);
    }

    private _buildModuleScript(module: ModuleRecord, scriptJsonOverride?: any): BundledScript {
        return {
            id: `${MODULE_SCRIPT_ID_PREFIX}${module.id}`,
            label: module.title.toUpperCase().slice(0, 24),
            json: scriptJsonOverride || module.script_json,
        };
    }

    private _resolveThemeStateForScript(
        scriptJson: any,
        fallbackTheme?: Theme,
        fallbackCustomTheme?: CustomThemeConfig
    ): Pick<AppState, "activeTheme" | "customTheme"> {
        const rawThemeId = typeof scriptJson?.config?.theme === "string"
            ? scriptJson.config.theme
            : (typeof scriptJson?.config?.themeId === "string" ? scriptJson.config.themeId : "");
        const themeId = rawThemeId.trim().toLowerCase();

        if (themeId === "custom") {
            const customTheme = sanitizeCustomTheme(scriptJson?.config?.customTheme);
            return {
                activeTheme: createCustomTheme(customTheme),
                customTheme,
            };
        }

        const presetTheme = THEMES.find((theme) => theme.id === themeId);
        if (presetTheme) {
            return {
                activeTheme: presetTheme,
                customTheme: fallbackCustomTheme || loadPersistedCustomTheme(),
            };
        }

        return {
            activeTheme: fallbackTheme || loadPersistedTheme(),
            customTheme: fallbackCustomTheme || loadPersistedCustomTheme(),
        };
    }

    private _applyScriptThemePreset(scriptJson: any): Pick<AppState, "activeTheme" | "customTheme"> {
        const nextThemeState = this._resolveThemeStateForScript(scriptJson);
        applyTheme(nextThemeState.activeTheme);
        return nextThemeState;
    }

    private _getScriptDefaultTextSpeed(scriptJson: any): number | undefined {
        const rawValue = scriptJson?.config?.defaultTextSpeed;
        const parsed = typeof rawValue === "number"
            ? rawValue
            : (typeof rawValue === "string" && rawValue.trim().length ? Number(rawValue) : Number.NaN);

        if (!Number.isFinite(parsed) || parsed <= 0) {
            return undefined;
        }

        return parsed;
    }

    private _sanitizeScriptJson(scriptJson: any): any {
        const cleanedJson = JSON.parse(JSON.stringify(scriptJson));
        if (cleanedJson?.config && typeof cleanedJson.config === "object") {
            delete cleanedJson.config.previewStartScreen;
            delete cleanedJson.config.previewSelectedElementIndex;
            delete cleanedJson.config.previewSidebarListMode;
        }
        return cleanedJson;
    }

    private _buildCreatorInitialScript(scriptJson: any, screenId?: string | null): any {
        const seededJson = JSON.parse(JSON.stringify(scriptJson || {}));
        if (!screenId || !Array.isArray(seededJson?.screens)) {
            return seededJson;
        }

        const screenExists = seededJson.screens.some((screen: any) => {
            return screen && typeof screen.id === "string" && screen.id === screenId;
        });
        if (!screenExists) {
            return seededJson;
        }

        seededJson.config = {
            ...(seededJson.config || {}),
            previewStartScreen: screenId,
            previewSidebarListMode: "screens",
        };
        delete seededJson.config.previewSelectedElementIndex;
        return seededJson;
    }

    private _readModuleIdFromLocation(): string | null {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get(MODULE_QUERY_PARAM);
        } catch {
            return null;
        }
    }

    private _shouldReturnToModulesBrowser(): boolean {
        try {
            const params = new URLSearchParams(window.location.search);
            const authReturn = params.get("auth_return");
            return authReturn === "modules" || authReturn === "library";
        } catch {
            return false;
        }
    }

    private _hasAuthReturnParams(): boolean {
        try {
            const params = new URLSearchParams(window.location.search);
            return params.has("code") && params.has("state");
        } catch {
            return false;
        }
    }

    private _clearTransientAuthParams(): void {
        try {
            const url = new URL(window.location.href);
            const removableParams = ["code", "state", "error", "error_code", "error_description", "auth_return"];
            let changed = false;
            removableParams.forEach((param) => {
                if (url.searchParams.has(param)) {
                    url.searchParams.delete(param);
                    changed = true;
                }
            });
            if (changed) {
                window.history.replaceState({}, "", url.toString());
            }
        } catch {
            // ignore invalid URLs
        }
    }

    private _setModuleQueryParam(moduleId: string | null): void {
        try {
            const url = new URL(window.location.href);
            if (moduleId) {
                url.searchParams.set(MODULE_QUERY_PARAM, moduleId);
            } else {
                url.searchParams.delete(MODULE_QUERY_PARAM);
            }
            ["code", "state", "error", "error_code", "error_description"].forEach((param) => {
                url.searchParams.delete(param);
            });
            window.history.replaceState({}, "", url.toString());
        } catch {
            // ignore invalid URLs
        }
    }

    private _makeModuleShareUrl(moduleId: string): string {
        return getTerminalAppUrl(moduleId);
    }

    private _getPhosphorStorageSlug(scriptJson: any): string {
        return ((scriptJson?.config?.script || scriptJson?.config?.name || "default") as string)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    private _clearActiveScriptRuntimeState(): void {
        try {
            const slug = this._getPhosphorStorageSlug(this.state.activeScript?.json);
            const sessionKey = `phosphor:session:${slug}:v1`;
            const shipLogKey = `phosphor:ship-logs:${slug}:v1`;
            const userReportKey = `phosphor:user-reports:${slug}:v1`;
            localStorage.removeItem(sessionKey);
            localStorage.removeItem(shipLogKey);
            localStorage.removeItem(userReportKey);
        } catch {
            // ignore storage failures
        }
    }

    private _getSessionUserId(): string | null {
        return this.state.authSession?.user?.id || null;
    }

    private _buildSubscribedScriptVisibility(
        subscribedModules: ModuleRecord[],
        currentVisibilityById: Record<string, boolean>
    ): Record<string, boolean> {
        return subscribedModules.reduce((acc: Record<string, boolean>, module) => {
            acc[module.id] = currentVisibilityById[module.id] !== false;
            return acc;
        }, {});
    }

    private _handleToggleSubscribedScriptVisibility(moduleId: string): void {
        this.setState((prev): Pick<AppState, "subscribedScriptsVisibilityById" | "modulesNotice" | "modulesError"> => {
            const module = prev.subscribedModules.find((entry) => entry.id === moduleId);
            if (!module) {
                return {
                    subscribedScriptsVisibilityById: prev.subscribedScriptsVisibilityById,
                    modulesNotice: prev.modulesNotice,
                    modulesError: prev.modulesError,
                };
            }

            const nextValue = prev.subscribedScriptsVisibilityById[moduleId] === false;
            const nextVisibilityById = {
                ...prev.subscribedScriptsVisibilityById,
                [moduleId]: nextValue,
            };
            persistSubscribedScriptsVisibility(nextVisibilityById);
            return {
                subscribedScriptsVisibilityById: nextVisibilityById,
                modulesNotice: nextValue
                    ? `"${module.title}" now appears in the script dropdown.`
                    : `"${module.title}" hidden from the script dropdown.`,
                modulesError: null,
            };
        });
    }

    private _upsertModuleRecord(currentModules: ModuleRecord[], nextModule: ModuleRecord): ModuleRecord[] {
        const otherModules = currentModules.filter((module) => module.id !== nextModule.id);
        return [nextModule, ...otherModules].sort((left, right) => {
            return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        });
    }

    private _findModuleByScriptId(scriptId: string): ModuleRecord | null {
        if (!this._isModuleScriptId(scriptId)) {
            return null;
        }

        const moduleId = scriptId.slice(MODULE_SCRIPT_ID_PREFIX.length);
        const candidateModules = [
            this.state.activeModule,
            ...this.state.myModules,
            ...this.state.subscribedModules,
        ].filter((module): module is ModuleRecord => !!module);

        return candidateModules.find((module) => module.id === moduleId) || null;
    }

    private async _initializeModules(): Promise<void> {
        if (!isSupabaseConfigured()) {
            this.setState({ authLoading: false });
            return;
        }

        try {
            const session = await getCurrentSession();
            this.setState({
                authSession: session,
                authLoading: false,
            });

            this._authSubscription = onAuthStateChange((nextSession) => {
                this.setState({
                    authSession: nextSession,
                    authLoading: false,
                });

                if (nextSession?.user?.id) {
                    void this._handleRefreshModules(nextSession.user.id);
                    return;
                }

                this.setState({
                    myModules: [],
                    subscribedModules: [],
                });
            });

            if (session?.user?.id) {
                await this._handleRefreshModules(session.user.id);
            }

            if (this._shouldReturnToModulesBrowser()) {
                window.location.href = getModulesBrowserUrl();
                return;
            }

            await this._loadSharedModuleFromLocation(session);
        } catch (error: any) {
            this.setState({
                authLoading: false,
                modulesError: error?.message || "Could not initialize Supabase.",
            });
        } finally {
            this._clearTransientAuthParams();
        }
    }

    private async _loadSharedModuleFromLocation(sessionOverride?: Session | null): Promise<void> {
        const moduleId = this._readModuleIdFromLocation();
        if (!moduleId || !isSupabaseConfigured()) {
            return;
        }

        this.setState({
            modulesBusy: true,
            modulesError: null,
        });

        try {
            const sessionUserId = sessionOverride?.user?.id || this._getSessionUserId();
            const sessionRole = sessionUserId
                ? await getProfileRole(sessionUserId).catch(() => "user")
                : "user";
            const module = await fetchAccessibleModuleById(moduleId, sessionUserId, {
                role: sessionRole as "user" | "admin",
            });
            if (!module) {
                this.setState({
                    modulesBusy: false,
                    modulesError: "The module could not be found, or you do not have access to it.",
                });
                return;
            }

            this._loadModuleIntoApp(module, {
                notice: "Shared module loaded.",
                keepQueryParam: true,
            });
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not load the shared module.",
            });
        }
    }

    private _loadModuleIntoApp(
        module: ModuleRecord,
        options?: {
            notice?: string | null;
            keepQueryParam?: boolean;
        }
    ): void {
        const nextScript = this._buildModuleScript(module);
        const nextThemeState = this._applyScriptThemePreset(nextScript.json);
        this.setState((prev): Pick<AppState,
            "activeScript"
            | "activeScriptRevision"
            | "activeTerminalScreenId"
            | "activeModule"
            | "activeTheme"
            | "customTheme"
            | "creatorOpen"
            | "creatorInitialScript"
            | "previewMode"
            | "uploadError"
            | "modulesBusy"
            | "modulesError"
            | "modulesNotice"
            | "scriptDropdownOpen"
            | "optionsDropdownOpen"
            | "customThemeEditorOpen"
            | "mobileMenuOpen"
        > => ({
            activeScript: nextScript,
            activeScriptRevision: prev.activeScriptRevision + 1,
            activeTerminalScreenId: null,
            activeModule: module as ModuleRecord | null,
            ...nextThemeState,
            creatorOpen: false,
            creatorInitialScript: null,
            previewMode: false,
            uploadError: null as string | null,
            modulesBusy: false,
            modulesError: null as string | null,
            modulesNotice: options?.notice || null,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
        }));

        if (options?.keepQueryParam) {
            return;
        }

        if (isModuleLinkShareable(module.visibility)) {
            this._setModuleQueryParam(module.id);
            return;
        }

        this._setModuleQueryParam(null);
    }

    private _handleWindowResize(): void {
        this._scheduleHeaderLayoutUpdate();
    }

    private _scheduleHeaderLayoutUpdate(): void {
        if (this._headerLayoutRafId !== null) {
            return;
        }

        this._headerLayoutRafId = window.requestAnimationFrame(this._updateHeaderLayout);
    }

    private _updateHeaderLayout(): void {
        this._headerLayoutRafId = null;

        const header = this._headerRef.current;
        const title = this._titleRef.current;
        const controls = this._controlsRef.current;
        if (!header || !title || !controls) {
            return;
        }

        // Measure in desktop mode even if currently compact.
        const hadCompactClass = header.classList.contains("phosphor-header--compact");
        if (hadCompactClass) {
            header.classList.remove("phosphor-header--compact");
        }

        const headerRect = header.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const controlsRect = controls.getBoundingClientRect();
        const controlChildren = Array.from(controls.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement)
            .filter((child) => child.offsetParent !== null);

        let controlsVisualLeft = controlsRect.left;
        let controlsVisualRight = controlsRect.right;
        controlChildren.forEach((child) => {
            const childRect = child.getBoundingClientRect();
            controlsVisualLeft = Math.min(controlsVisualLeft, childRect.left);
            controlsVisualRight = Math.max(controlsVisualRight, childRect.right);
        });

        // scrollWidth catches right-side overflow, but when controls are right-aligned
        // they can overflow to the left and overlap the title without changing scrollWidth.
        const titleOverlap = controlsVisualLeft < titleRect.right + 8;
        const controlsOutsideHeader = controlsVisualLeft < headerRect.left + 1
            || controlsVisualRight > headerRect.right - 1;
        const narrowViewport = window.innerWidth <= 900;
        const shouldCompact = titleOverlap
            || controlsOutsideHeader
            || narrowViewport
            || header.scrollWidth > header.clientWidth + 1
            || controls.scrollWidth > controls.clientWidth + 1;

        if (hadCompactClass) {
            header.classList.add("phosphor-header--compact");
        }

        if (shouldCompact === this.state.headerCompact) {
            return;
        }

        this.setState({
            headerCompact: shouldCompact,
            mobileMenuOpen: false,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
        });
    }

    private _handleClickOutside(e: MouseEvent): void {
        if (!this.state.scriptDropdownOpen && !this.state.optionsDropdownOpen && !this.state.mobileMenuOpen) {
            return;
        }

        const target = e.target;
        if (!(target instanceof Element)) {
            return;
        }
        const nextState: Partial<AppState> = {};

        if (this.state.scriptDropdownOpen && !target.closest(".phosphor-header__script-wrapper")) {
            nextState.scriptDropdownOpen = false;
        }

        if (this.state.optionsDropdownOpen && !target.closest(".phosphor-header__options-wrapper")) {
            nextState.optionsDropdownOpen = false;
            nextState.customThemeEditorOpen = false;
        }

        if (this.state.mobileMenuOpen && !target.closest(".phosphor-header")) {
            nextState.mobileMenuOpen = false;
            nextState.scriptDropdownOpen = false;
            nextState.optionsDropdownOpen = false;
            nextState.customThemeEditorOpen = false;
        }

        if (Object.keys(nextState).length) {
            this.setState(nextState as Pick<AppState, "scriptDropdownOpen" | "optionsDropdownOpen" | "mobileMenuOpen" | "customThemeEditorOpen">);
        }
    }

    private _handleDropdownToggle(): void {
        this.setState((prev) => ({
            scriptDropdownOpen: !prev.scriptDropdownOpen,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
        }));
    }

    private _handleOptionsDropdownToggle(): void {
        this.setState((prev) => ({
            optionsDropdownOpen: !prev.optionsDropdownOpen,
            scriptDropdownOpen: false,
            customThemeEditorOpen: prev.optionsDropdownOpen ? false : prev.customThemeEditorOpen,
        }));
    }

    private _handleMobileMenuToggle(): void {
        if (!this.state.headerCompact && window.innerWidth > 900) {
            return;
        }

        this.setState((prev) => ({
            mobileMenuOpen: !prev.mobileMenuOpen,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
        }));
    }

    private _handleCustomThemeEditorToggle(): void {
        this.setState((prev) => {
            if (prev.activeTheme.id !== "custom") {
                return null;
            }

            return {
                customThemeEditorOpen: !prev.customThemeEditorOpen,
            };
        });
    }

    private _handleScriptSelect(script: BundledScript): void {
        if (script.id === this.state.activeScript.id) {
            this.setState({
                scriptDropdownOpen: false,
                optionsDropdownOpen: false,
                customThemeEditorOpen: false,
                mobileMenuOpen: false,
            });
            return;
        }
        const nextActiveModule = this._isModuleScriptId(script.id) ? this.state.activeModule : null;
        const resolvedActiveModule = this._findModuleByScriptId(script.id) || nextActiveModule;
        const nextThemeState = this._applyScriptThemePreset(script.json);
        this.setState((prev): Pick<AppState,
            "activeScript"
            | "activeScriptRevision"
            | "activeTerminalScreenId"
            | "activeModule"
            | "activeTheme"
            | "customTheme"
            | "scriptDropdownOpen"
            | "optionsDropdownOpen"
            | "customThemeEditorOpen"
            | "mobileMenuOpen"
            | "creatorInitialScript"
            | "previewMode"
            | "uploadError"
        > => ({
            activeScript: script,
            activeScriptRevision: prev.activeScriptRevision + 1,
            activeTerminalScreenId: null,
            activeModule: resolvedActiveModule,
            ...nextThemeState,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
            creatorInitialScript: null,
            previewMode: false,
            uploadError: null as string | null,
        }));

        if (!resolvedActiveModule) {
            this._setModuleQueryParam(null);
            return;
        }

        if (isModuleLinkShareable(resolvedActiveModule.visibility)) {
            this._setModuleQueryParam(resolvedActiveModule.id);
            return;
        }

        this._setModuleQueryParam(null);
    }

    private _handleThemeSelect(themeId: string): void {
        if (themeId === "custom") {
            this.setState((prev) => {
                const baseThemeId = prev.activeTheme.id === "custom"
                    ? prev.customTheme.baseThemeId
                    : prev.activeTheme.id;
                const customTheme: CustomThemeConfig = {
                    ...prev.customTheme,
                    baseThemeId,
                };
                const nextTheme = createCustomTheme(customTheme);
                applyTheme(nextTheme);
                persistTheme(nextTheme);
                persistCustomTheme(customTheme);
                return {
                    customTheme,
                    activeTheme: nextTheme,
                    optionsDropdownOpen: true,
                    customThemeEditorOpen: true,
                };
            });
            return;
        }

        const nextTheme = THEMES.find((theme) => theme.id === themeId);
        if (!nextTheme) {
            return;
        }

        applyTheme(nextTheme);
        persistTheme(nextTheme);
        this.setState({
            activeTheme: nextTheme,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
        });
    }

    private _handleThemeColorChange(
        key: "fgHex" | "alertHex" | "emphasisHex" | "noticeHex" | "hyperlinkHex" | "systemHex",
        value: string
    ): void {
        this.setState((prev): Pick<AppState, "customTheme" | "activeTheme"> => {
            const customTheme: CustomThemeConfig = {
                ...prev.customTheme,
                [key]: value,
            };
            persistCustomTheme(customTheme);

            if (prev.activeTheme.id !== "custom") {
                return {
                    customTheme,
                    activeTheme: prev.activeTheme,
                };
            }

            const nextTheme = createCustomTheme(customTheme);
            applyTheme(nextTheme);
            persistTheme(nextTheme);
            return {
                customTheme,
                activeTheme: nextTheme,
            };
        });
    }

    private _handleClearData(): void {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    }

    private _handleReloadCurrentScript(): void {
        this._clearActiveScriptRuntimeState();
        this.setState((prev): Pick<AppState,
            "activeScriptRevision"
            | "activeTerminalScreenId"
            | "scriptDropdownOpen"
            | "optionsDropdownOpen"
            | "customThemeEditorOpen"
            | "mobileMenuOpen"
            | "creatorOpen"
            | "creatorInitialScript"
            | "previewMode"
            | "uploadError"
            | "modulesNotice"
        > => ({
            activeScriptRevision: prev.activeScriptRevision + 1,
            activeTerminalScreenId: null,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
            creatorOpen: false,
            creatorInitialScript: null,
            previewMode: false,
            uploadError: null as string | null,
            modulesNotice: "Reloaded from the beginning.",
        }));
    }

    private _handleSoundToggle(): void {
        this.setState((prev) => {
            const soundEnabled = !prev.soundEnabled;
            persistSoundEnabled(soundEnabled);
            return {
                soundEnabled,
            };
        });
    }

    private _handleCreatorOpen(): void {
        this.setState({
            creatorOpen: true,
            creatorInitialScript: this._buildCreatorInitialScript(
                this.state.activeScript.json,
                this.state.activeTerminalScreenId
            ),
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
            previewMode: false,
            uploadError: null as string | null,
        });
    }

    private _handleCreatorClose(): void {
        this.setState({
            creatorOpen: false,
            creatorInitialScript: null,
        });
    }

    private _handleCreatorApply(scriptJson: any): void {
        if (!Array.isArray(scriptJson?.screens) || !scriptJson.screens.length) {
            this.setState({ uploadError: "Invalid JSON: missing 'screens' array." });
            return;
        }

        const cleanedJson = this._sanitizeScriptJson(scriptJson);
        const label = (cleanedJson?.config?.name || "CUSTOM").toString();
        const editingActiveModule = !!this.state.activeModule;
        const keepExistingId = editingActiveModule
            || (this.state.activeScript.id.startsWith("custom:")
                && !this.state.activeScript.id.startsWith("custom:preview:"));
        const nextScript: BundledScript = {
            id: keepExistingId ? this.state.activeScript.id : `custom:creator:${Date.now()}`,
            label: label.toUpperCase().slice(0, 24),
            json: cleanedJson,
        };
        const nextThemeState = this._applyScriptThemePreset(cleanedJson);

        this.setState((prev): Pick<AppState,
            "activeScript"
            | "activeScriptRevision"
            | "activeTerminalScreenId"
            | "customScripts"
            | "activeTheme"
            | "customTheme"
            | "creatorOpen"
            | "creatorInitialScript"
            | "scriptDropdownOpen"
            | "optionsDropdownOpen"
            | "customThemeEditorOpen"
            | "mobileMenuOpen"
            | "previewMode"
            | "uploadError"
            | "modulesNotice"
        > => {
            const customScripts = editingActiveModule
                ? prev.customScripts
                : this._upsertCustomScripts(prev.customScripts, nextScript);
            if (!editingActiveModule) {
                this._persistCustomScripts(customScripts);
            }
            return {
                activeScript: nextScript,
                activeScriptRevision: prev.activeScriptRevision + 1,
                activeTerminalScreenId: null,
                customScripts,
                ...nextThemeState,
                creatorOpen: false,
                creatorInitialScript: null,
                scriptDropdownOpen: false,
                optionsDropdownOpen: false,
                customThemeEditorOpen: false,
                mobileMenuOpen: false,
                previewMode: false,
                uploadError: null as string | null,
                modulesNotice: editingActiveModule ? "Local edits applied. Save the module to push them to Supabase." : prev.modulesNotice,
            };
        });
    }

    private _handleCreatorPreview(
        scriptJson: any,
        screenId: string,
        elementIndex: number,
        sidebarListMode: "screens" | "dialogs"
    ): void {
        if (!Array.isArray(scriptJson?.screens) || !scriptJson.screens.length) {
            this.setState({ uploadError: "Invalid JSON: missing 'screens' array." });
            return;
        }

        const exists = scriptJson.screens.some((screen: any) => {
            return screen && typeof screen.id === "string" && screen.id === screenId;
        });
        if (!exists) {
            this.setState({ uploadError: "Preview failed: selected screen was not found." });
            return;
        }

        const previewJson = JSON.parse(JSON.stringify(scriptJson));
        const selectedScreen = previewJson.screens.find((screen: any) => {
            return screen && typeof screen.id === "string" && screen.id === screenId;
        });
        const maxIndex = Math.max(0, ((selectedScreen?.content?.length || 1) - 1));
        const safeElementIndex = Number.isFinite(elementIndex)
            ? Math.min(maxIndex, Math.max(0, Math.floor(elementIndex)))
            : 0;

        previewJson.config = {
            ...(previewJson.config || {}),
            previewStartScreen: screenId,
            previewSelectedElementIndex: safeElementIndex,
            previewSidebarListMode: sidebarListMode,
        };

        const label = (previewJson?.config?.name || "PREVIEW").toString();
        const previewScript: BundledScript = {
            id: `custom:preview:${Date.now()}`,
            label: label.toUpperCase().slice(0, 24),
            json: previewJson,
        };
        const nextThemeState = this._applyScriptThemePreset(previewJson);

        this.setState((prev): Pick<AppState,
            "activeScript"
            | "activeScriptRevision"
            | "activeTerminalScreenId"
            | "activeTheme"
            | "customTheme"
            | "creatorOpen"
            | "creatorInitialScript"
            | "scriptDropdownOpen"
            | "optionsDropdownOpen"
            | "customThemeEditorOpen"
            | "mobileMenuOpen"
            | "previewMode"
            | "uploadError"
        > => ({
            activeScript: previewScript,
            activeScriptRevision: prev.activeScriptRevision + 1,
            activeTerminalScreenId: null,
            ...nextThemeState,
            creatorOpen: false,
            creatorInitialScript: null,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
            previewMode: true,
            uploadError: null as string | null,
        }));
    }

    private _handlePreviewReturn(): void {
        this.setState({
            creatorOpen: true,
            creatorInitialScript: this._buildCreatorInitialScript(
                this.state.activeScript.json,
                this.state.activeTerminalScreenId
            ),
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
            previewMode: false,
            uploadError: null as string | null,
        });
    }

    private _handlePhosphorScreenChanged(screenId: string): void {
        if (!screenId || screenId === this.state.activeTerminalScreenId) {
            return;
        }

        this.setState({
            activeTerminalScreenId: screenId,
        });
    }

    private _handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.setState({ uploadError: "File is too large. Maximum size is 5 MB." });
            e.target.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string);
                if (!Array.isArray(parsed?.screens) || !parsed.screens.length) {
                    this.setState({ uploadError: "Invalid JSON: missing 'screens' array." });
                    return;
                }

                const label = parsed?.config?.name || file.name.replace(/\.json$/i, "");
                const customScript: BundledScript = {
                    id: `custom:${Date.now()}`,
                    label: label.toUpperCase().slice(0, 24),
                    json: parsed,
                };
                const nextThemeState = this._applyScriptThemePreset(parsed);
                this.setState((prev): Pick<AppState,
                    "activeScript"
                    | "activeScriptRevision"
                    | "activeTerminalScreenId"
                    | "customScripts"
                    | "activeTheme"
                    | "customTheme"
                    | "activeModule"
                    | "scriptDropdownOpen"
                    | "optionsDropdownOpen"
                    | "customThemeEditorOpen"
                    | "mobileMenuOpen"
                    | "creatorInitialScript"
                    | "previewMode"
                    | "uploadError"
                > => {
                    const customScripts = this._upsertCustomScripts(prev.customScripts, customScript);
                    this._persistCustomScripts(customScripts);
                    return {
                        activeScript: customScript,
                        activeScriptRevision: prev.activeScriptRevision + 1,
                        activeTerminalScreenId: null,
                        customScripts,
                        ...nextThemeState,
                        activeModule: null as ModuleRecord | null,
                        scriptDropdownOpen: false,
                        optionsDropdownOpen: false,
                        customThemeEditorOpen: false,
                        mobileMenuOpen: false,
                        creatorInitialScript: null,
                        previewMode: false,
                        uploadError: null as string | null,
                    };
                });
                this._setModuleQueryParam(null);
            } catch {
                this.setState({ uploadError: "Could not parse JSON file." });
            }
        };
        reader.readAsText(file);

        // reset so re-uploading the same file still triggers onChange
        e.target.value = "";
    }

    private _handleModulesOpen(): void {
        this.setState({
            modulesOpen: true,
            scriptDropdownOpen: false,
            optionsDropdownOpen: false,
            customThemeEditorOpen: false,
            mobileMenuOpen: false,
        });
    }

    private _handleModulesClose(): void {
        this.setState({ modulesOpen: false });
    }

    private _handleModulesDismissError(): void {
        this.setState({ modulesError: null });
    }

    private _handleModulesDismissNotice(): void {
        this.setState({ modulesNotice: null });
    }

    private async _handleGoogleSignIn(): Promise<void> {
        if (!isSupabaseConfigured()) {
            this.setState({ modulesError: "Supabase is not configured in this environment." });
            return;
        }

        this.setState({
            modulesBusy: true,
            modulesError: null,
            modulesNotice: null,
        });

        try {
            await signInWithGoogle(window.location.href);
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not start Google sign-in.",
            });
        }
    }

    private async _handleSignOut(): Promise<void> {
        this.setState({
            modulesBusy: true,
            modulesError: null,
            modulesNotice: null,
        });

        try {
            await signOut();
            this.setState({
                modulesBusy: false,
                modulesNotice: "Signed out.",
                myModules: [],
                subscribedModules: [],
            });
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not sign out.",
            });
        }
    }

    private async _handleRefreshModules(explicitUserIdOrEvent?: string | React.SyntheticEvent<any>): Promise<void> {
        const userId = typeof explicitUserIdOrEvent === "string"
            ? explicitUserIdOrEvent
            : this._getSessionUserId();
        if (!userId) {
            return;
        }

        this.setState({
            modulesBusy: true,
            modulesError: null,
        });

        try {
            const [myModules, subscribedModules] = await Promise.all([
                listOwnModules(userId),
                listSubscribedModules(userId),
            ]);
            this.setState((prev) => {
                const knownModules = [...myModules, ...subscribedModules];
                const refreshedActiveModule = prev.activeModule
                    ? knownModules.find((module) => module.id === prev.activeModule!.id) || prev.activeModule
                    : null;
                const subscribedScriptsVisibilityById = this._buildSubscribedScriptVisibility(
                    subscribedModules,
                    prev.subscribedScriptsVisibilityById
                );
                persistSubscribedScriptsVisibility(subscribedScriptsVisibilityById);

                return {
                    myModules,
                    subscribedModules,
                    subscribedScriptsVisibilityById,
                    activeModule: refreshedActiveModule,
                    modulesBusy: false,
                };
            });
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not load your modules.",
            });
        }
    }

    private _handleModuleLoad(module: ModuleRecord): void {
        this._loadModuleIntoApp(module, {
            notice: `Loaded module "${module.title}".`,
        });
    }

    private async _handleModuleSubscribe(module: ModuleRecord): Promise<void> {
        const userId = this._getSessionUserId();
        if (!userId) {
            this.setState({ modulesError: "Sign in before subscribing to a module." });
            return;
        }

        if (module.owner_id === userId) {
            this.setState({ modulesError: "You already own this module.", modulesNotice: null });
            return;
        }

        if (!isModuleLinkShareable(module.visibility)) {
            this.setState({
                modulesError: "Only public or unlisted modules can be subscribed to.",
                modulesNotice: null,
            });
            return;
        }

        if (this.state.subscribedModules.some((entry) => entry.id === module.id)) {
            this.setState({
                modulesNotice: `Already subscribed to "${module.title}".`,
                modulesError: null,
            });
            return;
        }

        this.setState({
            modulesBusy: true,
            modulesError: null,
            modulesNotice: null,
        });

        try {
            await subscribeToModule(module.id, userId);
            const [myModules, subscribedModules] = await Promise.all([
                listOwnModules(userId),
                listSubscribedModules(userId),
            ]);

            this.setState((prev) => {
                const knownModules = [...myModules, ...subscribedModules];
                const refreshedActiveModule = prev.activeModule
                    ? knownModules.find((entry) => entry.id === prev.activeModule!.id) || prev.activeModule
                    : null;
                const subscribedScriptsVisibilityById = this._buildSubscribedScriptVisibility(
                    subscribedModules,
                    prev.subscribedScriptsVisibilityById
                );
                persistSubscribedScriptsVisibility(subscribedScriptsVisibilityById);

                return {
                    myModules,
                    subscribedModules,
                    subscribedScriptsVisibilityById,
                    activeModule: refreshedActiveModule,
                    modulesBusy: false,
                    modulesNotice: `Subscribed to "${module.title}".`,
                    modulesError: null,
                };
            });
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not subscribe to the module.",
            });
        }
    }

    private async _handleModuleSave(payload: {
        title: string;
        summary: string;
        visibility: ModuleVisibility;
    }): Promise<void> {
        const userId = this._getSessionUserId();
        if (!userId) {
            this.setState({ modulesError: "Sign in before saving a module." });
            return;
        }

        this.setState({
            modulesBusy: true,
            modulesError: null,
            modulesNotice: null,
        });

        const ownedActiveModule = this.state.activeModule?.owner_id === userId
            ? this.state.activeModule
            : null;
        const cleanedScriptJson = this._sanitizeScriptJson(this.state.activeScript.json);

        try {
            const savedModule = await saveModule({
                id: ownedActiveModule?.id,
                ownerId: userId,
                title: payload.title,
                summary: payload.summary,
                visibility: payload.visibility,
                scriptJson: cleanedScriptJson,
            });

            const nextScript = this._buildModuleScript(savedModule, cleanedScriptJson);
            this.setState((prev): Pick<AppState,
                "activeScript"
                | "activeScriptRevision"
                | "activeTerminalScreenId"
                | "activeModule"
                | "myModules"
                | "creatorInitialScript"
                | "modulesBusy"
                | "modulesNotice"
            > => ({
                activeScript: nextScript,
                activeScriptRevision: prev.activeScriptRevision + 1,
                activeTerminalScreenId: null,
                activeModule: savedModule,
                myModules: this._upsertModuleRecord(prev.myModules, savedModule),
                creatorInitialScript: null,
                modulesBusy: false,
                modulesNotice: ownedActiveModule ? "Module updated." : "Module created.",
            }));

            if (isModuleLinkShareable(savedModule.visibility)) {
                this._setModuleQueryParam(savedModule.id);
            } else {
                this._setModuleQueryParam(null);
            }
        } catch (error: any) {
            this.setState({
                modulesBusy: false,
                modulesError: error?.message || "Could not save the module.",
            });
        }
    }

    private async _handleModuleCopyLink(module: ModuleRecord): Promise<void> {
        if (!isModuleLinkShareable(module.visibility)) {
            this.setState({ modulesError: "Only public or unlisted modules can be shared." });
            return;
        }

        const shareUrl = this._makeModuleShareUrl(module.id);
        try {
            await navigator.clipboard.writeText(shareUrl);
            this.setState({
                modulesNotice: "Share link copied to clipboard.",
                modulesError: null,
            });
        } catch {
            this.setState({
                modulesError: `Could not copy automatically. Share this URL manually: ${shareUrl}`,
            });
        }
    }

    public render(): ReactElement {
        const {
            activeScript,
            activeScriptRevision,
            customScripts,
            activeTheme,
            customTheme,
            customThemeEditorOpen,
            headerCompact,
            soundEnabled,
            scriptDropdownOpen,
            optionsDropdownOpen,
            mobileMenuOpen,
            creatorOpen,
            creatorInitialScript,
            modulesOpen,
            previewMode,
            uploadError,
            authSession,
            authLoading,
            modulesBusy,
            modulesError,
            modulesNotice,
            myModules,
            subscribedModules,
            subscribedScriptsVisibilityById,
            activeModule,
        } = this.state;
        const subscribedScripts = subscribedModules
            .filter((module) => subscribedScriptsVisibilityById[module.id] !== false)
            .map((module) => this._buildModuleScript(module));
        const availableScripts = (activeModule
            ? [activeScript, ...subscribedScripts, ...BUNDLED_SCRIPTS, ...customScripts]
            : [...subscribedScripts, ...BUNDLED_SCRIPTS, ...customScripts]
        ).filter((script, index, scripts) => {
            return scripts.findIndex((candidate) => candidate.id === script.id) === index;
        });

        return (
            <>
                <header
                    ref={this._headerRef}
                    className={"phosphor-header" + (headerCompact ? " phosphor-header--compact" : "")}
                >
                    <a
                        ref={this._titleRef}
                        className="phosphor-header__title"
                        href={getTerminalAppUrl()}
                        title="Return to the PHOSPHOR terminal"
                    >
                        {APP_TITLE}
                    </a>

                    <button
                        className="phosphor-header__btn phosphor-header__menu-btn"
                        onClick={this._handleMobileMenuToggle}
                        aria-haspopup="menu"
                        aria-expanded={mobileMenuOpen}
                        title="Toggle header controls"
                    >
                        [MENU {mobileMenuOpen ? "▲" : "▼"}]
                    </button>

                    <div
                        ref={this._controlsRef}
                        className={"phosphor-header__controls" + (mobileMenuOpen ? " phosphor-header__controls--open" : "")}
                    >
                        {uploadError && (
                            <span style={{ color: "var(--alert)", fontSize: "inherit" }}>
                                {uploadError}
                            </span>
                        )}

                        {!previewMode && (
                            <div className="phosphor-header__script-wrapper">
                                <button
                                    className="phosphor-header__btn"
                                    onClick={this._handleDropdownToggle}
                                    aria-haspopup="listbox"
                                    aria-expanded={scriptDropdownOpen}
                                >
                                    [SCRIPT: {activeScript.label} {scriptDropdownOpen ? "▲" : "▼"}]
                                </button>

                                {scriptDropdownOpen && (
                                    <div className="phosphor-header__dropdown" role="listbox">
                                        {availableScripts.map((script) => (
                                            <button
                                                key={script.id}
                                                role="option"
                                                aria-selected={script.id === activeScript.id}
                                                className={
                                                    "phosphor-header__dropdown-item" +
                                                    (script.id === activeScript.id ? " phosphor-header__dropdown-item--active" : "")
                                                }
                                                onClick={() => this._handleScriptSelect(script)}
                                            >
                                                {script.id === activeScript.id ? "► " : "  "}{script.label}
                                            </button>
                                        ))}

                                        <div className="phosphor-header__dropdown-item phosphor-header__dropdown-item--separator" />

                                        <label className="phosphor-header__dropdown-item">
                                            &nbsp;&nbsp;[UPLOAD JSON]
                                            <input
                                                type="file"
                                                accept=".json,application/json"
                                                style={{ display: "none" }}
                                                onChange={this._handleFileChange}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}

                        {previewMode && (
                            <>
                                <span>[PREVIEW MODE]</span>
                                <button
                                    className="phosphor-header__btn"
                                    onClick={this._handlePreviewReturn}
                                    title="Return to Script Creator"
                                >
                                    [RETURN TO CREATOR]
                                </button>
                            </>
                        )}

                        {!previewMode && (
                            <button
                                className="phosphor-header__btn"
                                onClick={this._handleCreatorOpen}
                                title="Open visual JSON script creator"
                            >
                                [CREATOR]
                            </button>
                        )}

                        {!previewMode && (
                            <a
                                className="phosphor-header__btn"
                                href={getModulesBrowserUrl()}
                                title="Browse library modules"
                            >
                                [LIBRARY]
                            </a>
                        )}

                        {!previewMode && (
                            <button
                                className="phosphor-header__btn"
                                onClick={this._handleModulesOpen}
                                title="Open module management"
                            >
                                [MODULES]
                            </button>
                        )}

                        <div className="phosphor-header__options-wrapper">
                            <button
                                className="phosphor-header__btn"
                                onClick={this._handleOptionsDropdownToggle}
                                aria-haspopup="menu"
                                aria-expanded={optionsDropdownOpen}
                                title="Theme, sound, and system options"
                            >
                                [OPTIONS {optionsDropdownOpen ? "▲" : "▼"}]
                            </button>

                            {optionsDropdownOpen && (
                                <div className="phosphor-header__dropdown phosphor-header__dropdown--options" role="menu">
                                    <button
                                        className="phosphor-header__dropdown-item"
                                        role="menuitem"
                                        onClick={this._handleSoundToggle}
                                        title="Toggle sound effects and ambient audio"
                                    >
                                        [SOUND:{soundEnabled ? "ON" : "OFF"}]
                                    </button>

                                    {!previewMode && (
                                        <button
                                            className="phosphor-header__dropdown-item"
                                            role="menuitem"
                                            onClick={this._handleReloadCurrentScript}
                                            title="Restart the current script from the beginning"
                                        >
                                            [RELOAD]
                                        </button>
                                    )}

                                    {!previewMode && (
                                        <button
                                            className="phosphor-header__dropdown-item"
                                            role="menuitem"
                                            onClick={this._handleClearData}
                                            title="Clear all saved data, including login, and reload"
                                        >
                                            [RESET]
                                        </button>
                                    )}

                                    <div className="phosphor-header__dropdown-item phosphor-header__dropdown-item--separator" />

                                    <div className="phosphor-header__dropdown-label">[THEME]</div>
                                    {THEMES.map((theme) => (
                                        <button
                                            key={theme.id}
                                            role="menuitemradio"
                                            aria-checked={theme.id === activeTheme.id}
                                            className={
                                                "phosphor-header__dropdown-item" +
                                                (theme.id === activeTheme.id ? " phosphor-header__dropdown-item--active" : "")
                                            }
                                            onClick={() => this._handleThemeSelect(theme.id)}
                                        >
                                            {theme.id === activeTheme.id ? "► " : "  "}{theme.name}
                                        </button>
                                    ))}

                                    <button
                                        role="menuitemradio"
                                        aria-checked={activeTheme.id === "custom"}
                                        className={
                                            "phosphor-header__dropdown-item" +
                                            (activeTheme.id === "custom" ? " phosphor-header__dropdown-item--active" : "")
                                        }
                                        onClick={() => {
                                            if (activeTheme.id !== "custom") {
                                                this._handleThemeSelect("custom");
                                                return;
                                            }
                                            this._handleCustomThemeEditorToggle();
                                        }}
                                    >
                                        {activeTheme.id === "custom" ? "► " : "  "}
                                        CUSTOM {activeTheme.id === "custom" ? (customThemeEditorOpen ? "▲" : "▼") : ""}
                                    </button>

                                    {activeTheme.id === "custom" && customThemeEditorOpen && (
                                        <div className="phosphor-header__theme-custom">
                                            <label className="phosphor-header__theme-color-field">
                                                <span>FG</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom foreground color"
                                                    value={customTheme.fgHex}
                                                    onChange={(e) => this._handleThemeColorChange("fgHex", e.target.value)}
                                                />
                                            </label>
                                            <label className="phosphor-header__theme-color-field">
                                                <span>ALERT</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom alert color"
                                                    value={customTheme.alertHex}
                                                    onChange={(e) => this._handleThemeColorChange("alertHex", e.target.value)}
                                                />
                                            </label>
                                            <label className="phosphor-header__theme-color-field">
                                                <span>EMPHASIS</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom emphasis color"
                                                    value={customTheme.emphasisHex}
                                                    onChange={(e) => this._handleThemeColorChange("emphasisHex", e.target.value)}
                                                />
                                            </label>
                                            <label className="phosphor-header__theme-color-field">
                                                <span>NOTICE</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom notice color"
                                                    value={customTheme.noticeHex}
                                                    onChange={(e) => this._handleThemeColorChange("noticeHex", e.target.value)}
                                                />
                                            </label>
                                            <label className="phosphor-header__theme-color-field">
                                                <span>HYPERLINK</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom hyperlink color"
                                                    value={customTheme.hyperlinkHex}
                                                    onChange={(e) => this._handleThemeColorChange("hyperlinkHex", e.target.value)}
                                                />
                                            </label>
                                            <label className="phosphor-header__theme-color-field">
                                                <span>SYSTEM</span>
                                                <input
                                                    type="color"
                                                    aria-label="Custom system color"
                                                    value={customTheme.systemHex}
                                                    onChange={(e) => this._handleThemeColorChange("systemHex", e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {!previewMode && (
                            <a
                                className="phosphor-header__btn"
                                href="https://ko-fi.com/ethandunning"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                [DONATE]
                            </a>
                        )}

                        {!previewMode && (
                            <a
                                className="phosphor-header__btn"
                                href="https://github.com/EthanDunning/phosphor"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                [GITHUB]
                            </a>
                        )}
                    </div>
                </header>

                <Phosphor
                    key={`${activeScript.id}:${activeScriptRevision}`}
                    json={activeScript.json}
                    defaultTextSpeed={this._getScriptDefaultTextSpeed(activeScript.json)}
                    soundEnabled={soundEnabled}
                    onScreenChanged={this._handlePhosphorScreenChanged}
                />

                {creatorOpen && (
                    <ScriptCreator
                        initialScript={creatorInitialScript || activeScript.json}
                        onApply={this._handleCreatorApply}
                        onPreview={this._handleCreatorPreview}
                        onClose={this._handleCreatorClose}
                    />
                )}

                <ModulesPanel
                    open={modulesOpen}
                    supabaseReady={isSupabaseConfigured()}
                    authLoading={authLoading}
                    busy={modulesBusy}
                    sessionUserId={authSession?.user?.id || null}
                    sessionEmail={authSession?.user?.email || null}
                    currentScript={activeScript.json}
                    currentScriptLabel={activeScript.label}
                    activeModule={activeModule}
                    myModules={myModules}
                    subscribedModules={subscribedModules}
                    subscribedScriptsVisibilityById={subscribedScriptsVisibilityById}
                    errorMessage={modulesError}
                    noticeMessage={modulesNotice}
                    libraryUrl={getModulesBrowserUrl()}
                    onClose={this._handleModulesClose}
                    onDismissError={this._handleModulesDismissError}
                    onDismissNotice={this._handleModulesDismissNotice}
                    onSignIn={this._handleGoogleSignIn}
                    onSignOut={this._handleSignOut}
                    onRefresh={this._handleRefreshModules}
                    onLoadModule={this._handleModuleLoad}
                    onSubscribeToModule={this._handleModuleSubscribe}
                    onSaveModule={this._handleModuleSave}
                    onCopyShareLink={this._handleModuleCopyLink}
                    onToggleSubscribedScriptVisibility={this._handleToggleSubscribedScriptVisibility}
                />
            </>
        );
    }
}

export default App;
