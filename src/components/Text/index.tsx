import React, { FC, useEffect } from "react";
import { renderMarkdown } from "../../utils/markdown";

export interface TextProps {
    text: string;
    className?: string;
    onRendered?: () => void;
}

const Text: FC<TextProps> = (props) => {
    const { text, className, onRendered } = props;
    const css = [
        "__text__",
        className ? className : null,
    ].join(" ").trim();

    // events
    const handleRendered = () => (onRendered && onRendered());

    // this should fire on mount/update
    useEffect(() => handleRendered());

    return <div className={css}>{renderMarkdown(text)}</div>;
};

export default Text;
