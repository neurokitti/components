
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

      this.originalOverlayParent = this.overlay.parentNode;

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
        skipBackgroundNotify: true,
        bulkOrderedOpen: true,
        insertTab: false,
        skipLoad: false,
      };
      gBrowser.zenGlanceBrowser = true;
      const newTab = gBrowser.addTrustedTab(Services.io.newURI(url).spec, newTabOptions);
      document.getElementById("zen-glance-tabs").appendChild(newTab);
      this.#currentBrowser = newTab.linkedBrowser;
      this.#currentTab = newTab;
      return this.#currentBrowser;
    }

    openGlance(data) {
      if (this.#currentBrowser) {
        return;
      }

      const initialX = data.x;
      const initialY = data.y;
      const initialWidth = data.width;
      const initialHeight = data.height;

      this.browserWrapper.removeAttribute("animate");
      this.browserWrapper.removeAttribute("animate-end");
      this.browserWrapper.removeAttribute("animate-full");
      this.browserWrapper.removeAttribute("animate-full-end");
      this.browserWrapper.removeAttribute("has-finished-animation");

      const url = data.url;
      const currentTab = gBrowser.selectedTab;
      const overlayWrapper = document.getElementById("tabbrowser-tabbox");
      overlayWrapper.prepend(this.overlay);

      const browserElement = this.createBrowserElement(url, currentTab);
      browserElement.zenModeActive = true;

      browserElement.addProgressListener(this.progressListener, Ci.nsIWebProgress.NOTIFY_LOCATION);
      browserElement.loadURI(Services.io.newURI(url), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      browserElement.docShellIsActive = true;

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
          this.browserWrapper.setAttribute("has-finished-animation", true);
          this.#animating = false;
        }, 400);
      });
    }

    closeGlance({ noAnimation = false } = {}) {
      if (this.#animating || !this.#currentBrowser) {
        return;
      }

      this.browserWrapper.removeAttribute("has-finished-animation");
      if (noAnimation) {
        this.overlay.style.opacity = 0;
        this.overlay.visivility = "collapse";
        window.requestAnimationFrame(() => {
          this.overlay.setAttribute("hidden", true);
          this.overlay.removeAttribute("fade-out");
          this.browserWrapper.removeAttribute("animate");
          this.browserWrapper.removeAttribute("animate-end");

          setTimeout(() => {
            this.#currentBrowser?.remove();
            this.#currentTab?.remove();
            this.#currentBrowser = null;
            this.#currentTab = null;
            this.originalOverlayParent.appendChild(this.overlay);

            this.overlay.style.opacity = 1;
            this.overlay.visivility = "visible";

            this.#animating = false;
          }, 500);
        });
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

            this.originalOverlayParent.appendChild(this.overlay);
          }, 500);
        });
      });  
    }

    onLocationChange(_) {
      if (!this.animatingFullOpen) {
        this.closeGlance();
        return;
      }
    }

    fullyOpenGlance() {      
      const newTabOptions = {
        userContextId: this.#currentTab.getAttribute("usercontextid") || "",
        skipLoad: true,
        ownerTab: this.#currentTab,
        preferredRemoteType: this.#currentTab.linkedBrowser.remoteType,
      };

      const newTab = gBrowser.duplicateTab(this.#currentTab, true, newTabOptions);

      this.animatingFullOpen = true;

      this.browserWrapper.removeAttribute("has-finished-animation");
      this.browserWrapper.setAttribute("animate-full", true);
      setTimeout(() => {
        window.requestAnimationFrame(() => {
          this.browserWrapper.setAttribute("animate-full-end", true);
          window.requestAnimationFrame(() => {
            gBrowser.selectedTab = newTab;
            window.requestAnimationFrame(() => {
              setTimeout(() => {
                this.animatingFullOpen = false;
                this.closeGlance({ noAnimation: true });
              }, 600);
            });
          });
        });
      }, 300);
    }
  }

  window.gZenGlanceManager = new ZenGlanceManager();


  function registerWindowActors() {
    if (Services.prefs.getBoolPref("zen.glance.enabled", true)) {
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
  }

  registerWindowActors();
}
