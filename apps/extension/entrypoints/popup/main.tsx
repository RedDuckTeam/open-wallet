import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "../../src/ui/App.js";
import { applyTheme, getStoredTheme } from "../../src/ui/lib/theme.js";
import "./style.css";

// Reflect the saved theme before the first paint to avoid a light/dark flash.
applyTheme(getStoredTheme());

const root = document.getElementById("root");
if (!root) throw new Error("popup root element missing");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
