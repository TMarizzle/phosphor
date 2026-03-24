import React, { FC, useEffect, useState } from "react";

import "./style.scss";

export interface ReportComposerProps {
    titleTemplate?: string;
    template?: string;
    className?: string;
    onRendered?: () => void;
    onSave?: (value: string, title: string) => void;
    onCancel?: () => void;
}

const ReportComposer: FC<ReportComposerProps> = (props) => {
    const { titleTemplate, template, className, onRendered, onSave, onCancel } = props;
    const css = ["__report_composer__", className ? className : null].join(" ").trim();
    const [title, setTitle] = useState(titleTemplate || "");
    const [value, setValue] = useState(template || "");

    useEffect(() => {
        onRendered && onRendered();
    }, [onRendered]);

    const handleSave = () => {
        onSave && onSave(value, title);
    };

    const handleCancel = () => {
        onCancel && onCancel();
    };

    return (
        <div className={css}>
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                spellCheck={false}
                placeholder="Report title"
            />
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
            />
            <div className="actions">
                <button type="button" onClick={handleSave}>SAVE REPORT</button>
                <button type="button" onClick={handleCancel}>CANCEL</button>
            </div>
        </div>
    );
};

export default ReportComposer;
