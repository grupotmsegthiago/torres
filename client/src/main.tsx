import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/typography.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(reg => console.log("SW registrado:", reg.scope))
    .catch(err => console.log("SW erro:", err));
}

createRoot(document.getElementById("root")!).render(<App />);
