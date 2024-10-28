
{
  function registerWindowActors() {
    // TODO: Only if the pref is enabled
    gZenActorsManager.addJSWindowActor("ZenGlance", {
      parent: {
        esModuleURI: "chrome://browser/content/zen-components/actors/ZenGlanceParent.sys.mjs",
      },
      child: {
        esModuleURI: "chrome://browser/content/zen-components/actors/ZenGlanceChild.sys.mjs",
        events: {
          DOMContentLoaded: {},
        },
      },
    });
  }

  registerWindowActors();
}
