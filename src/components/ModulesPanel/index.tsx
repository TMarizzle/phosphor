import React, { FC, useEffect, useMemo, useState } from "react";
import CreatorSelect, { CreatorSelectOption } from "../CreatorSelect";
import { isModuleLinkShareable } from "../../lib/modules";
import type { ModuleRecord, ModuleVisibility } from "../../lib/modules";
import "./style.scss";

interface ModulesPanelProps {
    open: boolean;
    supabaseReady: boolean;
    authLoading: boolean;
    busy: boolean;
    sessionUserId: string | null;
    sessionEmail: string | null;
    currentScript: any;
    currentScriptLabel: string;
    activeModule: ModuleRecord | null;
    myModules: ModuleRecord[];
    errorMessage: string | null;
    noticeMessage: string | null;
    libraryUrl: string;
    onClose: () => void;
    onSignIn: () => void;
    onSignOut: () => void;
    onRefresh: () => void;
    onLoadModule: (module: ModuleRecord) => void;
    onSaveModule: (payload: {
        title: string;
        summary: string;
        visibility: ModuleVisibility;
    }) => void;
    onCopyShareLink: (module: ModuleRecord) => void;
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
    authLoading,
    busy,
    sessionUserId,
    sessionEmail,
    currentScript,
    currentScriptLabel,
    activeModule,
    myModules,
    errorMessage,
    noticeMessage,
    libraryUrl,
    onClose,
    onSignIn,
    onSignOut,
    onRefresh,
    onLoadModule,
    onSaveModule,
    onCopyShareLink,
}) => {
    const [title, setTitle] = useState<string>("");
    const [summary, setSummary] = useState<string>("");
    const [visibility, setVisibility] = useState<ModuleVisibility>("private");

    const currentScriptName = useMemo(() => {
        const configName = currentScript?.config?.name;
        if (typeof configName === "string" && configName.trim().length) {
            return configName.trim();
        }
        return currentScriptLabel || "Untitled script";
    }, [currentScript, currentScriptLabel]);

    const activeModuleIsOwned = !!activeModule && !!sessionUserId && activeModule.owner_id === sessionUserId;

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
                        <p>Save scripts to Supabase, set visibility, and jump into the library when you want to browse.</p>
                    </div>
                    <div className="modules-panel__header-actions">
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
                        {errorMessage}
                    </div>
                )}

                {noticeMessage && (
                    <div className="modules-panel__notice modules-panel__notice--success">
                        {noticeMessage}
                    </div>
                )}

                <div className="modules-panel__grid">
                    <section className="modules-panel__section">
                        <h3>Account</h3>

                        {authLoading && <p>Checking session...</p>}

                        {!authLoading && !sessionEmail && (
                            <>
                                <p>Sign in with Google to save private modules and publish public ones.</p>
                                <p className="modules-panel__muted">Use unlisted for link-only sharing without showing in the library.</p>
                                <button
                                    className="modules-panel__button"
                                    onClick={onSignIn}
                                    disabled={!supabaseReady || busy}
                                >
                                    Sign In With Google
                                </button>
                            </>
                        )}

                        {!authLoading && sessionEmail && (
                            <>
                                <p>Signed in as <strong>{sessionEmail}</strong>.</p>
                                <div className="modules-panel__actions">
                                    <button
                                        className="modules-panel__button"
                                        onClick={onRefresh}
                                        disabled={busy}
                                    >
                                        Refresh Modules
                                    </button>
                                    <button
                                        className="modules-panel__button modules-panel__button--ghost"
                                        onClick={onSignOut}
                                        disabled={busy}
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            </>
                        )}
                    </section>

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
                    </section>

                    <section className="modules-panel__section modules-panel__section--wide">
                        <h3>{activeModuleIsOwned ? "Update Active Module" : "Create Module"}</h3>

                        <label className="modules-panel__field">
                            <span>Title</span>
                            <input
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                maxLength={120}
                                placeholder="Module title"
                            />
                        </label>

                        <label className="modules-panel__field">
                            <span>Summary</span>
                            <textarea
                                value={summary}
                                onChange={(event) => setSummary(event.target.value)}
                                maxLength={2000}
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
                                onClick={() => onSaveModule({
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

                    <section className="modules-panel__section modules-panel__section--wide">
                        <h3>My Modules</h3>

                        {!sessionUserId && (
                            <p className="modules-panel__muted">Sign in to see your saved modules.</p>
                        )}

                        {!!sessionUserId && !myModules.length && (
                            <p className="modules-panel__muted">No modules saved yet.</p>
                        )}

                        {!!sessionUserId && !!myModules.length && (
                            <div className="modules-panel__list">
                                {myModules.map((module) => {
                                    const isActive = activeModule?.id === module.id;
                                    return (
                                        <article
                                            key={module.id}
                                            className={"modules-panel__list-item" + (isActive ? " modules-panel__list-item--active" : "")}
                                        >
                                            <div className="modules-panel__list-main">
                                                <strong>{module.title}</strong>
                                                <span className="modules-panel__pill">{module.visibility}</span>
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
                        )}

                        <p className="modules-panel__muted">
                            Public modules you subscribe to will also appear in the main script dropdown.
                        </p>
                    </section>
                </div>
            </div>
        </section>
    );
};

export default ModulesPanel;
