import React, { FC, useEffect, useId, useMemo, useRef, useState } from "react";
import "./style.scss";

interface ScriptCreatorProps {
    initialScript: any;
    onApply: (scriptJson: any) => void;
    onPreview: (scriptJson: any, screenId: string, elementIndex: number) => void;
    onClose: () => void;
}

type AddableElementType =
    "plainText"
    | "text"
    | "alertText"
    | "noticeText"
    | "emphasisText"
    | "systemText"
    | "link"
    | "bitmap"
    | "prompt"
    | "toggle"
    | "list"
    | "reportComposer"
    | "dialogLink";

interface AddableElementOption {
    value: AddableElementType;
    label: string;
}

interface CreatorSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface CreatorSelectProps {
    value: string;
    options: CreatorSelectOption[];
    onChange: (nextValue: string) => void;
    className?: string;
    disabled?: boolean;
    fallbackLabel?: string;
}

type CreatorColorMode = "theme" | "dark" | "light";
type CyclerStateBehavior = "none" | "link" | "action";

const CREATOR_COLOR_MODE_LABELS: Record<CreatorColorMode, string> = {
    theme: "THEME",
    dark: "DARK",
    light: "LIGHT",
};

const CYCLER_STATE_BEHAVIOR_OPTIONS: CreatorSelectOption[] = [
    { value: "none", label: "none" },
    { value: "link", label: "link" },
    { value: "action", label: "action" },
];

const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 220;
const MIN_EDITOR_WIDTH = 360;
const RESIZE_HANDLE_WIDTH = 8;
const MARKDOWN_SHORTCUT_WRAPPERS: Record<string, string> = {
    b: "**",
    i: "*",
    u: "++",
};

const getCyclerStateBehavior = (state: any): CyclerStateBehavior => {
    if (typeof state?.action === "string" && state.action.trim().length) {
        return "action";
    }
    if (typeof state?.target === "string" && state.target.trim().length) {
        return "link";
    }
    return "none";
};

const normalizeCyclerStates = (states: any[], fallbackLabel: string): any[] => {
    const source = Array.isArray(states) ? states : [];
    const normalized = source.map((entry: any, index: number) => {
        if (typeof entry === "string") {
            return {
                text: entry,
                active: index === 0,
            };
        }

        if (!entry || typeof entry !== "object") {
            return {
                text: `${fallbackLabel} ${index + 1}`,
                active: index === 0,
            };
        }

        const next: any = {
            text: typeof entry.text === "string" ? entry.text : `${fallbackLabel} ${index + 1}`,
            active: !!entry.active,
        };

        if (typeof entry.className === "string") {
            next.className = entry.className;
        }
        if (typeof entry.target === "string") {
            next.target = entry.target;
        }
        if (typeof entry.action === "string") {
            next.action = entry.action;
        }

        return next;
    });

    if (!normalized.length) {
        return [{ text: `${fallbackLabel} 1`, active: true }];
    }

    let hasActive = false;
    normalized.forEach((state) => {
        if (!hasActive && state.active) {
            hasActive = true;
            state.active = true;
            return;
        }
        state.active = false;
    });
    if (!hasActive) {
        normalized[0].active = true;
    }

    return normalized;
};

const getNextCreatorColorMode = (mode: CreatorColorMode): CreatorColorMode => {
    if (mode === "theme") {
        return "dark";
    }
    if (mode === "dark") {
        return "light";
    }
    return "theme";
};

const CreatorSelect: FC<CreatorSelectProps> = ({
    value,
    options,
    onChange,
    className,
    disabled = false,
    fallbackLabel,
}) => {
    const [open, setOpen] = useState<boolean>(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listboxId = useId();
    const selectedOption = options.find((option) => option.value === value) || null;

    useEffect(() => {
        const onDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target || !rootRef.current || rootRef.current.contains(target)) {
                return;
            }
            setOpen(false);
        };
        document.addEventListener("mousedown", onDocumentMouseDown);
        return () => {
            document.removeEventListener("mousedown", onDocumentMouseDown);
        };
    }, []);

    useEffect(() => {
        if (disabled) {
            setOpen(false);
        }
    }, [disabled]);

    const triggerLabel = selectedOption?.label || fallbackLabel || value || "(none)";
    const showCaret = !disabled && options.length > 0;

    return (
        <div
            ref={rootRef}
            className={
                "script-creator-select"
                + (open ? " script-creator-select--open" : "")
                + (disabled ? " script-creator-select--disabled" : "")
                + (className ? ` ${className}` : "")
            }
        >
            <button
                type="button"
                className="script-creator-select__trigger"
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-expanded={open}
                disabled={disabled}
                onClick={() => {
                    if (!options.length) {
                        return;
                    }
                    setOpen((prev) => !prev);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        setOpen(false);
                        return;
                    }

                    if ((event.key === "Enter" || event.key === " " || event.key === "ArrowDown") && options.length) {
                        event.preventDefault();
                        setOpen((prev) => !prev);
                    }
                }}
            >
                <span>{triggerLabel}</span>
                {showCaret && <span className="script-creator-select__caret">▼</span>}
            </button>

            {open && (
                <div id={listboxId} role="listbox" className="script-creator-select__menu">
                    {options.map((option) => {
                        const isActive = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                disabled={option.disabled}
                                className={
                                    "script-creator-select__option"
                                    + (isActive ? " script-creator-select__option--active" : "")
                                }
                                onClick={() => {
                                    if (option.disabled) {
                                        return;
                                    }
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const ADDABLE_ELEMENT_OPTIONS: AddableElementOption[] = [
    { value: "plainText", label: "Text Line" },
    { value: "text", label: "Text Block" },
    { value: "alertText", label: "Alert Text" },
    { value: "noticeText", label: "Notice Text" },
    { value: "emphasisText", label: "Emphasis Text" },
    { value: "systemText", label: "System Text" },
    { value: "link", label: "Link Button" },
    { value: "bitmap", label: "Bitmap/Image" },
    { value: "prompt", label: "Prompt Input" },
    { value: "toggle", label: "Toggle" },
    { value: "list", label: "List" },
    { value: "reportComposer", label: "Report Composer" },
    { value: "dialogLink", label: "Dialog Link (+ Dialog)" },
];

const TEXT_CLASSNAME_OPTIONS = [
    "",
    "alert",
    "notice",
    "emphasis",
    "system",
    "center",
    "title",
    "small",
    "script-hidden",
];

const LINK_CLASSNAME_OPTIONS = [
    "",
    "alert",
    "inline",
    "center",
    "small",
    "script-hidden",
];

const PROMPT_CLASSNAME_OPTIONS = [
    "",
    "cursor",
    "alert",
    "notice",
    "emphasis",
    "system",
    "small",
    "script-hidden",
];

const TOGGLE_LIST_CLASSNAME_OPTIONS = [
    "",
    "alert",
    "notice",
    "emphasis",
    "system",
    "small",
    "script-hidden",
];

const BITMAP_CLASSNAME_OPTIONS = [
    "",
    "footer",
    "monochrome",
    "luminosity",
    "light",
    "lighten",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
];

const SCREEN_TYPE_OPTIONS: CreatorSelectOption[] = [
    { value: "screen", label: "screen" },
    { value: "static", label: "static" },
];

const BOOLEAN_OPTIONS: CreatorSelectOption[] = [
    { value: "false", label: "false" },
    { value: "true", label: "true" },
];

const TEXT_LINE_STYLE_OPTIONS: CreatorSelectOption[] = [
    { value: "", label: "(unstyled text line)" },
    ...TEXT_CLASSNAME_OPTIONS
        .filter((option) => option.length > 0)
        .map((option) => ({ value: option, label: option })),
];

const createDefaultScript = (): {
    config: { name: string; author: string };
    screens: Array<{ id: string; type: string; content: any[] }>;
    dialogs: any[];
} => ({
    config: {
        name: "Custom Script",
        author: "",
    },
    screens: [
        {
            id: "screen0",
            type: "screen",
            content: ["Welcome to your custom script."],
        },
    ],
    dialogs: [],
});

const cloneJson = <T,>(value: T): T => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
};

const ensureScriptShape = (raw: any): any => {
    const base = cloneJson(raw && typeof raw === "object" ? raw : createDefaultScript());
    if (!base.config || typeof base.config !== "object") {
        base.config = {};
    }
    if (!Array.isArray(base.screens)) {
        base.screens = [];
    }
    if (!Array.isArray(base.dialogs)) {
        base.dialogs = [];
    }
    if (!base.screens.length) {
        base.screens.push({
            id: "screen0",
            type: "screen",
            content: [""],
        });
    }

    base.screens = base.screens
        .filter((screen: any) => screen && typeof screen === "object")
        .map((screen: any, index: number) => ({
            ...screen,
            id: typeof screen.id === "string" && screen.id.trim() ? screen.id : `screen${index}`,
            type: typeof screen.type === "string" ? screen.type : "screen",
            content: Array.isArray(screen.content) ? screen.content : [],
        }));

    return base;
};

const nextScreenId = (screens: any[]): string => {
    const ids = new Set(screens.map((screen) => screen.id));
    let i = screens.length;
    while (ids.has(`screen${i}`)) {
        i += 1;
    }
    return `screen${i}`;
};

const nextDialogId = (dialogs: any[]): string => {
    const ids = new Set((dialogs || []).map((dialog: any) => dialog?.id).filter((id: any) => typeof id === "string"));
    let i = dialogs?.length || 0;
    while (ids.has(`dialog${i}`)) {
        i += 1;
    }
    return `dialog${i}`;
};

const uniqueTargets = (targets: string[]): string[] => {
    return Array.from(new Set(targets.filter((target) => typeof target === "string" && target.trim().length > 0)));
};

const readScreenTargetsFromAction = (action: any): string[] => {
    if (!action || typeof action !== "object") {
        return [];
    }

    const actionType = typeof action.type === "string" ? action.type.toLowerCase() : "";
    if (actionType !== "link" && actionType !== "href") {
        return [];
    }

    if (typeof action.target === "string") {
        return [action.target];
    }

    if (!Array.isArray(action.target)) {
        return [];
    }

    return uniqueTargets(action.target.flatMap((targetEntry: any) => {
        if (!targetEntry || typeof targetEntry !== "object") {
            return [];
        }
        const targetType = typeof targetEntry.type === "string" ? targetEntry.type.toLowerCase() : "";
        if (targetType !== "link" && targetType !== "href") {
            return [];
        }
        return typeof targetEntry.target === "string" ? [targetEntry.target] : [];
    }));
};

const readScreenTargetsFromElement = (element: any): string[] => {
    if (!element || typeof element !== "object") {
        return [];
    }

    const elementType = typeof element.type === "string" ? element.type.toLowerCase() : "";

    if (elementType === "link" || elementType === "href") {
        return readScreenTargetsFromAction({
            type: "link",
            target: element.target,
        });
    }

    if (elementType === "toggle" || elementType === "list") {
        if (!Array.isArray(element.states)) {
            return [];
        }
        return uniqueTargets(element.states.flatMap((state: any) => {
            const stateTargets: string[] = [];
            if (typeof state?.target === "string") {
                stateTargets.push(state.target);
            }
            stateTargets.push(...readScreenTargetsFromAction(state?.action));
            return stateTargets;
        }));
    }

    if (elementType === "prompt") {
        const promptTargets = [
            ...readScreenTargetsFromAction(element.inputAction),
            ...(Array.isArray(element.commands)
                ? element.commands.flatMap((command: any) => readScreenTargetsFromAction(command?.action))
                : []),
        ];
        return uniqueTargets(promptTargets);
    }

    if (elementType === "reportcomposer") {
        return uniqueTargets([element.saveTarget, element.cancelTarget]);
    }

    return [];
};

const buildScreenConnectionMap = (script: any): { screenIds: string[]; connectionMap: Record<string, string[]> } => {
    const screens = Array.isArray(script?.screens) ? script.screens : [];
    const screenIds: string[] = screens
        .map((screen: any): string => (typeof screen?.id === "string" ? screen.id : ""))
        .filter((id: string) => id.length > 0);
    const idSet = new Set(screenIds);

    const connectionMap: Record<string, string[]> = {};
    screens.forEach((screen: any) => {
        if (!screen || typeof screen !== "object" || typeof screen.id !== "string" || !screen.id.length) {
            return;
        }

        const rawTargets: string[] = [];
        if (typeof screen?.onDone?.target === "string") {
            rawTargets.push(screen.onDone.target);
        }
        if (Array.isArray(screen.content)) {
            screen.content.forEach((element: any) => {
                rawTargets.push(...readScreenTargetsFromElement(element));
            });
        }

        connectionMap[screen.id] = uniqueTargets(rawTargets).filter((target) => idSet.has(target));
    });

    screenIds.forEach((id) => {
        if (!connectionMap[id]) {
            connectionMap[id] = [];
        }
    });

    return {
        screenIds,
        connectionMap,
    };
};

const buildSchemaTreeLines = (rootId: string, screenIds: string[], connectionMap: Record<string, string[]>): string[] => {
    if (!screenIds.length) {
        return ["No screens available."];
    }

    const firstRoot = screenIds.includes(rootId) ? rootId : screenIds[0];
    const lines: string[] = [firstRoot];
    const globalSeen = new Set<string>([firstRoot]);
    const visited = new Set<string>([firstRoot]);

    const drawChildren = (nodeId: string, prefix: string, ancestors: Set<string>) => {
        const children = connectionMap[nodeId] || [];
        children.forEach((childId, index) => {
            const isLast = index === children.length - 1;
            const connector = `${prefix}${isLast ? "└─ " : "├─ "}`;

            if (ancestors.has(childId)) {
                lines.push(`${connector}${childId} (cycle)`);
                return;
            }

            if (globalSeen.has(childId)) {
                lines.push(`${connector}${childId} (seen)`);
                return;
            }

            lines.push(`${connector}${childId}`);
            globalSeen.add(childId);
            visited.add(childId);
            const nextAncestors = new Set(ancestors);
            nextAncestors.add(childId);
            drawChildren(childId, `${prefix}${isLast ? "   " : "│  "}`, nextAncestors);
        });
    };

    drawChildren(firstRoot, "", new Set([firstRoot]));

    const disconnected = screenIds.filter((id) => !visited.has(id));
    if (disconnected.length) {
        lines.push("");
        lines.push("Unreached from selected root:");
        disconnected.forEach((id) => {
            lines.push(id);
            globalSeen.add(id);
            visited.add(id);
            drawChildren(id, "", new Set([id]));
        });
    }

    return lines;
};

const getInitialSelectedScreenId = (initialScript: any): string => {
    const normalized = ensureScriptShape(initialScript);
    const preferred = normalized?.config?.previewStartScreen;
    if (typeof preferred === "string" && preferred.length) {
        const exists = normalized.screens.some((screen: any) => screen?.id === preferred);
        if (exists) {
            return preferred;
        }
    }
    return normalized.screens[0]?.id || "";
};

const getInitialSelectedElementIndex = (initialScript: any, screenId: string): number => {
    const normalized = ensureScriptShape(initialScript);
    const selectedScreen = normalized.screens.find((screen: any) => screen?.id === screenId);
    const maxIndex = Math.max(0, ((selectedScreen?.content?.length || 1) - 1));
    const preferred = normalized?.config?.previewSelectedElementIndex;
    if (typeof preferred !== "number" || !Number.isFinite(preferred)) {
        return 0;
    }
    return Math.min(maxIndex, Math.max(0, Math.floor(preferred)));
};

const getClassNameOptionsForElementType = (elementType: string): string[] => {
    switch (elementType) {
        case "text":
            return TEXT_CLASSNAME_OPTIONS;

        case "link":
        case "href":
            return LINK_CLASSNAME_OPTIONS;

        case "prompt":
            return PROMPT_CLASSNAME_OPTIONS;

        case "toggle":
        case "list":
            return TOGGLE_LIST_CLASSNAME_OPTIONS;

        case "bitmap":
        case "image":
            return BITMAP_CLASSNAME_OPTIONS;

        default:
            return [""];
    }
};

const toCreatorSelectOptions = (options: string[], emptyLabel: string): CreatorSelectOption[] => {
    return options.map((option) => ({
        value: option,
        label: option || emptyLabel,
    }));
};

const getElementListLabel = (entry: any): string => {
    if (typeof entry === "string") {
        return `text line: ${entry.slice(0, 24) || "(empty)"}`;
    }

    if (!entry || typeof entry !== "object") {
        return "object: (invalid)";
    }

    const type = (typeof entry.type === "string" ? entry.type : "object").toLowerCase();
    const headline = (entry.text || entry.prompt || entry.src || entry.id || "").toString().slice(0, 24) || "(empty)";
    const className = (typeof entry.className === "string" ? entry.className.trim() : "");

    if (type === "text" && className.length) {
        return `${className} text: ${headline}`;
    }

    if ((type === "link" || type === "href" || type === "prompt" || type === "toggle" || type === "list" || type === "bitmap" || type === "image")
        && className.length) {
        return `${className} ${type}: ${headline}`;
    }

    return `${type}: ${headline}`;
};

const ScriptCreator: FC<ScriptCreatorProps> = ({ initialScript, onApply, onPreview, onClose }) => {
    const initialSelectedScreenId = getInitialSelectedScreenId(initialScript);
    const [script, setScript] = useState<any>(() => ensureScriptShape(initialScript));
    const [selectedScreenId, setSelectedScreenId] = useState<string>(() => initialSelectedScreenId);
    const [schemaRootId, setSchemaRootId] = useState<string>(() => initialSelectedScreenId);
    const [selectedElementIndex, setSelectedElementIndex] = useState<number>(() => {
        return getInitialSelectedElementIndex(initialScript, initialSelectedScreenId);
    });
    const [newElementType, setNewElementType] = useState<AddableElementType>("plainText");
    const [rawElementError, setRawElementError] = useState<string | null>(null);
    const [elementEditorMode, setElementEditorMode] = useState<"fields" | "raw">("fields");
    const [activeView, setActiveView] = useState<"editor" | "schema">("editor");
    const [creatorColorMode, setCreatorColorMode] = useState<CreatorColorMode>("theme");
    const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
    const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const resizePointerIdRef = useRef<number | null>(null);
    const resizeStartXRef = useRef<number>(0);
    const resizeStartWidthRef = useRef<number>(DEFAULT_SIDEBAR_WIDTH);

    const handleEditorMarkdownShortcut = (event: React.KeyboardEvent<HTMLElement>): void => {
        if (event.defaultPrevented || event.isComposing) {
            return;
        }

        const usesShortcutModifier = event.ctrlKey || event.metaKey;
        if (!usesShortcutModifier || event.altKey) {
            return;
        }

        const wrapper = MARKDOWN_SHORTCUT_WRAPPERS[event.key.toLowerCase()];
        if (!wrapper) {
            return;
        }

        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
            return;
        }

        if (target instanceof HTMLInputElement) {
            const inputType = (target.type || "text").toLowerCase();
            const isTextInput = inputType === "text"
                || inputType === "search"
                || inputType === "url"
                || inputType === "email"
                || inputType === "tel"
                || inputType === "password";
            if (!isTextInput) {
                return;
            }
        }

        if (target.disabled || target.readOnly) {
            return;
        }

        if (elementEditorMode === "raw" && target.closest(".script-creator__element-editor")) {
            return;
        }

        event.preventDefault();

        const value = target.value || "";
        const selectionStart = typeof target.selectionStart === "number" ? target.selectionStart : value.length;
        const selectionEnd = typeof target.selectionEnd === "number" ? target.selectionEnd : selectionStart;
        const selectedText = value.slice(selectionStart, selectionEnd);
        const insertedText = `${wrapper}${selectedText}${wrapper}`;
        const nextValue = `${value.slice(0, selectionStart)}${insertedText}${value.slice(selectionEnd)}`;

        const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
        if (valueSetter) {
            valueSetter.call(target, nextValue);
        } else {
            target.value = nextValue;
        }

        target.dispatchEvent(new Event("input", { bubbles: true }));

        const nextSelectionStart = selectionStart + wrapper.length;
        const nextSelectionEnd = nextSelectionStart + selectedText.length;
        window.requestAnimationFrame(() => {
            if (document.activeElement === target) {
                target.setSelectionRange(nextSelectionStart, nextSelectionEnd);
            }
        });
    };

    const selectedScreen = useMemo(() => {
        return script.screens.find((screen: any) => screen.id === selectedScreenId) || null;
    }, [script, selectedScreenId]);
    const selectedScreenIndex = script.screens.findIndex((screen: any) => screen.id === selectedScreenId);
    const canMoveScreenUp = selectedScreenIndex > 0;
    const canMoveScreenDown = selectedScreenIndex >= 0 && selectedScreenIndex < (script.screens.length - 1);

    const selectedElement = selectedScreen?.content?.[selectedElementIndex];
    const canMoveElementUp = selectedElementIndex > 0;
    const canMoveElementDown = !!selectedScreen
        && selectedElementIndex >= 0
        && selectedElementIndex < (selectedScreen.content.length - 1);
    const canDeleteElement = !!selectedScreen && selectedScreen.content.length > 0;
    const selectedElementType = (
        selectedElement
        && typeof selectedElement === "object"
        && typeof selectedElement.type === "string"
    ) ? selectedElement.type.toLowerCase() : "";
    const selectedElementIsCycler = selectedElementType === "toggle" || selectedElementType === "list";
    const selectedCyclerStates = useMemo(() => {
        if (!selectedElementIsCycler) {
            return [];
        }
        const fallbackLabel = selectedElementType === "list" ? "ITEM" : "OPTION";
        return normalizeCyclerStates((selectedElement as any)?.states, fallbackLabel);
    }, [selectedElement, selectedElementIsCycler, selectedElementType]);
    const classNameOptions = useMemo(() => {
        return getClassNameOptionsForElementType(selectedElementType);
    }, [selectedElementType]);
    const schemaData = useMemo(() => buildScreenConnectionMap(script), [script]);
    const effectiveSchemaRootId = useMemo(() => {
        if (!schemaData.screenIds.length) {
            return "";
        }
        if (schemaRootId && schemaData.screenIds.includes(schemaRootId)) {
            return schemaRootId;
        }
        if (selectedScreenId && schemaData.screenIds.includes(selectedScreenId)) {
            return selectedScreenId;
        }
        return schemaData.screenIds[0];
    }, [schemaData, schemaRootId, selectedScreenId]);
    const schemaLines = useMemo(() => {
        return buildSchemaTreeLines(effectiveSchemaRootId, schemaData.screenIds, schemaData.connectionMap);
    }, [effectiveSchemaRootId, schemaData]);
    const classNameSelectOptions = useMemo(() => {
        return toCreatorSelectOptions(classNameOptions, "(none)");
    }, [classNameOptions]);
    const cyclerStateClassNameSelectOptions = useMemo(() => {
        return toCreatorSelectOptions(TOGGLE_LIST_CLASSNAME_OPTIONS, "(none)");
    }, []);
    const schemaRootSelectOptions = useMemo(() => {
        return schemaData.screenIds.map((id) => ({ value: id, label: id }));
    }, [schemaData.screenIds]);

    const clampSidebarWidth = (nextWidth: number): number => {
        const bodyWidth = bodyRef.current?.clientWidth || 0;
        const maxWidth = bodyWidth
            ? Math.max(MIN_SIDEBAR_WIDTH, bodyWidth - MIN_EDITOR_WIDTH - RESIZE_HANDLE_WIDTH)
            : nextWidth;
        return Math.max(MIN_SIDEBAR_WIDTH, Math.min(nextWidth, maxWidth));
    };

    const updateScript = (updater: (prev: any) => any) => {
        setScript((prev: any) => ensureScriptShape(updater(prev)));
    };

    const updateConfig = (key: string, value: string) => {
        updateScript((prev) => ({
            ...prev,
            config: {
                ...prev.config,
                [key]: value,
            },
        }));
    };

    const updateScreen = (patch: Record<string, any>) => {
        if (!selectedScreen) {
            return;
        }

        updateScript((prev) => ({
            ...prev,
            screens: prev.screens.map((screen: any) => {
                if (screen.id !== selectedScreen.id) {
                    return screen;
                }
                return {
                    ...screen,
                    ...patch,
                };
            }),
        }));
    };

    const addScreen = () => {
        const newId = nextScreenId(script.screens);
        updateScript((prev) => ({
            ...prev,
            screens: [
                ...prev.screens,
                {
                    id: newId,
                    type: "screen",
                    content: [""],
                },
            ],
        }));
        setSelectedScreenId(newId);
        setSelectedElementIndex(0);
    };

    const removeScreen = () => {
        if (!selectedScreen || script.screens.length <= 1) {
            return;
        }

        const nextScreens = script.screens.filter((screen: any) => screen.id !== selectedScreen.id);
        updateScript((prev) => ({
            ...prev,
            screens: prev.screens.filter((screen: any) => screen.id !== selectedScreen.id),
        }));
        setSelectedScreenId(nextScreens[0].id);
        setSelectedElementIndex(0);
    };

    const moveScreen = (direction: -1 | 1) => {
        updateScript((prev) => {
            const from = prev.screens.findIndex((screen: any) => screen.id === selectedScreenId);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= prev.screens.length) {
                return prev;
            }

            const nextScreens = [...prev.screens];
            [nextScreens[from], nextScreens[to]] = [nextScreens[to], nextScreens[from]];
            return {
                ...prev,
                screens: nextScreens,
            };
        });
    };

    const addElement = () => {
        if (!selectedScreen) {
            return;
        }

        let element: any = "";
        let nextDialogs = script.dialogs;
        switch (newElementType) {
            case "plainText":
                element = "";
                break;

            case "text":
                element = {
                    type: "text",
                    text: "New text",
                };
                break;

            case "alertText":
                element = {
                    type: "text",
                    text: "Alert message",
                    className: "alert",
                };
                break;

            case "noticeText":
                element = {
                    type: "text",
                    text: "Notice message",
                    className: "notice",
                };
                break;

            case "emphasisText":
                element = {
                    type: "text",
                    text: "Emphasis text",
                    className: "emphasis",
                };
                break;

            case "systemText":
                element = {
                    type: "text",
                    text: "System message",
                    className: "system",
                };
                break;

            case "link":
                element = {
                    type: "link",
                    text: "> NEW BUTTON",
                    target: selectedScreen.id,
                };
                break;

            case "bitmap":
                element = {
                    type: "bitmap",
                    src: "https://",
                    alt: "",
                };
                break;

            case "prompt":
                element = {
                    type: "prompt",
                    prompt: "> ",
                    commands: [
                        {
                            command: "back",
                            action: {
                                type: "link",
                                target: selectedScreen.id,
                            },
                        },
                    ],
                };
                break;

            case "toggle":
                element = {
                    type: "toggle",
                    states: [
                        { active: true, text: "> OPTION 1" },
                        { active: false, text: "> OPTION 2" },
                    ],
                };
                break;

            case "list":
                element = {
                    type: "list",
                    states: [
                        { active: true, text: "> ITEM 1" },
                        { active: false, text: "> ITEM 2" },
                    ],
                };
                break;

            case "reportComposer":
                element = {
                    type: "reportComposer",
                    template: "",
                    saveTarget: selectedScreen.id,
                    cancelTarget: selectedScreen.id,
                };
                break;

            case "dialogLink": {
                const dialogId = nextDialogId(script.dialogs);
                nextDialogs = [
                    ...script.dialogs,
                    {
                        id: dialogId,
                        type: "alert",
                        content: [
                            "New dialog created from Script Creator.",
                            "Edit this content in raw JSON if needed.",
                        ],
                    },
                ];
                element = {
                    type: "link",
                    text: "> OPEN DIALOG",
                    target: [
                        {
                            type: "dialog",
                            target: dialogId,
                            shiftKey: false,
                        },
                    ],
                };
                break;
            }

            default:
                element = "";
                break;
        }

        const nextIndex = selectedScreen.content.length;
        updateScript((prev) => ({
            ...prev,
            dialogs: nextDialogs,
            screens: prev.screens.map((screen: any) => {
                if (screen.id !== selectedScreen.id) {
                    return screen;
                }
                return {
                    ...screen,
                    content: [...selectedScreen.content, element],
                };
            }),
        }));
        setSelectedElementIndex(nextIndex);
        setRawElementError(null);
    };

    const removeElement = () => {
        if (!selectedScreen || selectedElementIndex < 0 || selectedElementIndex >= selectedScreen.content.length) {
            return;
        }

        const nextContent = selectedScreen.content.filter((_: any, index: number) => index !== selectedElementIndex);
        updateScreen({
            content: nextContent,
        });
        setSelectedElementIndex(Math.max(0, selectedElementIndex - 1));
        setRawElementError(null);
    };

    const moveElement = (direction: -1 | 1) => {
        if (!selectedScreen) {
            return;
        }

        const from = selectedElementIndex;
        const to = from + direction;
        if (from < 0 || to < 0 || to >= selectedScreen.content.length) {
            return;
        }

        const next = [...selectedScreen.content];
        [next[from], next[to]] = [next[to], next[from]];
        updateScreen({ content: next });
        setSelectedElementIndex(to);
    };

    const updateElement = (nextElement: any) => {
        if (!selectedScreen) {
            return;
        }

        const nextContent = selectedScreen.content.map((entry: any, index: number) => {
            return index === selectedElementIndex ? nextElement : entry;
        });

        updateScreen({ content: nextContent });
    };

    const updateCyclerStates = (updater: (prevStates: any[]) => any[]) => {
        if (!selectedElement || typeof selectedElement !== "object" || !selectedElementIsCycler) {
            return;
        }

        const fallbackLabel = selectedElementType === "list" ? "ITEM" : "OPTION";
        const currentStates = normalizeCyclerStates((selectedElement as any).states, fallbackLabel);
        const candidate = updater(currentStates);
        const nextStates = normalizeCyclerStates(candidate, fallbackLabel);
        updateElement({
            ...selectedElement,
            states: nextStates,
        });
    };

    const addCyclerState = () => {
        const label = selectedElementType === "list" ? "ITEM" : "OPTION";
        updateCyclerStates((prevStates) => {
            const nextIndex = prevStates.length + 1;
            return [
                ...prevStates,
                {
                    text: `> ${label} ${nextIndex}`,
                    active: false,
                },
            ];
        });
    };

    const removeCyclerState = (index: number) => {
        updateCyclerStates((prevStates) => {
            if (prevStates.length <= 1) {
                return prevStates;
            }
            return prevStates.filter((_: any, stateIndex: number) => stateIndex !== index);
        });
    };

    const moveCyclerState = (index: number, direction: -1 | 1) => {
        updateCyclerStates((prevStates) => {
            const toIndex = index + direction;
            if (index < 0 || toIndex < 0 || index >= prevStates.length || toIndex >= prevStates.length) {
                return prevStates;
            }

            const nextStates = [...prevStates];
            [nextStates[index], nextStates[toIndex]] = [nextStates[toIndex], nextStates[index]];
            return nextStates;
        });
    };

    const renameScreenId = (nextIdRaw: string) => {
        if (!selectedScreen) {
            return;
        }

        const nextId = nextIdRaw.trim();
        if (!nextId || nextId === selectedScreen.id) {
            return;
        }

        const hasDuplicate = script.screens.some((screen: any) => {
            return screen.id === nextId && screen.id !== selectedScreen.id;
        });
        if (hasDuplicate) {
            return;
        }

        const previousId = selectedScreen.id;
        updateScript((prev) => ({
            ...prev,
            screens: prev.screens.map((screen: any) => {
                const updatedScreen = screen.id === previousId
                    ? {
                        ...screen,
                        id: nextId,
                    }
                    : screen;

                return {
                    ...updatedScreen,
                    onDone: updatedScreen.onDone?.target === previousId
                        ? { ...updatedScreen.onDone, target: nextId }
                        : updatedScreen.onDone,
                    content: Array.isArray(updatedScreen.content)
                        ? updatedScreen.content.map((entry: any) => {
                            if (!entry || typeof entry !== "object") {
                                return entry;
                            }
                            if (entry.type !== "link" && entry.type !== "href") {
                                return entry;
                            }
                            if (typeof entry.target !== "string" || entry.target !== previousId) {
                                return entry;
                            }
                            return {
                                ...entry,
                                target: nextId,
                            };
                        })
                        : updatedScreen.content,
                };
            }),
        }));
        setSelectedScreenId(nextId);
    };

    const applyScript = () => {
        onApply(cloneJson(script));
    };

    const previewScript = () => {
        if (!selectedScreenId) {
            return;
        }
        onPreview(cloneJson(script), selectedScreenId, selectedElementIndex);
    };

    const startNewScript = () => {
        const freshScript = ensureScriptShape(createDefaultScript());
        const firstScreenId = freshScript.screens[0]?.id || "";

        setScript(freshScript);
        setSelectedScreenId(firstScreenId);
        setSchemaRootId(firstScreenId);
        setSelectedElementIndex(0);
        setElementEditorMode("fields");
        setRawElementError(null);
        setActiveView("editor");
    };

    const copyJson = async () => {
        const text = JSON.stringify(script, null, 2);
        if (!navigator.clipboard?.writeText) {
            return;
        }
        await navigator.clipboard.writeText(text);
    };

    const downloadJson = () => {
        const text = JSON.stringify(script, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const name = (script.config?.name || "script").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");
        anchor.href = url;
        anchor.download = `${name || "script"}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleSidebarResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        resizePointerIdRef.current = event.pointerId;
        resizeStartXRef.current = event.clientX;
        resizeStartWidthRef.current = sidebarWidth;
        setIsResizingSidebar(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleSidebarResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (resizePointerIdRef.current !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - resizeStartXRef.current;
        setSidebarWidth(clampSidebarWidth(resizeStartWidthRef.current + deltaX));
    };

    const stopSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
        if (resizePointerIdRef.current !== event.pointerId) {
            return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        resizePointerIdRef.current = null;
        setIsResizingSidebar(false);
    };

    const handleSidebarResizeLostPointerCapture = () => {
        resizePointerIdRef.current = null;
        setIsResizingSidebar(false);
    };

    return (
        <section
            className={`script-creator script-creator--${creatorColorMode}${isResizingSidebar ? " script-creator--resizing" : ""}`}
            onKeyDown={handleEditorMarkdownShortcut}
            onClick={onClose}
        >
            <div className="script-creator__panel" onClick={(e) => e.stopPropagation()}>
                <div className="script-creator__header">
                    <strong>Script Creator</strong>
                    <div className="script-creator__header-actions">
                        <button
                            className="script-creator__btn"
                            onClick={startNewScript}
                        >
                            [NEW SCRIPT]
                        </button>
                        <button
                            className="script-creator__btn"
                            onClick={() => setCreatorColorMode((prev) => getNextCreatorColorMode(prev))}
                        >
                            [MODE: {CREATOR_COLOR_MODE_LABELS[creatorColorMode]}]
                        </button>
                        <button
                            className={"script-creator__btn" + (activeView === "editor" ? " script-creator__btn--active" : "")}
                            onClick={() => setActiveView("editor")}
                        >
                            [EDITOR]
                        </button>
                        <button
                            className={"script-creator__btn" + (activeView === "schema" ? " script-creator__btn--active" : "")}
                            onClick={() => {
                                setSchemaRootId(selectedScreenId);
                                setActiveView("schema");
                            }}
                        >
                            [SCHEMA]
                        </button>
                        <button
                            className="script-creator__btn"
                            onClick={previewScript}
                        >
                            [PREVIEW]
                        </button>
                        <button className="script-creator__btn" onClick={onClose}>[CLOSE]</button>
                    </div>
                </div>

                <div
                    ref={bodyRef}
                    className={"script-creator__body" + (activeView === "schema" ? " script-creator__body--single" : "")}
                    style={activeView === "editor"
                        ? ({ "--creator-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties)
                        : undefined}
                >
                    {activeView === "editor" && (
                    <aside className="script-creator__sidebar">
                        <div className="script-creator__meta-fields">
                            <label className="script-creator__field">
                                <span>Name</span>
                                <input
                                    value={script.config?.name || ""}
                                    onChange={(e) => updateConfig("name", e.target.value)}
                                />
                            </label>

                            <label className="script-creator__field">
                                <span>Author</span>
                                <input
                                    value={script.config?.author || ""}
                                    onChange={(e) => updateConfig("author", e.target.value)}
                                />
                            </label>
                        </div>

                        <div className="script-creator__list-header">
                            <span>Screens</span>
                            <button className="script-creator__btn" onClick={addScreen}>[+ SCREEN]</button>
                        </div>

                        <div className="script-creator__list script-creator__list--screens">
                            {script.screens.map((screen: any) => (
                                <button
                                    key={screen.id}
                                    className={"script-creator__list-item" + (screen.id === selectedScreenId ? " script-creator__list-item--active" : "")}
                                    onClick={() => {
                                        setSelectedScreenId(screen.id);
                                        setSelectedElementIndex(0);
                                        setRawElementError(null);
                                    }}
                                >
                                    {screen.id}
                                </button>
                            ))}
                        </div>

                        <div className="script-creator__actions script-creator__actions--screen-controls">
                            <button className="script-creator__btn" onClick={() => moveScreen(-1)} disabled={!canMoveScreenUp}>[MOVE UP]</button>
                            <button className="script-creator__btn" onClick={() => moveScreen(1)} disabled={!canMoveScreenDown}>[MOVE DOWN]</button>
                            <button className="script-creator__btn" onClick={removeScreen} disabled={script.screens.length <= 1}>[DELETE]</button>
                        </div>
                    </aside>
                    )}

                    {activeView === "editor" && (
                    <div
                        className={"script-creator__resize-handle" + (isResizingSidebar ? " script-creator__resize-handle--active" : "")}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                        onPointerDown={handleSidebarResizePointerDown}
                        onPointerMove={handleSidebarResizePointerMove}
                        onPointerUp={stopSidebarResize}
                        onPointerCancel={stopSidebarResize}
                        onLostPointerCapture={handleSidebarResizeLostPointerCapture}
                    />
                    )}

                    {activeView === "editor" && (
                    <main className="script-creator__editor">
                        {selectedScreen && (
                            <div className="script-creator__editor-content">
                                <div className="script-creator__row">
                                    <label className="script-creator__field">
                                        <span>Screen ID</span>
                                        <input
                                            value={selectedScreen.id}
                                            onChange={(e) => renameScreenId(e.target.value)}
                                        />
                                    </label>

                                    <label className="script-creator__field">
                                        <span>Type</span>
                                        <CreatorSelect
                                            value={selectedScreen.type}
                                            options={SCREEN_TYPE_OPTIONS}
                                            fallbackLabel={selectedScreen.type}
                                            onChange={(nextType) => updateScreen({ type: nextType })}
                                        />
                                    </label>
                                </div>

                                <div className="script-creator__list-header">
                                    <span>Elements</span>
                                    <div className="script-creator__actions">
                                        <CreatorSelect
                                            className="script-creator-select--actions"
                                            value={newElementType}
                                            options={ADDABLE_ELEMENT_OPTIONS}
                                            onChange={(nextType) => setNewElementType(nextType as AddableElementType)}
                                        />
                                        <button className="script-creator__btn" onClick={addElement}>[ADD ELEMENT]</button>
                                        <button
                                            className="script-creator__btn"
                                            onClick={() => setElementEditorMode((prev) => prev === "fields" ? "raw" : "fields")}
                                        >
                                            {elementEditorMode === "fields" ? "[VIEW RAW JSON]" : "[VIEW FIELDS]"}
                                        </button>
                                    </div>
                                </div>

                                <div className="script-creator__element-layout">
                                    <div className="script-creator__element-list-panel">
                                        <div className="script-creator__list script-creator__list--elements">
                                            {selectedScreen.content.map((entry: any, index: number) => {
                                                const label = getElementListLabel(entry);
                                                return (
                                                    <button
                                                        key={`${selectedScreen.id}-${index}`}
                                                        className={"script-creator__list-item" + (index === selectedElementIndex ? " script-creator__list-item--active" : "")}
                                                        onClick={() => {
                                                            setSelectedElementIndex(index);
                                                            setRawElementError(null);
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="script-creator__actions script-creator__actions--element-controls">
                                            <button
                                                className="script-creator__btn"
                                                onClick={() => moveElement(-1)}
                                                disabled={!canMoveElementUp}
                                            >
                                                [MOVE UP]
                                            </button>
                                            <button
                                                className="script-creator__btn"
                                                onClick={() => moveElement(1)}
                                                disabled={!canMoveElementDown}
                                            >
                                                [MOVE DOWN]
                                            </button>
                                            <button
                                                className="script-creator__btn"
                                                onClick={removeElement}
                                                disabled={!canDeleteElement}
                                            >
                                                [DELETE]
                                            </button>
                                        </div>
                                    </div>

                                    <div className="script-creator__element-editor">
                                        {elementEditorMode === "fields" && (
                                            <>
                                                {typeof selectedElement === "string" && (
                                                    <>
                                                        <label className="script-creator__field script-creator__field--fill">
                                                            <span>Text</span>
                                                            <textarea
                                                                className="script-creator__textarea-fill"
                                                                value={selectedElement}
                                                                onChange={(e) => updateElement(e.target.value)}
                                                            />
                                                            <small className="script-creator__markdown-hint">
                                                                Markdown: `#`, `**bold**`, `*italic*`, `++underline++`, `[label](url)`, `- bullets`, `&gt; quote`, `---`
                                                            </small>
                                                        </label>

                                                        <label className="script-creator__field">
                                                            <span>Class Name (Apply Style)</span>
                                                            <CreatorSelect
                                                                value=""
                                                                options={TEXT_LINE_STYLE_OPTIONS}
                                                                onChange={(nextClassName) => {
                                                                    if (!nextClassName.length) {
                                                                        return;
                                                                    }
                                                                    updateElement({
                                                                        type: "text",
                                                                        text: selectedElement,
                                                                        className: nextClassName,
                                                                    });
                                                                }}
                                                            />
                                                        </label>
                                                    </>
                                                )}

                                                {selectedElement && typeof selectedElement === "object" && (selectedElement.type === "link" || selectedElement.type === "href") && (
                                                    <>
                                                        <label className="script-creator__field">
                                                            <span>Button Text</span>
                                                            <input
                                                                value={selectedElement.text || ""}
                                                                onChange={(e) => updateElement({ ...selectedElement, text: e.target.value })}
                                                            />
                                                        </label>

                                                        <label className="script-creator__field">
                                                            <span>Target Screen</span>
                                                            <input
                                                                value={selectedElement.target || ""}
                                                                onChange={(e) => updateElement({ ...selectedElement, target: e.target.value })}
                                                            />
                                                        </label>
                                                    </>
                                                )}

                                                {selectedElement && typeof selectedElement === "object" && selectedElement.type === "text" && (
                                                    <label className="script-creator__field script-creator__field--fill">
                                                        <span>Text Content</span>
                                                        <textarea
                                                            className="script-creator__textarea-fill"
                                                            value={selectedElement.text || ""}
                                                            onChange={(e) => updateElement({ ...selectedElement, text: e.target.value })}
                                                        />
                                                        <small className="script-creator__markdown-hint">
                                                            Markdown: `#`, `**bold**`, `*italic*`, `++underline++`, `[label](url)`, `- bullets`, `&gt; quote`, `---`
                                                        </small>
                                                    </label>
                                                )}

                                                {selectedElement && typeof selectedElement === "object" && (selectedElement.type === "toggle" || selectedElement.type === "list") && (
                                                    <div className="script-creator__cycler">
                                                        <div className="script-creator__list-header">
                                                            <span>States</span>
                                                            <button className="script-creator__btn" onClick={addCyclerState}>[+ STATE]</button>
                                                        </div>

                                                        <div className="script-creator__cycler-list">
                                                            {selectedCyclerStates.map((state: any, stateIndex: number) => {
                                                                const behavior = getCyclerStateBehavior(state);
                                                                return (
                                                                    <div key={`state-${stateIndex}`} className="script-creator__cycler-state">
                                                                        <label className="script-creator__field">
                                                                            <span>Text</span>
                                                                            <input
                                                                                value={state.text || ""}
                                                                                onChange={(e) => {
                                                                                    const nextText = e.target.value;
                                                                                    updateCyclerStates((prevStates) => {
                                                                                        return prevStates.map((entry: any, index: number) => {
                                                                                            return index === stateIndex
                                                                                                ? { ...entry, text: nextText }
                                                                                                : entry;
                                                                                        });
                                                                                    });
                                                                                }}
                                                                            />
                                                                        </label>

                                                                        <div className="script-creator__cycler-state-row">
                                                                            <label className="script-creator__field">
                                                                                <span>Behavior</span>
                                                                                <CreatorSelect
                                                                                    value={behavior}
                                                                                    options={CYCLER_STATE_BEHAVIOR_OPTIONS}
                                                                                    onChange={(nextBehaviorRaw) => {
                                                                                        const nextBehavior = nextBehaviorRaw as CyclerStateBehavior;
                                                                                        updateCyclerStates((prevStates) => {
                                                                                            return prevStates.map((entry: any, index: number) => {
                                                                                                if (index !== stateIndex) {
                                                                                                    return entry;
                                                                                                }

                                                                                                const nextState: any = { ...entry };
                                                                                                if (nextBehavior === "none") {
                                                                                                    delete nextState.target;
                                                                                                    delete nextState.action;
                                                                                                    return nextState;
                                                                                                }

                                                                                                if (typeof nextState.target !== "string") {
                                                                                                    nextState.target = selectedScreen?.id || "";
                                                                                                }

                                                                                                if (nextBehavior === "link") {
                                                                                                    delete nextState.action;
                                                                                                    return nextState;
                                                                                                }

                                                                                                if (typeof nextState.action !== "string" || !nextState.action.trim().length) {
                                                                                                    nextState.action = "resetState";
                                                                                                }

                                                                                                return nextState;
                                                                                            });
                                                                                        });
                                                                                    }}
                                                                                />
                                                                            </label>

                                                                            <label className="script-creator__field">
                                                                                <span>Class Name</span>
                                                                                <CreatorSelect
                                                                                    value={state.className || ""}
                                                                                    options={cyclerStateClassNameSelectOptions}
                                                                                    onChange={(nextClassName) => {
                                                                                        updateCyclerStates((prevStates) => {
                                                                                            return prevStates.map((entry: any, index: number) => {
                                                                                                if (index !== stateIndex) {
                                                                                                    return entry;
                                                                                                }

                                                                                                if (!nextClassName.length) {
                                                                                                    const nextState = { ...entry };
                                                                                                    delete nextState.className;
                                                                                                    return nextState;
                                                                                                }

                                                                                                return {
                                                                                                    ...entry,
                                                                                                    className: nextClassName,
                                                                                                };
                                                                                            });
                                                                                        });
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                        </div>

                                                                        {(behavior === "link" || behavior === "action") && (
                                                                            <label className="script-creator__field">
                                                                                <span>Target Screen</span>
                                                                                <input
                                                                                    value={state.target || ""}
                                                                                    onChange={(e) => {
                                                                                        const nextTarget = e.target.value;
                                                                                        updateCyclerStates((prevStates) => {
                                                                                            return prevStates.map((entry: any, index: number) => {
                                                                                                return index === stateIndex
                                                                                                    ? { ...entry, target: nextTarget }
                                                                                                    : entry;
                                                                                            });
                                                                                        });
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                        )}

                                                                        {behavior === "action" && (
                                                                            <label className="script-creator__field">
                                                                                <span>Action</span>
                                                                                <input
                                                                                    value={state.action || ""}
                                                                                    onChange={(e) => {
                                                                                        const nextAction = e.target.value;
                                                                                        updateCyclerStates((prevStates) => {
                                                                                            return prevStates.map((entry: any, index: number) => {
                                                                                                return index === stateIndex
                                                                                                    ? { ...entry, action: nextAction }
                                                                                                    : entry;
                                                                                            });
                                                                                        });
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                        )}

                                                                        <div className="script-creator__actions script-creator__actions--cycler-state">
                                                                            <button
                                                                                className="script-creator__btn"
                                                                                onClick={() => {
                                                                                    updateCyclerStates((prevStates) => {
                                                                                        return prevStates.map((entry: any, index: number) => ({
                                                                                            ...entry,
                                                                                            active: index === stateIndex,
                                                                                        }));
                                                                                    });
                                                                                }}
                                                                                disabled={!!state.active}
                                                                            >
                                                                                [SET ACTIVE]
                                                                            </button>
                                                                            <button
                                                                                className="script-creator__btn"
                                                                                onClick={() => moveCyclerState(stateIndex, -1)}
                                                                                disabled={stateIndex === 0}
                                                                            >
                                                                                [UP]
                                                                            </button>
                                                                            <button
                                                                                className="script-creator__btn"
                                                                                onClick={() => moveCyclerState(stateIndex, 1)}
                                                                                disabled={stateIndex === selectedCyclerStates.length - 1}
                                                                            >
                                                                                [DOWN]
                                                                            </button>
                                                                            <button
                                                                                className="script-creator__btn"
                                                                                onClick={() => removeCyclerState(stateIndex)}
                                                                                disabled={selectedCyclerStates.length <= 1}
                                                                            >
                                                                                [DELETE]
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {selectedElement && typeof selectedElement === "object" && (selectedElement.type === "bitmap" || selectedElement.type === "image") && (
                                                    <>
                                                        <label className="script-creator__field">
                                                            <span>Source Path</span>
                                                            <input
                                                                value={selectedElement.src || ""}
                                                                onChange={(e) => updateElement({ ...selectedElement, src: e.target.value })}
                                                            />
                                                        </label>

                                                        <label className="script-creator__field">
                                                            <span>Alt Text</span>
                                                            <input
                                                                value={selectedElement.alt || ""}
                                                                onChange={(e) => updateElement({ ...selectedElement, alt: e.target.value })}
                                                            />
                                                        </label>

                                                        <label className="script-creator__field">
                                                            <span>Fill Width</span>
                                                            <CreatorSelect
                                                                value={selectedElement.fillWidth ? "true" : "false"}
                                                                options={BOOLEAN_OPTIONS}
                                                                onChange={(nextValue) => updateElement({
                                                                    ...selectedElement,
                                                                    fillWidth: nextValue === "true",
                                                                })}
                                                            />
                                                        </label>

                                                        <label className="script-creator__field">
                                                            <span>Scale</span>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                min="0"
                                                                value={selectedElement.scale ?? ""}
                                                                onChange={(e) => {
                                                                    const nextValue = e.target.value;
                                                                    if (!nextValue.length) {
                                                                        const nextElement = { ...selectedElement };
                                                                        delete nextElement.scale;
                                                                        updateElement(nextElement);
                                                                        return;
                                                                    }

                                                                    const parsed = Number(nextValue);
                                                                    if (!Number.isFinite(parsed)) {
                                                                        return;
                                                                    }
                                                                    updateElement({
                                                                        ...selectedElement,
                                                                        scale: parsed,
                                                                    });
                                                                }}
                                                            />
                                                        </label>
                                                    </>
                                                )}

                                                {selectedElement && typeof selectedElement === "object" && classNameOptions.length > 0 && (
                                                    <label className="script-creator__field">
                                                        <span>Class Name</span>
                                                        <CreatorSelect
                                                            value={selectedElement.className || ""}
                                                            options={classNameSelectOptions}
                                                            onChange={(nextValue) => {
                                                                if (!nextValue.length) {
                                                                    const nextElement = { ...selectedElement };
                                                                    delete nextElement.className;
                                                                    updateElement(nextElement);
                                                                    return;
                                                                }
                                                                updateElement({
                                                                    ...selectedElement,
                                                                    className: nextValue,
                                                                });
                                                            }}
                                                        />
                                                    </label>
                                                )}
                                            </>
                                        )}

                                        {elementEditorMode === "raw" && selectedElement !== undefined && (
                                            <label className="script-creator__field script-creator__field--fill">
                                                <span>Raw JSON</span>
                                                <textarea
                                                    className="script-creator__textarea-fill"
                                                    value={JSON.stringify(selectedElement, null, 2)}
                                                    onChange={(e) => {
                                                        try {
                                                            const parsed = JSON.parse(e.target.value);
                                                            updateElement(parsed);
                                                            setRawElementError(null);
                                                        } catch {
                                                            setRawElementError("JSON parse error");
                                                        }
                                                    }}
                                                />
                                            </label>
                                        )}

                                        {rawElementError && <div className="script-creator__error">{rawElementError}</div>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                    )}

                    {activeView === "schema" && (
                        <main className="script-creator__schema-view">
                            <div className="script-creator__schema-toolbar">
                                <label className="script-creator__field">
                                    <span>Root Screen</span>
                                    <CreatorSelect
                                        value={effectiveSchemaRootId}
                                        options={schemaRootSelectOptions}
                                        disabled={!schemaRootSelectOptions.length}
                                        fallbackLabel={effectiveSchemaRootId || "(none)"}
                                        onChange={(nextValue) => setSchemaRootId(nextValue)}
                                    />
                                </label>
                                <span className="script-creator__schema-hint">
                                    Tree is built from screen links, prompts, toggles/lists, and screen onDone targets.
                                </span>
                            </div>

                            <div className="script-creator__schema-tree">
                                <pre>{schemaLines.join("\n")}</pre>
                            </div>
                        </main>
                    )}
                </div>

                <div className="script-creator__footer">
                    <button className="script-creator__btn" onClick={applyScript}>[APPLY TO APP]</button>
                    <button className="script-creator__btn" onClick={copyJson}>[COPY JSON]</button>
                    <button className="script-creator__btn" onClick={downloadJson}>[DOWNLOAD JSON]</button>
                </div>
            </div>
        </section>
    );
};

export default ScriptCreator;
