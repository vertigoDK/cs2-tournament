import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/unbounded/500.css";
import "@fontsource/unbounded/700.css";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
