import "./styles.css";
import { App } from "./app";

const glCanvas = document.getElementById("game") as HTMLCanvasElement;
const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLElement;

const app = new App(glCanvas, hudCanvas, overlay);

// Gelistirme/hata ayiklama icin erisim
(window as unknown as Record<string, unknown>).__rift = app;

// "Telefonu cevir" uyarisini kapatma
document.getElementById("rotate-dismiss")?.addEventListener("click", () => {
  document.body.classList.add("rotate-ok");
});

// Cevrimdisi calisma icin servis calisani
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* cevrimdisi destek zorunlu degil */
    });
  });
}

// Mobilde ciftdokunusla yakinlastirmayi engelle
document.addEventListener(
  "gesturestart",
  (e) => e.preventDefault(),
  { passive: false },
);
