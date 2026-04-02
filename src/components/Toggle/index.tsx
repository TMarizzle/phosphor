import React, { FC, useCallback, useEffect, useState } from "react";

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

    const state = active || states.find((element) => element.active === true) || states[0];
    const text = (state && state.text) || "";
    const css = [
        "__toggle__",
        className ? className : null,
        state?.className ? state.className : null,
    ].join(" ").trim();

    useEffect(() => {
        const nextActive = states.find((element) => element.active === true) || states[0];
        setActive(nextActive);
    }, [states]);

    // events
    const handleRendered = () => (onRendered && onRendered());
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!states || !states.length) {
            onClick && onClick(undefined, e.shiftKey);
            return;
        }

        const current = active || states.find((element) => element.active === true) || states[0];
        const index = states.findIndex((element) => element === current);
        const safeIndex = index > -1 ? index : 0;
        const next = states[(safeIndex + 1) % states.length];

        // If next state requires shift to cycle and shift wasn't held, don't advance
        if (next.dialog && next.requireShift && !e.shiftKey) {
            onClick && onClick(next, e.shiftKey);
            return;
        }

        states.forEach((element) => element.active = false);
        next.active = true;
        setActive(next);
        onClick && onClick(next, e.shiftKey);
    }, [states, active, setActive, onClick]);

    // this should fire on mount/update
    useEffect(() => handleRendered());

    return <div className={css} onClick={handleClick}>{text}</div>;
};

export default Toggle;
