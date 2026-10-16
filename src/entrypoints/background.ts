import { browser, defineBackground } from "#imports";

export default defineBackground(() => {
  // The panel stays open while the user clicks around the page; a popup would
  // close on the first click and kill the element picker.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error(error));
});
