
{

  class ZenGlanceManager extends ZenDOMOperatedFeature {
    #currentBrowser = null;
    #currentTab = null;

    #animating = false;

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

      ChromeUtils.defineLazyGetter(
        this,
        'browser',
        () => document.getElementById('zen-glance-browser')
      );

      ChromeUtils.defineLazyGetter(
        this,
        'contentWrapper',
        () => document.getElementById('zen-glance-content')
      );

      ChromeUtils.defineLazyGetter(
        this,
        'loadingBar',
        () => document.getElementById('zen-glance-loading')
      );

      Services.obs.addObserver(this, "zen-glance-open");
      this.initProgressListener();
    }

    observe(subject, topic, data) {
      this.openGlance(JSON.parse(data));
    }

    initProgressListener() {
      this.progressListener = {
        QueryInterface: ChromeUtils.generateQI(['nsIWebProgressListener', 'nsISupportsWeakReference']),
        onLocationChange: function (aWebProgress, aRequest, aLocation, aFlags) {
          this.loadingBar.removeAttribute("not-loading");
          if (aWebProgress.isLoadingDocument) {
            this.loadingBar.removeAttribute("loading");
            return;
          }
          this.loadingBar.setAttribute("loading", true);
        }.bind(this),
      };
    }

    onOverlayClick(event) {
      if (event.target === this.overlay || event.target === this.contentWrapper) {
        this.closeGlance();
      }
    }

    createBrowserElement(url, currentTab) {
      console.log(url);
      const newTabOptions = {
        userContextId: currentTab.getAttribute("usercontextid") || "",
        inBackground: true,
        skipLoading: true,
        insertTab: false,
      };
      const newTab = gBrowser.addTrustedTab(url, newTabOptions);
      document.getElementById("zen-glance-tabs").appendChild(newTab);
      this.#currentBrowser = newTab.linkedBrowser;
      this.#currentTab = newTab;
      return this.#currentBrowser;
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

      const browserElement = this.createBrowserElement(url, currentTab);
      this.browser.appendChild(browserElement);

      browserElement.addProgressListener(this.progressListener, Ci.nsIWebProgress.NOTIFY_LOCATION);

      browserElement.docShellIsActive = true;
      browserElement.loadURI(Services.io.newURI(url), {
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal(
          {}
        ),
      });

      this.loadingBar.setAttribute("not-loading", true);
      this.loadingBar.removeAttribute("loading");
      this.browserWrapper.removeAttribute("animate-end");

      window.requestAnimationFrame(() => {
        this.browserWrapper.style.setProperty("--initial-x", `${initialX}px`);
        this.browserWrapper.style.setProperty("--initial-y", `${initialY}px`);
        this.browserWrapper.style.setProperty("--initial-width", initialWidth + "px");
        this.browserWrapper.style.setProperty("--initial-height", initialHeight + "px");

        this.overlay.removeAttribute("fade-out");
        this.overlay.removeAttribute("hidden");
        this.browserWrapper.setAttribute("animate", true);
        this.#animating = true;
        setTimeout(() => {
          this.browserWrapper.setAttribute("animate-end", true);
          this.#animating = false;
        }, 500);
      });
    }

    closeGlance() {
      if (this.#animating) {
        return;
      }

      // do NOT touch here, I don't know what it does, but it works...
      window.requestAnimationFrame(() => {
        this.browserWrapper.removeAttribute("animate");
        this.browserWrapper.removeAttribute("animate-end");
        this.overlay.setAttribute("fade-out", true);
        window.requestAnimationFrame(() => {
          this.browserWrapper.setAttribute("animate", true);
          setTimeout(() => {
            this.overlay.setAttribute("hidden", true);
            this.overlay.removeAttribute("fade-out");
            this.browserWrapper.removeAttribute("animate");

            this.#currentBrowser?.remove();
            // remove the tab to avoid memory leaks
            this.#currentTab?.remove();
            this.#currentBrowser = null;
            this.#currentTab = null;
          }, 500);
        });
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
