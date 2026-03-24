import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import CreatorSelect, { CreatorSelectOption } from "../CreatorSelect";
import {
    AdminLibraryVisibilityFilter,
    deleteModule,
    ModuleRecord,
    ModuleSort,
    ModuleVisibility,
    ProfileRole,
    fetchAccessibleModuleById,
    getCurrentSession,
    getProfileRole,
    isModuleLinkShareable,
    isSupabaseConfigured,
    listOwnModules,
    listUserRatings,
    listUserSubscriptions,
    onAuthStateChange,
    rateModule,
    searchDiscoverableModules,
    signInWithGoogle,
    signOut,
    subscribeToModule,
    unsubscribeFromModule,
    updateModuleMetadata,
} from "../../lib/modules";
import {
    ModulesBrowserFontMode,
    ModulesBrowserViewMode,
    loadPersistedModulesBrowserFontMode,
    loadPersistedModulesBrowserViewMode,
    loadPersistedSoundEnabled,
    persistModulesBrowserFontMode,
    persistModulesBrowserViewMode,
    persistSoundEnabled,
} from "../../lib/preferences";
import { APP_TITLE } from "../../lib/branding";
import { getModulesBrowserUrl, getTerminalAppUrl, isLegacyModulesBrowserPath } from "../../lib/routes";
import {
    THEMES,
    Theme,
    CustomThemeConfig,
    createCustomTheme,
    applyTheme,
    loadPersistedCustomTheme,
    loadPersistedTheme,
    persistCustomTheme,
    persistTheme,
} from "../../themes";
import "./style.scss";

const SORT_OPTIONS: CreatorSelectOption[] = [
    { value: "newest", label: "Newest" },
    { value: "top-rated", label: "Top Rated" },
    { value: "most-subscribed", label: "Most Subscribed" },
];

const RATING_VALUES = [1, 2, 3, 4, 5];
const BROWSER_VIEW_OPTIONS: Array<{ value: ModulesBrowserViewMode; label: string }> = [
    { value: "retro", label: "Retro View" },
    { value: "web", label: "Web View" },
];
const BROWSER_FONT_OPTIONS: Array<{ value: ModulesBrowserFontMode; label: string }> = [
    { value: "retro", label: "VGA Font" },
    { value: "normal", label: "Normal Font" },
];
const TRANSIENT_AUTH_PARAMS = [
    "code",
    "state",
    "error",
    "error_code",
    "error_description",
    "provider_token",
    "provider_refresh_token",
] as const;
const OWNER_MENU_WIDTH = 224;
const OWNER_MENU_HEIGHT = 188;
const SHARE_MENU_WIDTH = 224;
const SHARE_MENU_HEIGHT = 90;
const MAX_AUTHOR_LENGTH = 25;
const MAX_RATING = 5;

const getModulesBrowserUrlWithTransientAuthParams = (
    params?: Record<string, string | null | undefined>
): string => {
    const nextUrl = new URL(getModulesBrowserUrl(params));

    try {
        const currentUrl = new URL(window.location.href);
        TRANSIENT_AUTH_PARAMS.forEach((param) => {
            const value = currentUrl.searchParams.get(param);
            if (value) {
                nextUrl.searchParams.set(param, value);
            }
        });
    } catch {
        // ignore invalid URLs
    }

    return nextUrl.toString();
};

const clearTransientAuthParams = (): void => {
    try {
        const url = new URL(window.location.href);
        let changed = false;
        TRANSIENT_AUTH_PARAMS.forEach((param) => {
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
};

const parseInitialSort = (): ModuleSort => {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("sort");
        if (raw === "top-rated" || raw === "most-subscribed" || raw === "newest") {
            return raw;
        }
    } catch {
        // ignore invalid URLs
    }

    return "newest";
};

const parseInitialSearch = (): string => {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("q") || "";
    } catch {
        return "";
    }
};

const parseInitialModuleId = (): string | null => {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("module") || null;
    } catch {
        return null;
    }
};

const parseInitialSubscribedOnly = (): boolean => {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("subscribed") === "1";
    } catch {
        return false;
    }
};

const formatTimestamp = (value: string | null): string => {
    if (!value) {
        return "unknown";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const getModuleAuthor = (module: ModuleRecord): string => {
    const author = module?.script_json?.config?.author;
    if (typeof author === "string" && author.trim().length) {
        const normalizedAuthor = author.trim();
        if (normalizedAuthor.length <= MAX_AUTHOR_LENGTH) {
            return normalizedAuthor;
        }

        return `${normalizedAuthor.slice(0, MAX_AUTHOR_LENGTH - 3)}...`;
    }

    return "Unknown author";
};

const getModuleRatingAscii = (ratingAverage: number): string => {
    const normalizedRating = Number.isFinite(ratingAverage)
        ? Math.max(0, Math.min(MAX_RATING, ratingAverage))
        : 0;
    const filledSlots = Math.round(normalizedRating);
    return `[${"*".repeat(filledSlots)}${"-".repeat(MAX_RATING - filledSlots)}]`;
};

const getModuleRatingTitle = (ratingAverage: number): string => {
    const normalizedRating = Number.isFinite(ratingAverage)
        ? Math.max(0, Math.min(MAX_RATING, ratingAverage))
        : 0;
    return `Rating ${normalizedRating.toFixed(1)} / ${MAX_RATING}`;
};

const getModuleRatingNumeric = (ratingAverage: number): string => {
    const normalizedRating = Number.isFinite(ratingAverage)
        ? Math.max(0, Math.min(MAX_RATING, ratingAverage))
        : 0;
    return normalizedRating.toFixed(1);
};

const ModulesBrowser: FC = () => {
    const supabaseReady = isSupabaseConfigured();
    const initialSelectedModuleId = useMemo(() => parseInitialModuleId(), []);
    const [activeTheme, setActiveTheme] = useState<Theme>(() => loadPersistedTheme());
    const [customTheme, setCustomTheme] = useState<CustomThemeConfig>(() => loadPersistedCustomTheme());
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => loadPersistedSoundEnabled());
    const [viewMode, setViewMode] = useState<ModulesBrowserViewMode>(() => loadPersistedModulesBrowserViewMode());
    const [fontMode, setFontMode] = useState<ModulesBrowserFontMode>(() => loadPersistedModulesBrowserFontMode());
    const [session, setSession] = useState<Session | null>(null);
    const [authLoading, setAuthLoading] = useState<boolean>(supabaseReady);
    const [catalogLoading, setCatalogLoading] = useState<boolean>(supabaseReady);
    const [actionModuleId, setActionModuleId] = useState<string | null>(null);
    const [query, setQuery] = useState<string>(parseInitialSearch);
    const [sort, setSort] = useState<ModuleSort>(parseInitialSort);
    const [subscribedOnly, setSubscribedOnly] = useState<boolean>(parseInitialSubscribedOnly);
    const [sessionRole, setSessionRole] = useState<ProfileRole>("user");
    const [adminVisibilityFilter, setAdminVisibilityFilter] = useState<AdminLibraryVisibilityFilter>("all");
    const [modules, setModules] = useState<ModuleRecord[]>([]);
    const [selectedModuleId, setSelectedModuleId] = useState<string | null>(initialSelectedModuleId);
    const [subscribedIds, setSubscribedIds] = useState<string[]>([]);
    const [createdModuleCount, setCreatedModuleCount] = useState<number>(0);
    const [ratingsByModuleId, setRatingsByModuleId] = useState<Record<string, number>>({});
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
    const [profileOpen, setProfileOpen] = useState<boolean>(false);
    const [optionsDropdownOpen, setOptionsDropdownOpen] = useState<boolean>(false);
    const [customThemeEditorOpen, setCustomThemeEditorOpen] = useState<boolean>(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
    const [ownerMenuOpen, setOwnerMenuOpen] = useState<boolean>(false);
    const [ownerMenuPosition, setOwnerMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const [shareMenuOpen, setShareMenuOpen] = useState<boolean>(false);
    const [shareMenuPosition, setShareMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState<string>("");
    const [editSummary, setEditSummary] = useState<string>("");

    const sessionUserId = session?.user?.id || null;
    const sessionEmail = session?.user?.email || null;
    const isAdmin = !!sessionUserId && sessionRole === "admin";
    const subscribedIdSet = useMemo(() => new Set(subscribedIds), [subscribedIds]);
    const selectedModule = useMemo(() => {
        if (!modules.length) {
            return null;
        }

        return modules.find((module) => module.id === selectedModuleId) || modules[0];
    }, [modules, selectedModuleId]);
    const browserClassName = useMemo(() => {
        return [
            "modules-browser",
            viewMode === "web" ? "modules-browser--web-view" : "",
            fontMode === "normal" ? "modules-browser--font-normal" : "",
        ].filter(Boolean).join(" ");
    }, [fontMode, viewMode]);
    const headerRef = useRef<HTMLElement | null>(null);
    const profileRef = useRef<HTMLDivElement | null>(null);
    const optionsRef = useRef<HTMLDivElement | null>(null);
    const ownerMenuRef = useRef<HTMLDivElement | null>(null);
    const ownerMenuDropdownRef = useRef<HTMLDivElement | null>(null);
    const shareMenuRef = useRef<HTMLDivElement | null>(null);
    const shareMenuDropdownRef = useRef<HTMLDivElement | null>(null);
    const initialRequestedModuleIdRef = useRef<string | null>(initialSelectedModuleId);

    const updateOwnerMenuPosition = useCallback(() => {
        const anchor = ownerMenuRef.current;
        if (!anchor) {
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const nextLeft = Math.max(
            8,
            Math.min(rect.right - OWNER_MENU_WIDTH, window.innerWidth - OWNER_MENU_WIDTH - 8)
        );
        const nextTop = rect.bottom + 4 + OWNER_MENU_HEIGHT > window.innerHeight - 8
            ? Math.max(8, rect.top - OWNER_MENU_HEIGHT - 4)
            : rect.bottom + 4;

        setOwnerMenuPosition({
            top: nextTop,
            left: nextLeft,
        });
    }, []);

    const updateShareMenuPosition = useCallback(() => {
        const anchor = shareMenuRef.current;
        if (!anchor) {
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const nextLeft = Math.max(
            8,
            Math.min(rect.right - SHARE_MENU_WIDTH, window.innerWidth - SHARE_MENU_WIDTH - 8)
        );
        const nextTop = rect.bottom + 4 + SHARE_MENU_HEIGHT > window.innerHeight - 8
            ? Math.max(8, rect.top - SHARE_MENU_HEIGHT - 4)
            : rect.bottom + 4;

        setShareMenuPosition({
            top: nextTop,
            left: nextLeft,
        });
    }, []);

    const persistBrowserQuery = useCallback((
        nextQuery: string,
        nextSort: ModuleSort,
        nextSubscribedOnly: boolean
    ) => {
        const params: Record<string, string | undefined> = {
            q: nextQuery.trim() || undefined,
            sort: nextSort !== "newest" ? nextSort : undefined,
            subscribed: nextSubscribedOnly ? "1" : undefined,
        };
        window.history.replaceState({}, "", getModulesBrowserUrlWithTransientAuthParams(params));
    }, []);

    const loadPersonalState = useCallback(async (userId: string) => {
        const [nextSubscribedIds, nextRatingsByModuleId, ownModules, role] = await Promise.all([
            listUserSubscriptions(userId),
            listUserRatings(userId),
            listOwnModules(userId),
            getProfileRole(userId),
        ]);

        setSubscribedIds(nextSubscribedIds);
        setRatingsByModuleId(nextRatingsByModuleId);
        setCreatedModuleCount(ownModules.length);
        setSessionRole(role);

        return {
            subscribedIds: nextSubscribedIds,
            ratingsByModuleId: nextRatingsByModuleId,
            createdModuleCount: ownModules.length,
            role,
        };
    }, []);

    const refreshCatalog = useCallback(async (
        currentUserId?: string | null,
        currentSubscribedIds?: string[],
        currentRole: ProfileRole = "user"
    ) => {
        if (!supabaseReady) {
            setCatalogLoading(false);
            return;
        }

        setCatalogLoading(true);
        try {
            const catalogLimit: number | undefined = currentRole === "admin" && adminVisibilityFilter === "all"
                ? undefined
                : 80;
            let nextModules = await searchDiscoverableModules(query, sort, {
                userId: currentUserId,
                role: currentRole,
                adminVisibilityFilter: adminVisibilityFilter,
                limit: catalogLimit,
            });

            const requestedModuleId = initialRequestedModuleIdRef.current;
            if (requestedModuleId && !nextModules.some((module) => module.id === requestedModuleId)) {
                const linkedModule = await fetchAccessibleModuleById(requestedModuleId, currentUserId, {
                    role: currentRole,
                });
                if (linkedModule) {
                    nextModules = [linkedModule, ...nextModules];
                } else {
                    initialRequestedModuleIdRef.current = null;
                }
            }

            if (subscribedOnly) {
                const ids = currentSubscribedIds || [];
                const subscribedLookup = new Set(ids);
                nextModules = currentUserId
                    ? nextModules.filter((module) => subscribedLookup.has(module.id))
                    : [];
            }

            setModules(nextModules);
            setErrorMessage(null);
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not load modules.");
        } finally {
            setCatalogLoading(false);
        }
    }, [adminVisibilityFilter, query, sort, subscribedOnly, supabaseReady]);

    useEffect(() => {
        applyTheme(activeTheme);
    }, [activeTheme]);

    useEffect(() => {
        if (!profileOpen && !optionsDropdownOpen && !mobileMenuOpen && !ownerMenuOpen && !shareMenuOpen) {
            return;
        }

        const handleDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) {
                return;
            }

            if (profileOpen && profileRef.current && !profileRef.current.contains(target)) {
                setProfileOpen(false);
            }

            if (optionsDropdownOpen && optionsRef.current && !optionsRef.current.contains(target)) {
                setOptionsDropdownOpen(false);
                setCustomThemeEditorOpen(false);
            }

            if (
                ownerMenuOpen
                && ownerMenuRef.current
                && !ownerMenuRef.current.contains(target)
                && (!ownerMenuDropdownRef.current || !ownerMenuDropdownRef.current.contains(target))
            ) {
                setOwnerMenuOpen(false);
            }

            if (
                shareMenuOpen
                && shareMenuRef.current
                && !shareMenuRef.current.contains(target)
                && (!shareMenuDropdownRef.current || !shareMenuDropdownRef.current.contains(target))
            ) {
                setShareMenuOpen(false);
            }

            if (mobileMenuOpen && headerRef.current && !headerRef.current.contains(target)) {
                setMobileMenuOpen(false);
                setProfileOpen(false);
                setOptionsDropdownOpen(false);
                setCustomThemeEditorOpen(false);
                setOwnerMenuOpen(false);
                setShareMenuOpen(false);
            }
        };

        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setProfileOpen(false);
                setOptionsDropdownOpen(false);
                setCustomThemeEditorOpen(false);
                setMobileMenuOpen(false);
                setOwnerMenuOpen(false);
                setShareMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleDocumentMouseDown);
        document.addEventListener("keydown", handleDocumentKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleDocumentMouseDown);
            document.removeEventListener("keydown", handleDocumentKeyDown);
        };
    }, [mobileMenuOpen, optionsDropdownOpen, ownerMenuOpen, profileOpen, shareMenuOpen]);

    useEffect(() => {
        if (!ownerMenuOpen) {
            setOwnerMenuPosition(null);
            return;
        }

        updateOwnerMenuPosition();
        const handleViewportChange = () => {
            updateOwnerMenuPosition();
        };

        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
        return () => {
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange, true);
        };
    }, [ownerMenuOpen, updateOwnerMenuPosition]);

    useEffect(() => {
        if (!shareMenuOpen) {
            setShareMenuPosition(null);
            return;
        }

        updateShareMenuPosition();
        const handleViewportChange = () => {
            updateShareMenuPosition();
        };

        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
        return () => {
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange, true);
        };
    }, [shareMenuOpen, updateShareMenuPosition]);

    useEffect(() => {
        if (isAdmin) {
            return;
        }
        setAdminVisibilityFilter("all");
    }, [isAdmin]);

    useEffect(() => {
        if (!selectedModule || isModuleLinkShareable(selectedModule.visibility)) {
            return;
        }
        if (shareMenuOpen) {
            setShareMenuOpen(false);
        }
    }, [selectedModule, shareMenuOpen]);

    useEffect(() => {
        if (!isLegacyModulesBrowserPath()) {
            return;
        }

        try {
            const currentUrl = new URL(window.location.href);
            const nextUrl = new URL(getModulesBrowserUrl());
            nextUrl.search = currentUrl.search;
            nextUrl.hash = currentUrl.hash;
            window.history.replaceState({}, "", nextUrl.toString());
        } catch {
            // ignore invalid URLs
        }
    }, []);

    useEffect(() => {
        if (!supabaseReady) {
            setAuthLoading(false);
            setCatalogLoading(false);
            return;
        }

        let mounted = true;
        const initialize = async () => {
            try {
                const nextSession = await getCurrentSession();
                if (!mounted) {
                    return;
                }

                setSession(nextSession);
                setAuthLoading(false);

                let personalState = {
                    subscribedIds: [] as string[],
                    ratingsByModuleId: {} as Record<string, number>,
                    role: "user" as ProfileRole,
                };
                if (nextSession?.user?.id) {
                    personalState = await loadPersonalState(nextSession.user.id);
                }

                if (mounted) {
                    await refreshCatalog(nextSession?.user?.id || null, personalState.subscribedIds, personalState.role);
                }
            } catch (error: any) {
                if (!mounted) {
                    return;
                }
                setAuthLoading(false);
                setCatalogLoading(false);
                setErrorMessage(error?.message || "Could not initialize the modules browser.");
            } finally {
                clearTransientAuthParams();
            }
        };

        void initialize();

        const subscription = onAuthStateChange((nextSession) => {
            if (!mounted) {
                return;
            }

            setSession(nextSession);
            setAuthLoading(false);

            if (!nextSession?.user?.id) {
                setSubscribedIds([]);
                setRatingsByModuleId({});
                setCreatedModuleCount(0);
                setSessionRole("user");
                setProfileOpen(false);
                if (subscribedOnly) {
                    setSubscribedOnly(false);
                }
                void refreshCatalog(null, [], "user");
                return;
            }

            void loadPersonalState(nextSession.user.id).then((personalState) => {
                return refreshCatalog(nextSession.user.id, personalState.subscribedIds, personalState.role);
            }).catch((error: any) => {
                setErrorMessage(error?.message || "Could not refresh your module state.");
            });
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [loadPersonalState, refreshCatalog, subscribedOnly, supabaseReady]);

    useEffect(() => {
        persistBrowserQuery(query, sort, subscribedOnly);
    }, [persistBrowserQuery, query, sort, subscribedOnly]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void refreshCatalog(sessionUserId, subscribedIds, sessionRole);
        }, 350);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [refreshCatalog, sessionRole, sessionUserId, subscribedIds]);

    useEffect(() => {
        if (!modules.length) {
            if (selectedModuleId !== null) {
                setSelectedModuleId(null);
            }
            return;
        }

        if (!selectedModuleId || !modules.some((module) => module.id === selectedModuleId)) {
            setSelectedModuleId(modules[0].id);
        }
    }, [modules, selectedModuleId]);

    useEffect(() => {
        setOwnerMenuOpen(false);
        setOwnerMenuPosition(null);
        if (!selectedModule || editingModuleId !== selectedModule.id) {
            setEditingModuleId(null);
            setEditTitle("");
            setEditSummary("");
        }
    }, [editingModuleId, selectedModule]);

    const handleSignIn = async (): Promise<void> => {
        if (!supabaseReady) {
            setErrorMessage("Supabase is not configured in this environment.");
            return;
        }

        setMobileMenuOpen(false);
        setProfileOpen(false);
        setOptionsDropdownOpen(false);
        setCustomThemeEditorOpen(false);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            const returnUrl = new URL(getTerminalAppUrl());
            returnUrl.searchParams.set("auth_return", "library");
            await signInWithGoogle(returnUrl.toString());
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not start Google sign-in.");
        }
    };

    const handleSignOut = async (): Promise<void> => {
        setMobileMenuOpen(false);
        setProfileOpen(false);
        setOptionsDropdownOpen(false);
        setCustomThemeEditorOpen(false);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            await signOut();
            setCreatedModuleCount(0);
            setNoticeMessage("Signed out.");
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not sign out.");
        }
    };

    const handleOptionsDropdownToggle = (): void => {
        setOptionsDropdownOpen((prev) => !prev);
        setCustomThemeEditorOpen(false);
        setProfileOpen(false);
    };

    const handleSoundToggle = (): void => {
        setSoundEnabled((prev) => {
            const nextValue = !prev;
            persistSoundEnabled(nextValue);
            return nextValue;
        });
    };

    const handleViewModeChange = (nextViewMode: ModulesBrowserViewMode): void => {
        persistModulesBrowserViewMode(nextViewMode);
        setViewMode(nextViewMode);
    };

    const handleFontModeChange = (nextFontMode: ModulesBrowserFontMode): void => {
        persistModulesBrowserFontMode(nextFontMode);
        setFontMode(nextFontMode);
    };

    const handleThemeSelect = (themeId: string): void => {
        if (themeId === "custom") {
            setCustomTheme((prevCustomTheme) => {
                const baseThemeId = activeTheme.id === "custom"
                    ? prevCustomTheme.baseThemeId
                    : activeTheme.id;
                const nextCustomTheme: CustomThemeConfig = {
                    ...prevCustomTheme,
                    baseThemeId,
                };
                const nextTheme = createCustomTheme(nextCustomTheme);
                persistCustomTheme(nextCustomTheme);
                persistTheme(nextTheme);
                setActiveTheme(nextTheme);
                setOptionsDropdownOpen(true);
                setCustomThemeEditorOpen(true);
                return nextCustomTheme;
            });
            return;
        }

        const nextTheme = THEMES.find((theme) => theme.id === themeId);
        if (!nextTheme) {
            return;
        }

        persistTheme(nextTheme);
        setActiveTheme(nextTheme);
        setOptionsDropdownOpen(false);
        setCustomThemeEditorOpen(false);
        setMobileMenuOpen(false);
    };

    const handleThemeColorChange = (
        key: "fgHex" | "alertHex" | "emphasisHex" | "noticeHex" | "hyperlinkHex" | "systemHex",
        value: string
    ): void => {
        setCustomTheme((prevCustomTheme) => {
            const nextCustomTheme: CustomThemeConfig = {
                ...prevCustomTheme,
                [key]: value,
            };
            persistCustomTheme(nextCustomTheme);

            if (activeTheme.id !== "custom") {
                return nextCustomTheme;
            }

            const nextTheme = createCustomTheme(nextCustomTheme);
            persistTheme(nextTheme);
            setActiveTheme(nextTheme);
            return nextCustomTheme;
        });
    };

    const handleCustomThemeEditorToggle = (): void => {
        if (activeTheme.id !== "custom") {
            return;
        }

        setCustomThemeEditorOpen((prev) => !prev);
    };

    const handleSubscribeToggle = async (module: ModuleRecord): Promise<void> => {
        if (!sessionUserId) {
            setErrorMessage("Sign in to subscribe to modules.");
            return;
        }
        if (!isModuleLinkShareable(module.visibility)) {
            setErrorMessage("Private modules cannot be subscribed to.");
            return;
        }

        setActionModuleId(module.id);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            if (subscribedIdSet.has(module.id)) {
                await unsubscribeFromModule(module.id, sessionUserId);
            } else {
                await subscribeToModule(module.id, sessionUserId);
            }

            const personalState = await loadPersonalState(sessionUserId);
            await refreshCatalog(sessionUserId, personalState.subscribedIds, personalState.role);
            setNoticeMessage(
                subscribedIdSet.has(module.id)
                    ? `Unsubscribed from "${module.title}".`
                    : `Subscribed to "${module.title}".`
            );
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not update the subscription.");
        } finally {
            setActionModuleId(null);
        }
    };

    const handleRateModule = async (module: ModuleRecord, rating: number): Promise<void> => {
        if (!sessionUserId) {
            setErrorMessage("Sign in to rate modules.");
            return;
        }
        if (!isModuleLinkShareable(module.visibility)) {
            setErrorMessage("Private modules cannot be rated.");
            return;
        }

        if (module.owner_id === sessionUserId) {
            setErrorMessage("You cannot rate your own module.");
            return;
        }

        setActionModuleId(module.id);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            await rateModule(module.id, sessionUserId, rating);
            const personalState = await loadPersonalState(sessionUserId);
            await refreshCatalog(sessionUserId, personalState.subscribedIds, personalState.role);
            setNoticeMessage(`Rated "${module.title}" ${rating}/5.`);
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not save your rating.");
        } finally {
            setActionModuleId(null);
        }
    };

    const handleCopyPhosphorLink = async (module: ModuleRecord): Promise<void> => {
        setShareMenuOpen(false);
        const shareUrl = getTerminalAppUrl(module.id);
        try {
            await navigator.clipboard.writeText(shareUrl);
            setNoticeMessage("Phosphor link copied to clipboard.");
            setErrorMessage(null);
        } catch {
            setErrorMessage(`Could not copy automatically. Share this URL manually: ${shareUrl}`);
        }
    };

    const handleCopyLibraryLink = async (module: ModuleRecord): Promise<void> => {
        setShareMenuOpen(false);
        const shareUrl = getModulesBrowserUrl({ module: module.id });
        try {
            await navigator.clipboard.writeText(shareUrl);
            setNoticeMessage("Library link copied to clipboard.");
            setErrorMessage(null);
        } catch {
            setErrorMessage(`Could not copy automatically. Share this URL manually: ${shareUrl}`);
        }
    };

    const handleShareMenuToggle = (): void => {
        setShareMenuOpen((prev) => !prev);
        setOwnerMenuOpen(false);
        setProfileOpen(false);
        setOptionsDropdownOpen(false);
        setCustomThemeEditorOpen(false);
    };

    const handleOwnerMenuToggle = (): void => {
        setOwnerMenuOpen((prev) => !prev);
        setProfileOpen(false);
        setOptionsDropdownOpen(false);
        setCustomThemeEditorOpen(false);
    };

    const handleStartEdit = (module: ModuleRecord): void => {
        setOwnerMenuOpen(false);
        setEditTitle(module.title);
        setEditSummary(module.summary || "");
        setEditingModuleId(module.id);
    };

    const handleCancelEdit = (): void => {
        setEditingModuleId(null);
        setEditTitle("");
        setEditSummary("");
    };

    const handleSaveOwnerEdits = async (module: ModuleRecord): Promise<void> => {
        if (!sessionUserId || module.owner_id !== sessionUserId) {
            setErrorMessage("Only the owner can edit this module.");
            return;
        }

        const nextTitle = editTitle.trim();
        if (!nextTitle.length) {
            setErrorMessage("Add a title before saving.");
            return;
        }

        setActionModuleId(module.id);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            const updatedModule = await updateModuleMetadata({
                id: module.id,
                ownerId: sessionUserId,
                title: nextTitle,
                summary: editSummary.trim(),
                visibility: module.visibility,
            });
            const personalState = await loadPersonalState(sessionUserId);
            await refreshCatalog(sessionUserId, personalState.subscribedIds, personalState.role);
            setSelectedModuleId(updatedModule.id);
            setEditingModuleId(null);
            setEditTitle("");
            setEditSummary("");
            setNoticeMessage(`Updated "${updatedModule.title}".`);
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not update the module.");
        } finally {
            setActionModuleId(null);
        }
    };

    const handleSetOwnerVisibility = async (
        module: ModuleRecord,
        nextVisibility: ModuleVisibility
    ): Promise<void> => {
        if (!sessionUserId || module.owner_id !== sessionUserId) {
            setErrorMessage("Only the owner can change module visibility.");
            return;
        }

        if (module.visibility === nextVisibility) {
            setOwnerMenuOpen(false);
            return;
        }

        setOwnerMenuOpen(false);
        setActionModuleId(module.id);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            const updatedModule = await updateModuleMetadata({
                id: module.id,
                ownerId: sessionUserId,
                title: module.title,
                summary: module.summary,
                visibility: nextVisibility,
            });
            const personalState = await loadPersonalState(sessionUserId);
            await refreshCatalog(sessionUserId, personalState.subscribedIds, personalState.role);
            setSelectedModuleId(updatedModule.id);
            setNoticeMessage(`"${updatedModule.title}" is now ${nextVisibility}.`);
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not update module visibility.");
        } finally {
            setActionModuleId(null);
        }
    };

    const handleDeleteOwnedModule = async (module: ModuleRecord): Promise<void> => {
        if (!sessionUserId || module.owner_id !== sessionUserId) {
            setErrorMessage("Only the owner can delete this module.");
            return;
        }

        if (!window.confirm(`Delete "${module.title}"? This cannot be undone.`)) {
            return;
        }

        setOwnerMenuOpen(false);
        setEditingModuleId(null);
        setActionModuleId(module.id);
        setErrorMessage(null);
        setNoticeMessage(null);
        try {
            await deleteModule(module.id, sessionUserId);
            const personalState = await loadPersonalState(sessionUserId);
            await refreshCatalog(sessionUserId, personalState.subscribedIds, personalState.role);
            setSelectedModuleId(null);
            setNoticeMessage(`Deleted "${module.title}".`);
        } catch (error: any) {
            setErrorMessage(error?.message || "Could not delete the module.");
        } finally {
            setActionModuleId(null);
        }
    };

    const emptyMessage = useMemo(() => {
        if (catalogLoading) {
            return "Loading modules...";
        }
        if (subscribedOnly && !sessionUserId) {
            return "Sign in to filter by subscriptions.";
        }
        if (query.trim().length) {
            return "No modules matched your search.";
        }
        if (isAdmin && adminVisibilityFilter === "all") {
            return "No modules found yet.";
        }
        if (isAdmin) {
            return "No public modules found yet.";
        }
        return sessionUserId ? "No public modules or owned modules found yet." : "No public modules found yet.";
    }, [adminVisibilityFilter, catalogLoading, isAdmin, query, sessionUserId, subscribedOnly]);

    return (
        <section className={browserClassName}>
            <header ref={headerRef} className="phosphor-header modules-browser__topbar">
                <a
                    className="phosphor-header__title"
                    href={getTerminalAppUrl()}
                    title="Return to the PHOSPHOR terminal"
                >
                    {APP_TITLE} LIBRARY
                </a>

                <button
                    className="phosphor-header__btn phosphor-header__menu-btn"
                    onClick={() => {
                        setMobileMenuOpen((prev) => !prev);
                        if (mobileMenuOpen) {
                            setProfileOpen(false);
                            setOptionsDropdownOpen(false);
                            setCustomThemeEditorOpen(false);
                        }
                    }}
                    aria-haspopup="menu"
                    aria-expanded={mobileMenuOpen}
                    title="Toggle library controls"
                >
                    [MENU {mobileMenuOpen ? "▲" : "▼"}]
                </button>

                <div
                    className={
                        "phosphor-header__controls"
                        + (mobileMenuOpen ? " phosphor-header__controls--open" : "")
                    }
                >
                    <a
                        className="phosphor-header__btn"
                        href={getTerminalAppUrl()}
                        onClick={() => {
                            setMobileMenuOpen(false);
                            setProfileOpen(false);
                            setOptionsDropdownOpen(false);
                            setCustomThemeEditorOpen(false);
                        }}
                    >
                        [TERMINAL]
                    </a>

                    <div ref={optionsRef} className="phosphor-header__options-wrapper">
                        <button
                            className="phosphor-header__btn"
                            onClick={handleOptionsDropdownToggle}
                            aria-haspopup="menu"
                            aria-expanded={optionsDropdownOpen}
                            title="Theme and sound options"
                        >
                            [OPTIONS {optionsDropdownOpen ? "▲" : "▼"}]
                        </button>

                        {optionsDropdownOpen && (
                            <div className="phosphor-header__dropdown phosphor-header__dropdown--options" role="menu">
                                <button
                                    className="phosphor-header__dropdown-item"
                                    role="menuitem"
                                    onClick={handleSoundToggle}
                                >
                                    [SOUND:{soundEnabled ? "ON" : "OFF"}]
                                </button>

                                <div className="phosphor-header__dropdown-item phosphor-header__dropdown-item--separator" />

                                <div className="phosphor-header__dropdown-label">[DISPLAY]</div>
                                {BROWSER_VIEW_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        role="menuitemradio"
                                        aria-checked={viewMode === option.value}
                                        className={
                                            "phosphor-header__dropdown-item"
                                            + (viewMode === option.value ? " phosphor-header__dropdown-item--active" : "")
                                        }
                                        onClick={() => handleViewModeChange(option.value)}
                                    >
                                        {viewMode === option.value ? "► " : "  "}{option.label}
                                    </button>
                                ))}
                                {BROWSER_FONT_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        role="menuitemradio"
                                        aria-checked={fontMode === option.value}
                                        className={
                                            "phosphor-header__dropdown-item"
                                            + (fontMode === option.value ? " phosphor-header__dropdown-item--active" : "")
                                        }
                                        onClick={() => handleFontModeChange(option.value)}
                                    >
                                        {fontMode === option.value ? "► " : "  "}{option.label}
                                    </button>
                                ))}

                                <div className="phosphor-header__dropdown-item phosphor-header__dropdown-item--separator" />

                                <div className="phosphor-header__dropdown-label">[THEME]</div>
                                {THEMES.map((theme) => (
                                    <button
                                        key={theme.id}
                                        role="menuitemradio"
                                        aria-checked={theme.id === activeTheme.id}
                                        className={
                                            "phosphor-header__dropdown-item"
                                            + (theme.id === activeTheme.id ? " phosphor-header__dropdown-item--active" : "")
                                        }
                                        onClick={() => handleThemeSelect(theme.id)}
                                    >
                                        {theme.id === activeTheme.id ? "► " : "  "}{theme.name}
                                    </button>
                                ))}

                                <button
                                    role="menuitemradio"
                                    aria-checked={activeTheme.id === "custom"}
                                    className={
                                        "phosphor-header__dropdown-item"
                                        + (activeTheme.id === "custom" ? " phosphor-header__dropdown-item--active" : "")
                                    }
                                    onClick={() => {
                                        if (activeTheme.id !== "custom") {
                                            handleThemeSelect("custom");
                                            return;
                                        }

                                        handleCustomThemeEditorToggle();
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
                                                onChange={(event) => handleThemeColorChange("fgHex", event.target.value)}
                                            />
                                        </label>
                                        <label className="phosphor-header__theme-color-field">
                                            <span>ALERT</span>
                                            <input
                                                type="color"
                                                aria-label="Custom alert color"
                                                value={customTheme.alertHex}
                                                onChange={(event) => handleThemeColorChange("alertHex", event.target.value)}
                                            />
                                        </label>
                                        <label className="phosphor-header__theme-color-field">
                                            <span>EMPHASIS</span>
                                            <input
                                                type="color"
                                                aria-label="Custom emphasis color"
                                                value={customTheme.emphasisHex}
                                                onChange={(event) => handleThemeColorChange("emphasisHex", event.target.value)}
                                            />
                                        </label>
                                        <label className="phosphor-header__theme-color-field">
                                            <span>NOTICE</span>
                                            <input
                                                type="color"
                                                aria-label="Custom notice color"
                                                value={customTheme.noticeHex}
                                                onChange={(event) => handleThemeColorChange("noticeHex", event.target.value)}
                                            />
                                        </label>
                                        <label className="phosphor-header__theme-color-field">
                                            <span>HYPERLINK</span>
                                            <input
                                                type="color"
                                                aria-label="Custom hyperlink color"
                                                value={customTheme.hyperlinkHex}
                                                onChange={(event) => handleThemeColorChange("hyperlinkHex", event.target.value)}
                                            />
                                        </label>
                                        <label className="phosphor-header__theme-color-field">
                                            <span>SYSTEM</span>
                                            <input
                                                type="color"
                                                aria-label="Custom system color"
                                                value={customTheme.systemHex}
                                                onChange={(event) => handleThemeColorChange("systemHex", event.target.value)}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <a
                        className="phosphor-header__btn"
                        href="https://ko-fi.com/ethandunning"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        [DONATE]
                    </a>

                    {!authLoading && !sessionEmail && (
                        <button className="phosphor-header__btn" onClick={() => void handleSignIn()}>
                            [SIGN IN]
                        </button>
                    )}

                    {!authLoading && !!sessionEmail && (
                        <div ref={profileRef} className="phosphor-header__options-wrapper">
                            <button
                                className="phosphor-header__btn"
                                onClick={() => {
                                    setProfileOpen((prev) => !prev);
                                    setOptionsDropdownOpen(false);
                                    setCustomThemeEditorOpen(false);
                                }}
                                aria-haspopup="menu"
                                aria-expanded={profileOpen}
                            >
                                [PROFILE {profileOpen ? "▲" : "▼"}]
                            </button>

                            {profileOpen && (
                                <div
                                    className="phosphor-header__dropdown phosphor-header__dropdown--options modules-browser__profile-menu"
                                    role="menu"
                                >
                                    <div className="phosphor-header__dropdown-label">[ACCOUNT]</div>
                                    <div className="modules-browser__profile-row">
                                        <span className="modules-browser__profile-key">[EMAIL]</span>
                                        <span className="modules-browser__profile-value">{sessionEmail}</span>
                                    </div>
                                    <div className="modules-browser__profile-row">
                                        <span className="modules-browser__profile-key">[MODULES CREATED]</span>
                                        <span className="modules-browser__profile-value">{createdModuleCount}</span>
                                    </div>
                                    {isAdmin && (
                                        <div className="modules-browser__profile-row">
                                            <span className="modules-browser__profile-key">[ROLE]</span>
                                            <span className="modules-browser__profile-value">admin</span>
                                        </div>
                                    )}
                                    <div className="phosphor-header__dropdown-item phosphor-header__dropdown-item--separator" />
                                    <button
                                        className="phosphor-header__dropdown-item"
                                        role="menuitem"
                                        onClick={() => void handleSignOut()}
                                    >
                                        [SIGN OUT]
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className="modules-browser__shell">
                <div className="modules-browser__toolbar">
                    <label className="modules-browser__field">
                        <span>Search</span>
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search title or summary"
                        />
                    </label>

                    <label className="modules-browser__field modules-browser__field--sort">
                        <span>Sort</span>
                        <CreatorSelect
                            value={sort}
                            options={SORT_OPTIONS}
                            onChange={(nextValue) => setSort(nextValue as ModuleSort)}
                            fallbackLabel="Newest"
                        />
                    </label>

                    <div className="modules-browser__toolbar-actions">
                        {isAdmin && (
                            <button
                                className={
                                    "modules-browser__btn"
                                    + (adminVisibilityFilter === "all" ? " modules-browser__btn--active" : "")
                                }
                                onClick={() => {
                                    setAdminVisibilityFilter((prev) => (prev === "all" ? "public" : "all"));
                                }}
                            >
                                Admin Scope: {adminVisibilityFilter === "all" ? "All" : "Public Only"}
                            </button>
                        )}
                        <button
                            className={
                                "modules-browser__btn"
                                + (subscribedOnly ? " modules-browser__btn--active" : "")
                            }
                            disabled={!sessionUserId}
                            onClick={() => setSubscribedOnly((prev) => !prev)}
                        >
                            Subscribed Only: {subscribedOnly ? "On" : "Off"}
                        </button>
                    </div>
                </div>

                {!supabaseReady && (
                    <div className="modules-browser__notice modules-browser__notice--error">
                        Supabase is not configured in this environment. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` locally.
                    </div>
                )}

                {errorMessage && (
                    <div className="modules-browser__notice modules-browser__notice--error">
                        <span>{errorMessage}</span>
                        <button
                            type="button"
                            className="modules-browser__notice-dismiss"
                            onClick={() => setErrorMessage(null)}
                            aria-label="Dismiss error message"
                            title="Dismiss"
                        >
                            X
                        </button>
                    </div>
                )}

                {noticeMessage && (
                    <div className="modules-browser__notice">
                        <span>{noticeMessage}</span>
                        <button
                            type="button"
                            className="modules-browser__notice-dismiss"
                            onClick={() => setNoticeMessage(null)}
                            aria-label="Dismiss notice"
                            title="Dismiss"
                        >
                            X
                        </button>
                    </div>
                )}

                <main className="modules-browser__content">
                    <section className="modules-browser__panel modules-browser__panel--list">
                        {!modules.length && (
                            <div className="modules-browser__empty">{emptyMessage}</div>
                        )}

                        {!!modules.length && (
                            <div className="modules-browser__list">
                                {modules.map((module) => {
                                    const isSelected = selectedModule?.id === module.id;
                                    const isSubscribed = subscribedIdSet.has(module.id);
                                    const visibilityFlag = module.visibility === "private"
                                        ? "Private"
                                        : (module.visibility === "unlisted" ? "Unlisted" : null);
                                    const author = getModuleAuthor(module);
                                    const ratingDisplay = getModuleRatingAscii(module.rating_average);
                                    const ratingNumeric = getModuleRatingNumeric(module.rating_average);
                                    const ratingTitle = getModuleRatingTitle(module.rating_average);

                                    return (
                                        <button
                                            key={module.id}
                                            type="button"
                                            className={
                                                "modules-browser__list-item"
                                                + (isSelected ? " modules-browser__list-item--active" : "")
                                            }
                                            onClick={() => setSelectedModuleId(module.id)}
                                            aria-pressed={isSelected}
                                        >
                                            <div className="modules-browser__list-header">
                                                <div className="modules-browser__list-title-group">
                                                    <span className="modules-browser__list-name" title={module.title}>
                                                        {module.title}
                                                    </span>
                                                    <span className="modules-browser__list-author" title={author}>
                                                        By {author}
                                                    </span>
                                                </div>
                                                <div className="modules-browser__list-flags">
                                                    {!!visibilityFlag && (
                                                        <span className="modules-browser__list-flag">{visibilityFlag}</span>
                                                    )}
                                                    {isSubscribed && (
                                                        <span className="modules-browser__list-flag">Subscribed</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="modules-browser__list-meta">
                                                <span className="modules-browser__list-meta-primary">
                                                    {module.subscription_count} subscribers
                                                    {" | "}
                                                    Published {formatTimestamp(module.published_at || module.updated_at)}
                                                </span>
                                                <span className="modules-browser__list-meta-rating" title={ratingTitle}>
                                                    Rating {ratingDisplay} ({ratingNumeric})
                                                    {" | "}
                                                    {module.rating_count} ratings
                                                </span>
                                            </span>
                                            <span className="modules-browser__list-summary">
                                                {module.summary || "[NO SUMMARY PROVIDED]"}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <aside className="modules-browser__panel modules-browser__panel--detail">
                        {!selectedModule && (
                            <div className="modules-browser__empty">
                                Select a module to see its full details.
                            </div>
                        )}

                        {!!selectedModule && (() => {
                            const isSubscribed = subscribedIdSet.has(selectedModule.id);
                            const myRating = ratingsByModuleId[selectedModule.id] || 0;
                            const isOwnModule = selectedModule.owner_id === sessionUserId;
                            const isBusy = actionModuleId === selectedModule.id;
                            const isEditing = editingModuleId === selectedModule.id;
                            const author = getModuleAuthor(selectedModule);
                            const ratingDisplay = getModuleRatingAscii(selectedModule.rating_average);
                            const ratingNumeric = getModuleRatingNumeric(selectedModule.rating_average);
                            const ratingTitle = getModuleRatingTitle(selectedModule.rating_average);

                            return (
                                <article className="modules-browser__detail">
                                    <div className="modules-browser__detail-header">
                                        <div className="modules-browser__detail-title-group">
                                            <div className="modules-browser__detail-title-row">
                                                <h2 title={selectedModule.title}>{selectedModule.title}</h2>
                                                <span className="modules-browser__detail-author" title={author}>
                                                    By {author}
                                                </span>
                                            </div>
                                            <div className="modules-browser__meta">
                                                <span title={ratingTitle}>Rating {ratingDisplay} ({ratingNumeric})</span>
                                                <span>{selectedModule.rating_count} ratings</span>
                                                <span>{selectedModule.subscription_count} subscribers</span>
                                                <span>Published {formatTimestamp(selectedModule.published_at || selectedModule.updated_at)}</span>
                                            </div>
                                        </div>

                                        <div className="modules-browser__detail-badges">
                                            {selectedModule.visibility === "private" && (
                                                <span className="modules-browser__pill">Private</span>
                                            )}
                                            {selectedModule.visibility === "unlisted" && (
                                                <span className="modules-browser__pill">Unlisted</span>
                                            )}
                                            {isSubscribed && (
                                                <span className="modules-browser__pill">Subscribed</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="modules-browser__detail-actions">
                                        <button
                                            className="modules-browser__btn"
                                            onClick={() => {
                                                window.location.href = getTerminalAppUrl(selectedModule.id);
                                            }}
                                        >
                                            Open in Phosphor
                                        </button>

                                        {isModuleLinkShareable(selectedModule.visibility) && (
                                            <div ref={shareMenuRef} className="modules-browser__share-menu">
                                                <button
                                                    className="modules-browser__btn"
                                                    onClick={handleShareMenuToggle}
                                                    aria-haspopup="menu"
                                                    aria-expanded={shareMenuOpen}
                                                >
                                                    {shareMenuOpen ? "Share ▲" : "Share ▼"}
                                                </button>
                                            </div>
                                        )}

                                        {!isOwnModule && isModuleLinkShareable(selectedModule.visibility) && (
                                            <button
                                                className={
                                                    "modules-browser__btn"
                                                    + (isSubscribed ? " modules-browser__btn--active" : "")
                                                }
                                                disabled={!sessionUserId || isBusy}
                                                onClick={() => void handleSubscribeToggle(selectedModule)}
                                            >
                                                {isSubscribed ? "Unsubscribe" : "Subscribe"}
                                            </button>
                                        )}

                                        {isOwnModule && (
                                            <div ref={ownerMenuRef} className="modules-browser__owner-menu">
                                                <button
                                                    className="modules-browser__btn"
                                                    disabled={isBusy}
                                                    onClick={handleOwnerMenuToggle}
                                                    aria-haspopup="menu"
                                                    aria-expanded={ownerMenuOpen}
                                                >
                                                    {ownerMenuOpen ? "Manage ▲" : "Manage ▼"}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isOwnModule && isEditing && (
                                        <section className="modules-browser__detail-card modules-browser__detail-card--edit">
                                            <div className="modules-browser__edit-grid">
                                                <label className="modules-browser__field">
                                                    <span>Title</span>
                                                    <input
                                                        value={editTitle}
                                                        onChange={(event) => setEditTitle(event.target.value)}
                                                        placeholder="Module title"
                                                        maxLength={80}
                                                    />
                                                </label>

                                                <label className="modules-browser__field modules-browser__field--textarea">
                                                    <span>Description</span>
                                                    <textarea
                                                        value={editSummary}
                                                        onChange={(event) => setEditSummary(event.target.value)}
                                                        placeholder="Short summary for the module page"
                                                        rows={5}
                                                        maxLength={2000}
                                                    />
                                                </label>
                                            </div>

                                            <div className="modules-browser__edit-actions">
                                                <button
                                                    className="modules-browser__btn"
                                                    disabled={isBusy}
                                                    onClick={() => void handleSaveOwnerEdits(selectedModule)}
                                                >
                                                    Save Details
                                                </button>
                                                <button
                                                    className="modules-browser__btn"
                                                    disabled={isBusy}
                                                    onClick={handleCancelEdit}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </section>
                                    )}

                                    <section className="modules-browser__detail-card modules-browser__detail-card--summary">
                                        <span className="modules-browser__detail-card-label">Description</span>
                                        <p className="modules-browser__detail-summary">
                                            {selectedModule.summary || "[NO SUMMARY PROVIDED]"}
                                        </p>
                                    </section>

                                    <div className="modules-browser__detail-stats">
                                        <div className="modules-browser__detail-stat">
                                            <span>Module ID</span>
                                            <strong>{selectedModule.id}</strong>
                                        </div>
                                        <div className="modules-browser__detail-stat">
                                            <span>Updated</span>
                                            <strong>{formatTimestamp(selectedModule.updated_at)}</strong>
                                        </div>
                                    </div>

                                    <section className="modules-browser__detail-card modules-browser__detail-card--rating">
                                        <div className="modules-browser__rating">
                                            <div className="modules-browser__rating-row">
                                                <span className="modules-browser__rating-label">Rate This Module</span>
                                                <div className="modules-browser__rating-actions">
                                                    {RATING_VALUES.map((rating) => (
                                                        <button
                                                            key={`${selectedModule.id}-rating-${rating}`}
                                                            className={
                                                                "modules-browser__rating-btn"
                                                                + (myRating === rating ? " modules-browser__rating-btn--active" : "")
                                                            }
                                                            disabled={!sessionUserId || isOwnModule || isBusy || !isModuleLinkShareable(selectedModule.visibility)}
                                                            onClick={() => void handleRateModule(selectedModule, rating)}
                                                        >
                                                            {rating}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {!sessionUserId && (
                                                <small className="modules-browser__hint">Sign in to rate or subscribe.</small>
                                            )}
                                            {!!sessionUserId && !isModuleLinkShareable(selectedModule.visibility) && (
                                                <small className="modules-browser__hint">Private modules cannot be rated or subscribed to.</small>
                                            )}
                                            {!!sessionUserId && isOwnModule && (
                                                <small className="modules-browser__hint">You cannot rate or subscribe to your own module.</small>
                                            )}
                                        </div>
                                    </section>
                                </article>
                            );
                        })()}
                    </aside>
                </main>
            </div>

            {ownerMenuOpen && !!selectedModule && selectedModule.owner_id === sessionUserId && !!ownerMenuPosition && createPortal(
                <div
                    ref={ownerMenuDropdownRef}
                    className={
                        "phosphor-header__dropdown phosphor-header__dropdown--options modules-browser__owner-menu-dropdown"
                        + (viewMode === "web" ? " modules-browser__owner-menu-dropdown--web-view" : "")
                        + (fontMode === "normal" ? " modules-browser__owner-menu-dropdown--font-normal" : "")
                    }
                    role="menu"
                    style={{
                        top: `${ownerMenuPosition.top}px`,
                        left: `${ownerMenuPosition.left}px`,
                    }}
                >
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => handleStartEdit(selectedModule)}
                    >
                        Edit Details
                    </button>
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => void handleSetOwnerVisibility(selectedModule, "public")}
                    >
                        {selectedModule.visibility === "public" ? "Visibility: Public" : "Set Public"}
                    </button>
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => void handleSetOwnerVisibility(selectedModule, "unlisted")}
                    >
                        {selectedModule.visibility === "unlisted" ? "Visibility: Unlisted" : "Set Unlisted"}
                    </button>
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => void handleSetOwnerVisibility(selectedModule, "private")}
                    >
                        {selectedModule.visibility === "private" ? "Visibility: Private" : "Set Private"}
                    </button>
                    <button
                        className="phosphor-header__dropdown-item modules-browser__dropdown-item--danger"
                        role="menuitem"
                        onClick={() => void handleDeleteOwnedModule(selectedModule)}
                    >
                        Delete Module
                    </button>
                </div>,
                document.body
            )}

            {shareMenuOpen && !!selectedModule && isModuleLinkShareable(selectedModule.visibility) && !!shareMenuPosition && createPortal(
                <div
                    ref={shareMenuDropdownRef}
                    className={
                        "phosphor-header__dropdown phosphor-header__dropdown--options modules-browser__share-menu-dropdown"
                        + (viewMode === "web" ? " modules-browser__share-menu-dropdown--web-view" : "")
                        + (fontMode === "normal" ? " modules-browser__share-menu-dropdown--font-normal" : "")
                    }
                    role="menu"
                    style={{
                        top: `${shareMenuPosition.top}px`,
                        left: `${shareMenuPosition.left}px`,
                    }}
                >
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => void handleCopyPhosphorLink(selectedModule)}
                    >
                        Copy Phosphor Link
                    </button>
                    <button
                        className="phosphor-header__dropdown-item"
                        role="menuitem"
                        onClick={() => void handleCopyLibraryLink(selectedModule)}
                    >
                        Copy Library Link
                    </button>
                </div>,
                document.body
            )}
        </section>
    );
};

export default ModulesBrowser;
