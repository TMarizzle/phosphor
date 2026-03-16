import React, { FC, useEffect, useId, useRef, useState } from "react";

export interface CreatorSelectOption {
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
    searchable?: boolean;
}

const CreatorSelect: FC<CreatorSelectProps> = ({
    value,
    options,
    onChange,
    className,
    disabled = false,
    fallbackLabel,
    searchable = false,
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
                data-searchable-select={searchable ? "true" : undefined}
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

export default CreatorSelect;
