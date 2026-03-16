import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import ModulesBrowser from "./components/ModulesBrowser";
import { isModulesBrowserPath } from "./lib/routes";

const container = document.getElementById("root");

if (!container) {
    throw new Error("Root container not found");
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        {isModulesBrowserPath() ? <ModulesBrowser /> : <App />}
    </React.StrictMode>
);
