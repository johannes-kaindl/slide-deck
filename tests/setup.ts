// `window.setInterval`/`window.open` etc. brauchen die Node-Umgebung als `window`; das Kit stellt
// dafuer `installWindowTimers` bereit (ersetzt das frühere `window = globalThis` der Hand-Kopie).
import { installWindowTimers } from "./vendor/kit/window-timers";

installWindowTimers({ full: true });
