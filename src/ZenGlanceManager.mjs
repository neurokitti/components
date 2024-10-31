
{

  class ZenGlanceManager extends ZenDOMOperatedFeature {
    #currentBrowser = null;
    #currentTab = null;

    #animating = false;

    init() {
      document.documentElement.setAttribute("zen-glance-uuid", gZenUIManager.generateUuidv4());
      window.addEventListener("keydown", this.onKeyDown.bind(this));

      ChromeUtils.defineLazyGetter(
        this,
        'sidebarButtons',
        () => document.getElementById('zen-glance-sidebar-container')
      );

      document.getElementById('tabbrowser-tabpanels').addEventListener("click", this.onOverlayClick.bind(this));

      Services.obs.addObserver(this, "quit-application-requested");
    }

    onKeyDown(event) {
      if (event.key === "Escape" && this.#currentBrowser) {
        event.preventDefault();
        event.stopPropagation();
        this.closeGlance();
      }
    }

    onOverlayClick(event) {
      if (event.target === this.overlay && event.originalTarget !== this.contentWrapper) {
        this.closeGlance();
      }
    }

    observe(subject, topic) {
      switch (topic) {
        case "quit-application-requested":
          this.onUnload();
          break;
      }
    }

    onUnload() {
      // clear everything
      if (this.#currentBrowser) {
        gBrowser.removeTab(this.#currentTab);
      }
    }

    createBrowserElement(url, currentTab) {
      const newTabOptions = {
        userContextId: currentTab.getAttribute("usercontextid") || "",
        skipBackgroundNotify: true,
        insertTab: true,
        skipLoad: false,
        index: currentTab._tPos + 1,
      };
      this.currentParentTab = currentTab;
      const newTab = gBrowser.addTrustedTab(Services.io.newURI(url).spec, newTabOptions);

      gBrowser.selectedTab = newTab;
      currentTab.querySelector(".tab-content").appendChild(newTab);

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

      this.browserWrapper?.removeAttribute("animate");
      this.browserWrapper?.removeAttribute("animate-end");
      this.browserWrapper?.removeAttribute("animate-full");
      this.browserWrapper?.removeAttribute("animate-full-end");
      this.browserWrapper?.removeAttribute("has-finished-animation");

      const url = data.url;
      const currentTab = gBrowser.selectedTab;

      this.animatingOpen = true;
      const browserElement = this.createBrowserElement(url, currentTab);

      this.overlay = browserElement.closest(".browserSidebarContainer");
      this.browserWrapper = browserElement.closest(".browserContainer");
      this.contentWrapper = browserElement.closest(".browserStack");

      this.browserWrapper.prepend(this.sidebarButtons);

      this.overlay.classList.add("zen-glance-overlay");

      this.browserWrapper.removeAttribute("animate-end");
      window.requestAnimationFrame(() => {
        this.quickOpenGlance();

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
          this.animatingOpen = false;
        }, 400);
      });
    }

    closeGlance({ noAnimation = false } = {}) {
      if (this.#animating || !this.#currentBrowser || this.animatingOpen) {
        return;
      }

      this.browserWrapper.removeAttribute("has-finished-animation");
      if (noAnimation) {
        this.quickCloseGlance({ closeCurrentTab: false });
        this.#currentBrowser = null;
        this.#currentTab = null;
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
            this.quickCloseGlance({ closeParentTab: false });
            this.overlay.setAttribute("hidden", true);
            this.overlay.removeAttribute("fade-out");
            this.browserWrapper.removeAttribute("animate");

            this.#currentTab.setAttribute("hidden", true);

            this.#currentBrowser = null;
            this.lastCurrentTab = this.#currentTab;
            this.#currentTab = null;
            this.currentParentTab = null;

            gBrowser.selectedTab = this.currentParentTab;

            setTimeout(() => {
              gBrowser.removeTab(this.lastCurrentTab);
            }, 100);
          }, 500);
        });
      });  
    }

    quickOpenGlance() {
      if (!this.#currentBrowser || this._duringOpening) {
        return;
      }
      this._duringOpening = true;
      try {
        gBrowser.selectedTab = this.#currentTab;
      } catch (e) {}

      this.currentParentTab.linkedBrowser.closest(".browserSidebarContainer").classList.add("deck-selected");
      this.currentParentTab.linkedBrowser.zenModeActive = true;
      this.#currentBrowser.zenModeActive = true;
      this.currentParentTab.linkedBrowser.docShellIsActive = true;
      this.#currentBrowser.docShellIsActive = true;
      this.#currentBrowser.setAttribute("zen-glance-selected", true);

      this.currentParentTab.linkedBrowser.closest(".browserSidebarContainer").classList.add("zen-glance-background");
      this._duringOpening = false;
    }

    quickCloseGlance({ closeCurrentTab = true, closeParentTab = true } = {}) {
      if (closeParentTab) {
        this.currentParentTab.linkedBrowser.closest(".browserSidebarContainer").classList.remove("deck-selected");
      }
      this.currentParentTab.linkedBrowser.zenModeActive = false;
      this.#currentBrowser.zenModeActive = false;
      if (closeParentTab) {
        this.currentParentTab.linkedBrowser.docShellIsActive = false;
      }
      if (closeCurrentTab) {
        this.#currentBrowser.docShellIsActive = false;
      }
      this.#currentBrowser.removeAttribute("zen-glance-selected");
      this.currentParentTab.linkedBrowser.closest(".browserSidebarContainer").classList.remove("zen-glance-background");
    }

    onLocationChange(_) {
      if (this._duringOpening) {
        return;
      }
      if (gBrowser.selectedTab === this.#currentTab && !this.animatingOpen && !this._duringOpening && this.#currentBrowser) {
        this.quickOpenGlance();
        return;
      }
      if (gBrowser.selectedTab === this.currentParentTab && this.#currentBrowser) {
        this.quickOpenGlance();
      } else if ((!this.animatingFullOpen || this.animatingOpen) && this.#currentBrowser) {
        this.closeGlance();
      }
    }

    fullyOpenGlance() {            
      gBrowser._insertTabAtIndex(this.#currentTab, {
        index: this.#currentTab._tPos + 1,
      });

      this.animatingFullOpen = true;

      this.browserWrapper.removeAttribute("has-finished-animation");
      this.browserWrapper.setAttribute("animate-full", true);
      gBrowser.selectedTab = this.#currentTab;
      setTimeout(() => {
        window.requestAnimationFrame(() => {
          this.browserWrapper.setAttribute("animate-full-end", true);
          window.requestAnimationFrame(() => {
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
