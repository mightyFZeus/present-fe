// vinext 1.4.6 gives fill images an inline cover default. Preserve the app's
// existing whole-slide rules without changing application CSS or image imports.
const sourceFiles = [
  "/src/features/workspace/workspace.css",
  "/src/features/workspace/presentation.css",
];
const stageSelectors = new Set([
  ".stage-image",
  ".presentation-active .stage-image",
]);

export default function preserveSlideContainment() {
  return {
    postcssPlugin: "present-vinext-slide-containment",
    Declaration(declaration) {
      const filename = declaration.source?.input.file?.replaceAll("\\", "/");
      if (!filename || !sourceFiles.some((file) => filename.endsWith(file))) return;
      if (declaration.parent?.type !== "rule") return;
      if (!stageSelectors.has(declaration.parent.selector)) return;
      if (declaration.prop !== "object-fit" || declaration.value !== "contain") return;
      if (declaration.important) return;
      declaration.important = true;
    },
  };
}
