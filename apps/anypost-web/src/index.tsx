import { render } from "solid-js/web";
import { App } from "./App.js";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
