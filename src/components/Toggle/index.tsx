import React, { FC, useCallback, useEffect, useState } from "react";

import "./style.scss";

export interface ToggleState {
    text: string;
    active?: boolean;
    target?: string;
    action?: string;
    className?: string;
}

export interface ToggleProps {
    states: ToggleState[];
    className?: string;
    onRendered?: () => void;
    onClick?: (state?: ToggleState) => void;
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
    const handleClick = useCallback(() => {
        if (!states || !states.length) {
            onClick && onClick();
            return;
        }

        const current = active || states.find((element) => element.active === true) || states[0];
        const index = states.findIndex((element) => element === current);
        const safeIndex = index > -1 ? index : 0;

        states.forEach((element) => element.active = false);
        const next = states[(safeIndex + 1) % states.length];
        next.active = true;
        setActive(next);
        onClick && onClick(next);
    }, [states, active, setActive, onClick]);

    // this should fire on mount/update
    useEffect(() => handleRendered());

    return <div className={css} onClick={handleClick}>{text}</div>;
};

export default Toggle;
