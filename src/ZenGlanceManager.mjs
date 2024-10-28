
{

  class ZenGlanceManager extends ZenDOMOperatedFeature {
    #currentBrowser = null;

    init() {
      ChromeUtils.defineLazyGetter(
        this,
        'overlay',
        () => document.getElementById('zen-glance-overlay')
      );

      ChromeUtils.defineLazyGetter(
        this,
        'browserWrapper',
        () => document.getElementById('zen-glance-browser-container')
      );

      Services.obs.addObserver(this, "zen-glance-open");
    }

    observe(subject, topic, data) {
      this.openGlance(data);
    }

    openGlance(url) {
      if (this.#currentBrowser) {
        return;
      }
      const currentTab = gBrowser.selectedTab;
      const overlayWrapper = currentTab.linkedBrowser.closest(".browserSidebarContainer");
      overlayWrapper.appendChild(this.overlay);

      window.requestAnimationFrame(() => {
        this.overlay.removeAttribute("hidden");
      });
    }

    closeGlance() {
      this.#currentBrowser?.remove();
      this.#currentBrowser = null;

      this.overlay.setAttribute("hidden", true);
    }

    onLocationChange(_) {
      this.closeGlance();
    }
  }

  window.gZenGlanceManager = new ZenGlanceManager();


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
