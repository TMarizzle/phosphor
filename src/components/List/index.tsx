import React, { FC, useCallback, useEffect, useMemo, useState } from "react";

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

    useEffect(() => {
        setIndex(initialIndex);
    }, [initialIndex]);

    const handleRendered = () => (onRendered && onRendered());
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!normalized.length) {
            onClick && onClick(undefined, e.shiftKey);
            return;
        }

        const nextIndex = ((index + 1) % normalized.length);
        const nextState = normalized[nextIndex];

        // If next state requires shift to cycle and shift wasn't held, don't advance
        if (nextState.dialog && nextState.requireShift && !e.shiftKey) {
            onClick && onClick(nextState, e.shiftKey);
            return;
        }

        setIndex(nextIndex);
        onClick && onClick(nextState, e.shiftKey);
    }, [normalized, onClick, index]);

    useEffect(() => handleRendered());

    const active = normalized.length ? normalized[index] : { text: "" };
    const css = [
        "__list__",
        className ? className : null,
        active.className ? active.className : null,
    ].join(" ").trim();

    return <div className={css} onClick={handleClick}>{active.text}</div>;
};

export default List;
