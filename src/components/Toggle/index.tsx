import React, { FC, useCallback, useEffect, useRef, useState } from "react";

import "./style.scss";

export interface ToggleState {
    text: string;
    active?: boolean;
    target?: string;
    action?: string;
    dialog?: string;
    requireShift?: boolean;
    className?: string;
}

export interface ToggleProps {
    states: ToggleState[];
    className?: string;
    onRendered?: () => void;
    onClick?: (state: ToggleState | undefined, shiftKey: boolean) => void;
}

const Toggle: FC<ToggleProps> = (props) => {
    const { className, states, onRendered, onClick } = props;
    const [active, setActive] = useState<ToggleState | undefined>(() => {
        return states.find((element) => element.active === true) || states[0];
    });
    const longPressTimerRef = useRef<number | null>(null);
    const lastLongPressAtRef = useRef<number>(0);

    const state = active || states.find((element) => element.active === true) || states[0];
    const text = (state && state.text) || "";
    const css = [
        "__toggle__",
        className ? className : null,
        state?.className ? state.className : null,
    ].join(" ").trim();
    const hasRequireShiftState = states.some((s) => s.dialog && s.requireShift);

    useEffect(() => {
        const nextActive = states.find((element) => element.active === true) || states[0];
        setActive(nextActive);
    }, [states]);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current !== null) {
                window.clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    // events
    const handleRendered = () => (onRendered && onRendered());

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const advanceAndNotify = useCallback((effectiveShiftKey: boolean) => {
        if (!states || !states.length) {
            onClick && onClick(undefined, effectiveShiftKey);
            return;
        }

        const current = active || states.find((element) => element.active === true) || states[0];
        const index = states.findIndex((element) => element === current);
        const safeIndex = index > -1 ? index : 0;
        const next = states[(safeIndex + 1) % states.length];

        if (next.dialog && next.requireShift && !effectiveShiftKey) {
            onClick && onClick(next, effectiveShiftKey);
            return;
        }

        states.forEach((element) => element.active = false);
        next.active = true;
        setActive(next);
        onClick && onClick(next, effectiveShiftKey);
    }, [states, active, setActive, onClick]);

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

    // this should fire on mount/update
    useEffect(() => handleRendered());

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
            {text}
        </div>
    );
};

export default Toggle;
