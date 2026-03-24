import React, { Component, RefObject, ReactElement, CSSProperties, } from "react";
import "./style.scss";

export interface BitmapProps {
    src: string;
    className?: string;
    alt?: string;
    animated?: boolean;
    scale?: number;
    fillWidth?: boolean;
    autocomplete?: boolean;
    onComplete: () => void; // event called on completion
}

interface BitmapState {
    loading: boolean;
    image: HTMLImageElement;
    naturalWidth: number | null;
    resolvedSrc: string;
}

const TICK = 150;
// ersatz Fibonacci sequence
const STEPS = [
    0.01,
    0.02,
    0.03,
    0.05,
    0.08,
    0.13,
    0.21,
    0.34,
    0.55,
    0.89,
    1.00,
];

class Bitmap extends Component<BitmapProps, BitmapState> {
    private _canvasRef: RefObject<HTMLCanvasElement> = null;
    private _animateTimerId: number = null;
    private _currentStep = 0;

    constructor(props: BitmapProps) {
        super(props);

        this._canvasRef = React.createRef<HTMLCanvasElement>();
        const loading = !this.props.autocomplete;

        this.state = {
            loading,
            image: new Image(),
            naturalWidth: null,
            resolvedSrc: this._getPreferredSource(props.src),
        };
    }

    private _getMediaStyle(): CSSProperties {
        const { fillWidth, scale } = this.props;
        const { naturalWidth } = this.state;

        if (fillWidth) {
            return {
                width: "100%",
                height: "auto",
            };
        }

        if (typeof scale === "number" && Number.isFinite(scale) && scale > 0 && naturalWidth) {
            return {
                width: `${Math.max(1, Math.round(naturalWidth * scale))}px`,
                height: "auto",
            };
        }

        return {};
    }

    public render(): ReactElement {
        const { className, src, alt } = this.props;
        const { loading, resolvedSrc } = this.state;
        const css = ["__image__", className ? className : null].join(" ").trim();
        const animated = this._isAnimatedSource();
        const style = this._getMediaStyle();
        const mediaSrc = resolvedSrc || src;

        if (animated) {
            return (
                <div className={css}>
                    {loading && <div className="progressbar" />}
                    {!loading && <img src={mediaSrc} alt={alt || ""} style={style} />}
                </div>
            );
        }

        return (
            <div className={css}>
                {loading && <div className="progressbar" />}
                <canvas ref={this._canvasRef} style={style} />
            </div>
        );
    }

    public componentDidMount(): void {
        if (this._isAnimatedSource()) {
            this._loadAnimatedImage();
            return;
        }

        this._loadImage();
    }

    public componentWillUnmount(): void {
        this._clearAnimationTimer();
    }

    private _isAnimatedSource(): boolean {
        const { animated } = this.props;
        const src = this.state?.resolvedSrc || this.props.src;
        if (animated) {
            return true;
        }

        const normalized = (src || "").split("?")[0].toLowerCase();
        return normalized.endsWith(".gif");
    }

    private _resampleImage(resolution: number): void {
        const { image, } = this.state;
        const canvas = this._canvasRef.current;
        const ctx = canvas && canvas.getContext("2d");
        if (!canvas || !ctx) {
            return;
        }

        const w = image.width;
        const h = image.height;

        const dw = Math.max(1, Math.round(w * resolution));
        const dh = Math.max(1, Math.round(h * resolution));
        const buffer = document.createElement("canvas");
        const bufferCtx = buffer.getContext("2d");
        if (!bufferCtx) {
            return;
        }

        buffer.width = dw;
        buffer.height = dh;

        // Downsample into a clean buffer first so transparent pixels do not
        // accumulate from previous animation frames on the main canvas.
        bufferCtx.imageSmoothingEnabled = false;
        bufferCtx.clearRect(0, 0, dw, dh);
        bufferCtx.drawImage(image, 0, 0, dw, dh);

        // trun off smoothing to ensure it's pixelated
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        // then draw the above bitmap at then expected image size without resampling
        ctx.drawImage(buffer, 0, 0, dw, dh, 0, 0, w, h);
    }

    private _clearAnimationTimer = () => {
        if (this._animateTimerId) {
            window.clearInterval(this._animateTimerId);
            this._animateTimerId = null;
        }
    };

    private _animate(): void {
        const { onComplete, } = this.props;

        this._clearAnimationTimer();
        this._animateTimerId = window.setInterval(() => {
            if (this._currentStep < STEPS.length) {
                this._resampleImage(STEPS[this._currentStep]);
                this._currentStep++;
            } else {
                this._clearAnimationTimer();
                onComplete && onComplete();
            }
        }, TICK);
    }

    private _loadImage(): void {
        const { autocomplete, onComplete, src, } = this.props;
        const { image } = this.state;
        const canvas = this._canvasRef.current;
        const ctx = canvas && canvas.getContext("2d");
        const resolvedSrc = this._getPreferredSource(src);

        if (canvas && ctx && image) {
            image.onload = () => {
                // resize the canvas element
                const w = image.width;
                const h = image.height;

                // todo: max dimensions
                // make sure width is no larger than container width
                canvas.width = w;
                canvas.height = h;

                if (!autocomplete) {
                    this.setState({
                        loading: false,
                        naturalWidth: w,
                        resolvedSrc,
                    }, () => this._animate());
                } else {
                    this.setState({
                        naturalWidth: w,
                        resolvedSrc,
                    }, () => {
                        ctx.clearRect(0, 0, w, h);
                        ctx.drawImage(image, 0, 0);
                        onComplete && onComplete();
                    });
                }
            };
            image.onerror = () => {
                this.setState({
                    loading: false,
                    resolvedSrc,
                }, () => onComplete && onComplete());
            };
            image.src = resolvedSrc;
        }
    }

    private _loadAnimatedImage(): void {
        const { autocomplete, onComplete, src } = this.props;
        const resolvedSrc = this._getPreferredSource(src);

        if (autocomplete) {
            this.setState({
                loading: false,
                resolvedSrc,
            }, () => onComplete && onComplete());
            return;
        }

        const image = new Image();
        image.onload = () => {
            this.setState({
                loading: false,
                naturalWidth: image.naturalWidth || image.width || null,
                resolvedSrc,
            }, () => onComplete && onComplete());
        };
        image.onerror = () => {
            this.setState({
                loading: false,
                resolvedSrc,
            }, () => onComplete && onComplete());
        };
        image.src = resolvedSrc;
    }

    private _getPreferredSource(src: string): string {
        const nextSrc = (src || "").trim();
        if (!nextSrc.length) {
            return src;
        }

        const extensionSlashPattern = /^(.*\.(?:png|jpe?g|jfif|gif|webp|bmp|svg|tif|tiff|avif|apng|ico|heic|heif))\/.+$/i;

        if (/^https?:\/\//i.test(nextSrc)) {
            try {
                const url = new URL(nextSrc);
                const pathnameMatch = url.pathname.match(extensionSlashPattern);
                if (pathnameMatch && pathnameMatch[1]) {
                    url.pathname = pathnameMatch[1];
                    url.search = "";
                    url.hash = "";
                    return url.toString();
                }
            } catch {
                // fall through to regex on the raw src string
            }
        }

        const directMatch = nextSrc.match(extensionSlashPattern);
        if (directMatch && directMatch[1]) {
            return directMatch[1];
        }

        return nextSrc;
    }
}

export default Bitmap;
