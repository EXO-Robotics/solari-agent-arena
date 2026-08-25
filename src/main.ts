import "./style.css";
import { App } from "./App";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("App root is missing.");

const app = new App(root);
void app.start();
