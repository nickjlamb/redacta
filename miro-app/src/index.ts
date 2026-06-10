/// <reference types="@mirohq/websdk-types" />

/**
 * Headless entry point: registers the toolbar icon click handler.
 * The actual UI lives in app.html / panel.ts.
 */
miro.board.ui.on("icon:click", async () => {
  await miro.board.ui.openPanel({ url: "app.html" });
});
