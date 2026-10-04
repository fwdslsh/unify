import { mount } from "svelte";
import FeeCalculator from "../components/FeeCalculator.svelte";

mount(FeeCalculator, {
  target: document.getElementById("fee-calculator"),
});
