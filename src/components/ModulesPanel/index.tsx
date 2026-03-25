import React, { FC, useEffect, useMemo, useState } from "react";
import CreatorSelect, { CreatorSelectOption } from "../CreatorSelect";
import { isModuleLinkShareable, MAX_MODULE_SUMMARY_LENGTH, MAX_MODULE_TITLE_LENGTH } from "../../lib/modules";
import type { ModuleRecord, ModuleVisibility } from "../../lib/modules";
import "./style.scss";

interface ModulesPanelProps {
    open: boolean;
    supabaseReady: boolean;
    busy: boolean;
    sessionUserId: string | null;
    currentScript: any;
    currentScriptLabel: string;
    activeModule: ModuleRecord | null;
    myModules: ModuleRecord[];
    ownScriptsVisibilityById: Record<string, boolean>;
    subscribedModules: ModuleRecord[];
    subscribedScriptsVisibilityById: Record<string, boolean>;
    errorMessage: string | null;
    noticeMessage: string | null;
    libraryUrl: string;
    onClose: () => void;
    onDismissError: () => void;
    onDismissNotice: () => void;
    onRefresh: () => void;
    onLoadModule: (module: ModuleRecord) => void;
    onToggleOwnScriptVisibility: (moduleId: string) => void;
    onSubscribeToModule: (module: ModuleRecord) => void;
    onSaveModule: (payload: {
        title: string;
        summary: string;
        visibility: ModuleVisibility;
    }) => Promise<boolean> | void;
    onCopyShareLink: (module: ModuleRecord) => void;
    onToggleSubscribedScriptVisibility: (moduleId: string) => void;
}

const toLocalTimestamp = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
};

const VISIBILITY_OPTIONS: CreatorSelectOption[] = [
    { value: "private", label: "Private" },
    { value: "unlisted", label: "Unlisted" },
    { value: "public", label: "Public" },
];

const ModulesPanel: FC<ModulesPanelProps> = ({
    open,
    supabaseReady,
    busy,
    sessionUserId,
    currentScript,
    currentScriptLabel,
    activeModule,
    myModules,
    ownScriptsVisibilityById,
    subscribedModules,
    subscribedScriptsVisibilityById,
    errorMessage,
    noticeMessage,
    libraryUrl,
    onClose,
    onDismissError,
    onDismissNotice,
    onRefresh,
    onLoadModule,
    onToggleOwnScriptVisibility,
    onSubscribeToModule,
    onSaveModule,
    onCopyShareLink,
    onToggleSubscribedScriptVisibility,
}) => {
    const [title, setTitle] = useState<string>("");
    const [summary, setSummary] = useState<string>("");
    const [visibility, setVisibility] = useState<ModuleVisibility>("private");
    const [composerOpen, setComposerOpen] = useState<boolean>(false);

    const currentScriptName = useMemo(() => {
        const configName = currentScript?.config?.name;
        if (typeof configName === "string" && configName.trim().length) {
            return configName.trim();
        }
        return currentScriptLabel || "Untitled script";
    }, [currentScript, currentScriptLabel]);

    const activeModuleIsOwned = !!activeModule && !!sessionUserId && activeModule.owner_id === sessionUserId;
    const activeModuleIsSubscribed = !!activeModule && subscribedModules.some((module) => module.id === activeModule.id);
    const getLibraryModuleUrl = (moduleId: string): string => {
        try {
            const url = new URL(libraryUrl);
            url.searchParams.set("module", moduleId);
            return url.toString();
        } catch {
            const joiner = libraryUrl.includes("?") ? "&" : "?";
            return `${libraryUrl}${joiner}module=${encodeURIComponent(moduleId)}`;
        }
    };
    const visibleSubscribedCount = useMemo(() => {
        return subscribedModules.reduce((count, module) => {
            return count + (subscribedScriptsVisibilityById[module.id] === false ? 0 : 1);
        }, 0);
    }, [subscribedModules, subscribedScriptsVisibilityById]);
    const visibleOwnCount = useMemo(() => {
        return myModules.reduce((count, module) => {
            return count + (ownScriptsVisibilityById[module.id] === false ? 0 : 1);
        }, 0);
    }, [myModules, ownScriptsVisibilityById]);

    useEffect(() => {
        if (activeModule) {
            setTitle(activeModule.title);
            setSummary(activeModule.summary || "");
            setVisibility(activeModule.visibility);
            return;
        }

        setTitle(currentScriptName);
        setSummary("");
        setVisibility("private");
    }, [activeModule, currentScriptName]);

    useEffect(() => {
        if (!open) {
            setComposerOpen(false);
            return;
        }

        if (activeModuleIsOwned) {
            setComposerOpen(true);
        }
    }, [activeModuleIsOwned, open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    return (
        <section className="modules-panel" onClick={onClose}>
            <div
                className="modules-panel__dialog"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modules-panel__header">
                    <div>
                        <h2>My Modules</h2>
                        <p>Manage your modules and subscribed modules, then control what shows in the script dropdown.</p>
                    </div>
                    <div className="modules-panel__header-actions">
                        {!!sessionUserId && (
                            <button
                                className="modules-panel__button modules-panel__button--ghost"
                                onClick={onRefresh}
                                disabled={busy}
                            >
                                Refresh
                            </button>
                        )}
                        <button
                            className="modules-panel__button"
                            onClick={() => setComposerOpen((prev) => !prev)}
                            disabled={!sessionUserId || busy}
                        >
                            {composerOpen ? "Hide Add Module" : "Add New Module"}
                        </button>
                        <a className="modules-panel__button modules-panel__button--ghost" href={libraryUrl}>
                            Library
                        </a>
                        <button className="modules-panel__button modules-panel__button--ghost" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>

                {!supabaseReady && (
                    <div className="modules-panel__notice modules-panel__notice--error">
                        Supabase is not configured in this environment. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` locally.
                    </div>
                )}

                {errorMessage && (
                    <div className="modules-panel__notice modules-panel__notice--error">
                        <span>{errorMessage}</span>
                        <button
                            type="button"
                            className="modules-panel__notice-dismiss"
                            onClick={onDismissError}
                            aria-label="Dismiss error message"
                            title="Dismiss"
                        >
                            X
                        </button>
                    </div>
                )}

                {noticeMessage && (
                    <div className="modules-panel__notice modules-panel__notice--success">
                        <span>{noticeMessage}</span>
                        <button
                            type="button"
                            className="modules-panel__notice-dismiss"
                            onClick={onDismissNotice}
                            aria-label="Dismiss notice"
                            title="Dismiss"
                        >
                            X
                        </button>
                    </div>
                )}

                <div className="modules-panel__body">
                    <div className="modules-panel__grid">
                        <section className="modules-panel__section">
                            <h3>Current Script</h3>
                            <p><strong>{currentScriptName}</strong></p>

                            {activeModule && (
                                <p>
                                    Active module: <strong>{activeModule.title}</strong>{" "}
                                    <span className="modules-panel__muted">
                                        ({activeModule.visibility})
                                    </span>
                                </p>
                            )}

                            {!activeModule && (
                                <p className="modules-panel__muted">
                                    This script is local right now. Saving will create a new module.
                                </p>
                            )}

                            {activeModule && !activeModuleIsOwned && (
                                <p className="modules-panel__muted">
                                    This module is not yours. Saving will create a copy in your account.
                                </p>
                            )}

                            {!!activeModule && !activeModuleIsOwned && (
                                <div className="modules-panel__actions">
                                    <button
                                        className="modules-panel__button"
                                        onClick={() => onSubscribeToModule(activeModule)}
                                        disabled={!sessionUserId || busy || activeModuleIsSubscribed}
                                    >
                                        {activeModuleIsSubscribed ? "Subscribed" : "Subscribe"}
                                    </button>
                                </div>
                            )}
                        </section>

                        {composerOpen && (
                            <section className="modules-panel__section modules-panel__section--wide">
                                <h3>{activeModuleIsOwned ? "Update Active Module" : "Create Module"}</h3>

                                <label className="modules-panel__field">
                                    <span>Title</span>
                                    <input
                                        value={title}
                                        onChange={(event) => setTitle(event.target.value)}
                                        maxLength={MAX_MODULE_TITLE_LENGTH}
                                        placeholder="Module title"
                                    />
                                </label>

                                <label className="modules-panel__field">
                                    <span>Summary</span>
                                    <textarea
                                        value={summary}
                                        onChange={(event) => setSummary(event.target.value)}
                                        maxLength={MAX_MODULE_SUMMARY_LENGTH}
                                        rows={3}
                                        placeholder="Short summary for the module listing"
                                    />
                                </label>

                                <label className="modules-panel__field">
                                    <span>Visibility</span>
                                    <CreatorSelect
                                        value={visibility}
                                        options={VISIBILITY_OPTIONS}
                                        onChange={(nextValue) => setVisibility(nextValue as ModuleVisibility)}
                                        fallbackLabel={visibility}
                                    />
                                </label>

                                <div className="modules-panel__actions">
                                    <button
                                        className="modules-panel__button"
                                        disabled={!sessionUserId || busy || !supabaseReady || !title.trim().length}
                                        onClick={() => void onSaveModule({
                                            title: title.trim(),
                                            summary: summary.trim(),
                                            visibility,
                                        })}
                                    >
                                        {activeModuleIsOwned ? "Save Changes" : "Create Module"}
                                    </button>

                                    {activeModule && isModuleLinkShareable(activeModule.visibility) && (
                                        <button
                                            className="modules-panel__button modules-panel__button--ghost"
                                            onClick={() => onCopyShareLink(activeModule)}
                                            disabled={busy}
                                        >
                                            Copy Share Link
                                        </button>
                                    )}
                                </div>
                            </section>
                        )}

                        <section className="modules-panel__section modules-panel__section--wide">
                            <h3>My Modules</h3>

                            {!sessionUserId && (
                                <p className="modules-panel__muted">Sign in to see your saved modules.</p>
                            )}

                            {!!sessionUserId && !myModules.length && (
                                <p className="modules-panel__muted">No modules saved yet.</p>
                            )}

                            {!!sessionUserId && !!myModules.length && (
                                <>
                                    <p className="modules-panel__muted">
                                        {visibleOwnCount} of {myModules.length} own modules are shown in the script dropdown.
                                    </p>
                                    <div className="modules-panel__list">
                                        {myModules.map((module) => {
                                            const isActive = activeModule?.id === module.id;
                                            const showInScripts = ownScriptsVisibilityById[module.id] !== false;
                                            return (
                                                <article
                                                    key={module.id}
                                                    className={"modules-panel__list-item" + (isActive ? " modules-panel__list-item--active" : "")}
                                                >
                                                    <div className="modules-panel__list-main">
                                                        <strong>{module.title}</strong>
                                                        <span className="modules-panel__pill">{module.visibility}</span>
                                                        <span className="modules-panel__pill">
                                                            {showInScripts ? "Scripts: On" : "Scripts: Off"}
                                                        </span>
                                                        <p>{module.summary || "No summary provided."}</p>
                                                        <small className="modules-panel__muted">
                                                            Updated {toLocalTimestamp(module.updated_at)}
                                                        </small>
                                                    </div>

                                                    <div className="modules-panel__actions">
                                                        <button
                                                            className="modules-panel__button"
                                                            onClick={() => onLoadModule(module)}
                                                            disabled={busy}
                                                        >
                                                            Load
                                                        </button>
                                                        <a
                                                            className="modules-panel__button modules-panel__button--ghost"
                                                            href={getLibraryModuleUrl(module.id)}
                                                        >
                                                            View In Library
                                                        </a>
                                                        <label className="modules-panel__toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={showInScripts}
                                                                onChange={() => onToggleOwnScriptVisibility(module.id)}
                                                                disabled={busy}
                                                            />
                                                            <span>Show in SCRIPT</span>
                                                        </label>

                                                        {isModuleLinkShareable(module.visibility) && (
                                                            <button
                                                                className="modules-panel__button modules-panel__button--ghost"
                                                                onClick={() => onCopyShareLink(module)}
                                                                disabled={busy}
                                                            >
                                                                Copy Link
                                                            </button>
                                                        )}
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </section>

                        <section className="modules-panel__section modules-panel__section--wide">
                            <h3>Subscribed Modules</h3>

                            {!sessionUserId && (
                                <p className="modules-panel__muted">Sign in to see your subscribed modules.</p>
                            )}

                            {!!sessionUserId && !subscribedModules.length && (
                                <p className="modules-panel__muted">No subscriptions yet.</p>
                            )}

                            {!!sessionUserId && !!subscribedModules.length && (
                                <>
                                    <p className="modules-panel__muted">
                                        {visibleSubscribedCount} of {subscribedModules.length} subscribed modules are shown in the script dropdown.
                                    </p>
                                    <div className="modules-panel__list">
                                        {subscribedModules.map((module) => {
                                            const isActive = activeModule?.id === module.id;
                                            const showInScripts = subscribedScriptsVisibilityById[module.id] !== false;
                                            return (
                                                <article
                                                    key={module.id}
                                                    className={"modules-panel__list-item" + (isActive ? " modules-panel__list-item--active" : "")}
                                                >
                                                    <div className="modules-panel__list-main">
                                                        <strong>{module.title}</strong>
                                                        <span className="modules-panel__pill">{module.visibility}</span>
                                                        <span className="modules-panel__pill">
                                                            {showInScripts ? "Scripts: On" : "Scripts: Off"}
                                                        </span>
                                                        <p>{module.summary || "No summary provided."}</p>
                                                        <small className="modules-panel__muted">
                                                            Updated {toLocalTimestamp(module.updated_at)}
                                                        </small>
                                                    </div>

                                                    <div className="modules-panel__actions">
                                                        <button
                                                            className="modules-panel__button"
                                                            onClick={() => onLoadModule(module)}
                                                            disabled={busy}
                                                        >
                                                            Load
                                                        </button>
                                                        <a
                                                            className="modules-panel__button modules-panel__button--ghost"
                                                            href={getLibraryModuleUrl(module.id)}
                                                        >
                                                            View In Library
                                                        </a>
                                                        <label className="modules-panel__toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={showInScripts}
                                                                onChange={() => onToggleSubscribedScriptVisibility(module.id)}
                                                                disabled={busy}
                                                            />
                                                            <span>Show in SCRIPT</span>
                                                        </label>
                                                        {isModuleLinkShareable(module.visibility) && (
                                                            <button
                                                                className="modules-panel__button modules-panel__button--ghost"
                                                                onClick={() => onCopyShareLink(module)}
                                                                disabled={busy}
                                                            >
                                                                Copy Link
                                                            </button>
                                                        )}
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ModulesPanel;
