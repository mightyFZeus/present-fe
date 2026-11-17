import tailwindcss from "@tailwindcss/postcss";
import preserveSlideContainment from "./scripts/preserve-slide-containment.mjs";

export default {
  plugins: [
    tailwindcss(),
    preserveSlideContainment(),
  ],
};
