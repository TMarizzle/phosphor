const normalizeBasePath = (basePath: string): string => {
    let nextBasePath = basePath || "/";

    if (!nextBasePath.startsWith("/")) {
        nextBasePath = `/${nextBasePath}`;
    }

    if (!nextBasePath.endsWith("/")) {
        nextBasePath = `${nextBasePath}/`;
    }

    return nextBasePath;
};

export const getBasePath = (): string => {
    return normalizeBasePath(import.meta.env.BASE_URL || "/");
};

export const getBasePathWithoutTrailingSlash = (): string => {
    const basePath = getBasePath();
    return basePath === "/" ? "" : basePath.replace(/\/$/, "");
};

export const stripBasePath = (pathname: string): string => {
    const safePathname = pathname || "/";
    const basePathWithoutTrailingSlash = getBasePathWithoutTrailingSlash();

    if (!basePathWithoutTrailingSlash) {
        return safePathname;
    }

    if (safePathname === basePathWithoutTrailingSlash) {
        return "/";
    }

    if (safePathname.startsWith(`${basePathWithoutTrailingSlash}/`)) {
        return safePathname.slice(basePathWithoutTrailingSlash.length) || "/";
    }

    return safePathname;
};

export const isModulesBrowserPath = (pathname: string = window.location.pathname): boolean => {
    const normalizedPath = stripBasePath(pathname).replace(/\/+$/, "") || "/";
    return normalizedPath === "/modules";
};

const buildUrl = (
    pathname: string,
    params?: Record<string, string | null | undefined>
): string => {
    const url = new URL(pathname, window.location.origin);

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (typeof value === "string" && value.length) {
                url.searchParams.set(key, value);
                return;
            }

            url.searchParams.delete(key);
        });
    }

    return url.toString();
};

export const getTerminalAppUrl = (moduleId?: string | null): string => {
    return buildUrl(getBasePath(), {
        module: moduleId || undefined,
    });
};

export const getModulesBrowserUrl = (
    params?: Record<string, string | null | undefined>
): string => {
    const basePathWithoutTrailingSlash = getBasePathWithoutTrailingSlash();
    const modulesPath = `${basePathWithoutTrailingSlash || ""}/modules`;
    return buildUrl(modulesPath, params);
};
