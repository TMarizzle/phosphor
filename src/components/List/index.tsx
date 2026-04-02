import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./style.scss";

export interface ListState {
    text: string;
    active?: boolean;
    target?: string;
    action?: string;
    dialog?: string;
    requireShift?: boolean;
    className?: string;
}

export interface ListProps {
    states: Array<ListState | string>;
    className?: string;
    onRendered?: () => void;
    onClick?: (state: ListState | undefined, shiftKey: boolean) => void;
}

const List: FC<ListProps> = (props) => {
    const { className, states, onRendered, onClick } = props;
    const normalized = useMemo(() => {
        return (states || []).map((state) => {
            if (typeof state === "string") {
                return { text: state, active: false };
            }

            const normalizedState: ListState = {
                text: state.text || "",
                active: !!state.active,
            };

            if (typeof state.target === "string") {
                normalizedState.target = state.target;
            }
            if (typeof state.action === "string") {
                normalizedState.action = state.action;
            }
            if (typeof state.dialog === "string") {
                normalizedState.dialog = state.dialog;
            }
            if (state.requireShift === true) {
                normalizedState.requireShift = true;
            }
            if (typeof state.className === "string") {
                normalizedState.className = state.className;
            }

            return normalizedState;
        }).filter((state) => state.text.length > 0);
    }, [states]);

    const initialIndex = useMemo(() => {
        const activeIndex = normalized.findIndex((state) => state.active);
        return activeIndex > -1 ? activeIndex : 0;
    }, [normalized]);

    const [index, setIndex] = useState(initialIndex);
    const longPressTimerRef = useRef<number | null>(null);
    const lastLongPressAtRef = useRef<number>(0);

    useEffect(() => {
        setIndex(initialIndex);
    }, [initialIndex]);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current !== null) {
                window.clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const hasRequireShiftState = normalized.some((s) => s.dialog && s.requireShift);

    const handleRendered = () => (onRendered && onRendered());

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const advanceAndNotify = useCallback((effectiveShiftKey: boolean) => {
        if (!normalized.length) {
            onClick && onClick(undefined, effectiveShiftKey);
            return;
        }

        const nextIndex = ((index + 1) % normalized.length);
        const nextState = normalized[nextIndex];

        if (nextState.dialog && nextState.requireShift && !effectiveShiftKey) {
            onClick && onClick(nextState, effectiveShiftKey);
            return;
        }

        setIndex(nextIndex);
        onClick && onClick(nextState, effectiveShiftKey);
    }, [normalized, onClick, index]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !hasRequireShiftState) {
            return;
        }
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
            lastLongPressAtRef.current = Date.now();
            advanceAndNotify(true);
            clearLongPressTimer();
        }, 500);
    };

    const handlePointerUp = () => clearLongPressTimer();
    const handlePointerCancel = () => clearLongPressTimer();

    const handleClick = useCallback((e: React.MouseEvent) => {
        clearLongPressTimer();
        if (Date.now() - lastLongPressAtRef.current < 750) {
            return;
        }
        advanceAndNotify(e.shiftKey);
    }, [advanceAndNotify]);

    useEffect(() => handleRendered());

    const active = normalized.length ? normalized[index] : { text: "" };
    const css = [
        "__list__",
        className ? className : null,
        active.className ? active.className : null,
    ].join(" ").trim();

    return (
        <div
            className={css}
            title={hasRequireShiftState ? "Shift-click or press and hold to bypass" : undefined}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
        >
            {active.text}
        </div>
    );
};

export default List;
