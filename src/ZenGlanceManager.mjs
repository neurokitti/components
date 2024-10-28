
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
      this.openGlance(JSON.parse(data));
    }

    openGlance(data) {
      const initialX = data.x;
      const initialY = data.y;
      const initialWidth = data.width;
      const initialHeight = data.height;
      const url = data.url;
      if (this.#currentBrowser) {
        return;
      }
      const currentTab = gBrowser.selectedTab;
      const overlayWrapper = currentTab.linkedBrowser.closest(".browserSidebarContainer");
      overlayWrapper.appendChild(this.overlay);

      window.requestAnimationFrame(() => {
        this.browserWrapper.style.setProperty("--initial-x", `${initialX}px`);
        this.browserWrapper.style.setProperty("--initial-y", `${initialY}px`);
        this.browserWrapper.style.setProperty("--initial-width", initialWidth + "px");
        this.browserWrapper.style.setProperty("--initial-height", initialHeight + "px");
        this.overlay.removeAttribute("fade-out");
        this.overlay.removeAttribute("hidden");
      });
    }

    closeGlance() {
      this.#currentBrowser?.remove();
      this.#currentBrowser = null;

      window.requestAnimationFrame(() => {
        this.overlay.setAttribute("fade-out", true);
        setTimeout(() => {
          this.overlay.setAttribute("hidden", true);
          this.overlay.removeAttribute("fade-out");
        }, 800);
      });
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
