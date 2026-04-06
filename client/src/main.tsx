import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/typography.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  if (caches) {
    caches.keys().then((names) => {
      for (const name of names) caches.delete(name);
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
