{
  const lazy = {};

  class ZenPinnedTabsObserver {
    static ALL_EVENTS = ['TabPinned', 'TabUnpinned', 'TabClose'];

    #listeners = [];

    constructor() {
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabRestorePinnedTabsToPinnedUrl', 'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url', false);
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabCloseShortcutBehavior', 'zen.pinned-tab-manager.close-shortcut-behavior', 'switch');
      ChromeUtils.defineESModuleGetters(lazy, {E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs"});
      this.#listenPinnedTabEvents();
    }

    #listenPinnedTabEvents() {
      const eventListener = this.#eventListener.bind(this);
      for (const event of ZenPinnedTabsObserver.ALL_EVENTS) {
        window.addEventListener(event, eventListener);
      }
      window.addEventListener('unload', () => {
        for (const event of ZenPinnedTabsObserver.ALL_EVENTS) {
          window.removeEventListener(event, eventListener);
        }
      });
    }

    #eventListener(event) {
      for (const listener of this.#listeners) {
        listener(event.type, event);
      }
    }

    addPinnedTabListener(listener) {
      this.#listeners.push(listener);
    }
  }

  class ZenPinnedTabManager extends ZenDOMOperatedFeature {

    init() {
      this.observer = new ZenPinnedTabsObserver();
      this._initClosePinnedTabShortcut();
      this._insertItemsIntoTabContextMenu();
      this.observer.addPinnedTabListener(this._onPinnedTabEvent.bind(this));

      this._zenClickEventListener = this._onTabClick.bind(this);
    }

    async initTabs() {
      await ZenPinnedTabsStorage.init();
      await  this._refreshPinnedTabs();
    }

    async _refreshPinnedTabs() {
      await this._initializePinsCache();
      this._initializePinnedTabs();
    }

    async _initializePinsCache() {
      try {
        // Get pin data
        const pins = await ZenPinnedTabsStorage.getPins();

        // Enhance pins with favicons
        const enhancedPins = await Promise.all(pins.map(async pin => {
          try {
            const faviconData = await PlacesUtils.promiseFaviconData(pin.url);
            return {
              ...pin,
              iconUrl: faviconData?.uri?.spec || null
            };
          } catch(ex) {
            // If favicon fetch fails, continue without icon
            return {
              ...pin,
              iconUrl: null
            };
          }
        }));

        this._pinsCache = enhancedPins.sort((a, b) => {
          if (!a.workspaceUuid && b.workspaceUuid) return -1;
          if (a.workspaceUuid && !b.workspaceUuid) return 1;
          return 0;
        });

      } catch (ex) {
        console.error("Failed to initialize pins cache:", ex);
        this._pinsCache = [];
      }

      return this._pinsCache;
    }

    _initializePinnedTabs() {
      const pins = this._pinsCache;
      if (!pins?.length) {
        // If there are no pins, we should remove any existing pinned tabs
        for (let tab of gBrowser.tabs) {
          if (tab.pinned && !tab.getAttribute("zen-pin-id")) {
            gBrowser.removeTab(tab);
          }
        }
        return;
      }

      const activeTab = gBrowser.selectedTab;
      const pinnedTabsByUUID = new Map();
      const pinsToCreate = new Set(pins.map(p => p.uuid));

      // First pass: identify existing tabs and remove those without pins
      for (let tab of gBrowser.tabs) {
        const pinId = tab.getAttribute("zen-pin-id");
        if (!pinId) {
          continue;
        }

        if (pinsToCreate.has(pinId)) {
          // This is a valid pinned tab that matches a pin
          pinnedTabsByUUID.set(pinId, tab);
          pinsToCreate.delete(pinId);
        } else {
          // This is a pinned tab that no longer has a corresponding pin
          gBrowser.removeTab(tab);
        }
      }

      // Second pass: create new tabs for pins that don't have tabs
      for (let pin of pins) {
        if (!pinsToCreate.has(pin.uuid)) {
          continue; // Skip pins that already have tabs
        }

        let newTab = gBrowser.addTrustedTab(pin.url, {
          skipAnimation: true,
          userContextId: pin.containerTabId || 0,
          allowInheritPrincipal: false,
          createLazyBrowser: true,
          skipLoad: true,
        });

        // Set the favicon from cache
        if (!!pin.iconUrl) {
          // TODO: Figure out if there is a better way -
          //  calling gBrowser.setIcon messes shit up and should be avoided. I think this works for now.
          newTab.setAttribute("image", pin.iconUrl);
        }

        newTab.setAttribute("zen-pin-id", pin.uuid);
        gBrowser.setInitialTabTitle(newTab, pin.title);

        if (pin.workspaceUuid) {
          newTab.setAttribute("zen-workspace-id", pin.workspaceUuid);
        }

        gBrowser.pinTab(newTab);
      }

      // Restore active tab
      if (!activeTab.closing) {
        gBrowser.selectedTab = activeTab;
      }
    }

    _onPinnedTabEvent(action, event) {
      const tab = event.target;
      switch (action) {
        case "TabPinned":
          tab._zenClickEventListener = this._zenClickEventListener;
          tab.addEventListener("click", tab._zenClickEventListener);
          this._setPinnedAttributes(tab);
          break;
        case "TabUnpinned":
          this._removePinnedAttributes(tab);
          if (tab._zenClickEventListener) {
            tab.removeEventListener("click", tab._zenClickEventListener);
            delete tab._zenClickEventListener;
          }
          break;
          // TODO: Do this in a better way. Closing a second window could trigger remove tab and delete it from db
        // case "TabClose":
        //   this._removePinnedAttributes(tab);
        //   break;
        default:
          console.warn('ZenPinnedTabManager: Unhandled tab event', action);
          break;
      }
    }

    _onTabClick(e) {
      const tab = e.target;
      if (e.button === 1) {
        this._onCloseTabShortcut(e, tab);
      }
    }

    async resetPinnedTab(tab) {

      if (!tab) {
        tab = TabContextMenu.contextTab;
      }

      if (!tab || !tab.pinned) {
        return;
      }

      await this._resetTabToStoredState(tab);
    }

    async replacePinnedUrlWithCurrent() {
      const tab = TabContextMenu.contextTab;
      if (!tab || !tab.pinned || !tab.getAttribute("zen-pin-id")) {
        return;
      }

      const browser = tab.linkedBrowser;

      const pin = this._pinsCache.find(pin => pin.uuid === tab.getAttribute("zen-pin-id"));

      if (!pin) {
        return;
      }

      pin.title = tab.label || browser.contentTitle;
      pin.url = browser.currentURI.spec;
      pin.workspaceUuid = tab.getAttribute("zen-workspace-id");
      pin.userContextId = tab.getAttribute("userContextId");

      await ZenPinnedTabsStorage.savePin(pin);
      await this._refreshPinnedTabs();
    }

    async _setPinnedAttributes(tab) {

      if (tab.hasAttribute("zen-pin-id")) {
        return;
      }

      const browser = tab.linkedBrowser;

      const uuid = gZenUIManager.generateUuidv4();

      await ZenPinnedTabsStorage.savePin({
        uuid,
        title: tab.label || browser.contentTitle,
        url: browser.currentURI.spec,
        containerTabId: tab.getAttribute("userContextId"),
        workspaceUuid: tab.getAttribute("zen-workspace-id")
      });

      tab.setAttribute("zen-pin-id", uuid);

      await this._refreshPinnedTabs();
    }

    async _removePinnedAttributes(tab) {
      if(!tab.getAttribute("zen-pin-id")) {
        return;
      }

      await ZenPinnedTabsStorage.removePin(tab.getAttribute("zen-pin-id"));

      tab.removeAttribute("zen-pin-id");

      if(!tab.hasAttribute("zen-workspace-id") && ZenWorkspaces.workspaceEnabled) {
        const workspace = await ZenWorkspaces.getActiveWorkspace();
        tab.setAttribute("zen-workspace-id", workspace.uuid);
      }

      await this._refreshPinnedTabs();
    }

    _initClosePinnedTabShortcut() {
      let cmdClose = document.getElementById('cmd_close');

      if (cmdClose) {
        cmdClose.addEventListener('command', this._onCloseTabShortcut.bind(this));
      }
    }

    _onCloseTabShortcut(event, selectedTab = gBrowser.selectedTab) {
      if (
          !selectedTab?.pinned
      ) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();

      const behavior = lazy.zenPinnedTabCloseShortcutBehavior;

      switch (behavior) {
        case 'close':
          gBrowser.removeTab(selectedTab, { animate: true });
          break;
        case 'reset-unload-switch':
        case 'unload-switch':
        case 'reset-switch':
        case 'switch':
          this._handleTabSwitch(selectedTab);
          if (behavior.includes('reset')) {
            this._resetTabToStoredState(selectedTab);
          }
          if (behavior.includes('unload')) {
            gBrowser.discardBrowser(selectedTab);
          }
          break;
        case 'reset':
          this._resetTabToStoredState(selectedTab);
          break;
        default:
          return;
      }


    }

    _handleTabSwitch(selectedTab) {
      if(selectedTab !== gBrowser.selectedTab) {
        return;
      }
      const findNextTab = (direction) =>
          gBrowser.tabContainer.findNextTab(selectedTab, {
            direction,
            filter: tab => !tab.hidden && !tab.pinned,
          });

      let nextTab = findNextTab(1) || findNextTab(-1);

      if (!nextTab) {
        ZenWorkspaces._createNewTabForWorkspace({ uuid: ZenWorkspaces.activeWorkspace  });

        nextTab = findNextTab(1) || findNextTab(-1);
      }

      if (nextTab) {
        gBrowser.selectedTab = nextTab;
      }
    }

    async _resetTabToStoredState(tab) {
      const id = tab.getAttribute("zen-pin-id");

      if (!id) {
        return;
      }

      const pin = this._pinsCache.find(pin => pin.uuid === id);

      if (pin) {
        const tabState = SessionStore.getTabState(tab);
        const state = JSON.parse(tabState);
        const icon = await PlacesUtils.promiseFaviconData(pin.url);

        state.entries = [{
          url: pin.url,
          title: pin.title,
          triggeringPrincipal_base64: lazy.E10SUtils.SERIALIZED_SYSTEMPRINCIPAL
        }];
        state.image = icon;
        state.index = 0;

        SessionStore.setTabState(tab, state);
      }
    }

    _addGlobalPin() {
      const tab = TabContextMenu.contextTab;
      if (!tab || tab.pinned) {
        return;
      }

      tab.removeAttribute("zen-workspace-id");

      gBrowser.pinTab(tab);
    }

    _insertItemsIntoTabContextMenu() {
      const elements = window.MozXULElement.parseXULToFragment(`
            <menuseparator id="context_zen-pinned-tab-separator" hidden="true"/>
            <menuitem id="context_zen-replace-pinned-url-with-current"
                      data-lazy-l10n-id="tab-context-zen-replace-pinned-url-with-current"
                      hidden="true"
                      oncommand="gZenPinnedTabManager.replacePinnedUrlWithCurrent();"/>
            <menuitem id="context_zen-reset-pinned-tab"
                      data-lazy-l10n-id="tab-context-zen-reset-pinned-tab"
                      hidden="true"
                      oncommand="gZenPinnedTabManager.resetPinnedTab();"/>
        `);
      document.getElementById('tabContextMenu').appendChild(elements);

      const element = window.MozXULElement.parseXULToFragment(`
            <menuitem id="context_zen-pin-tab-global"
                      data-lazy-l10n-id="pin-tab-global"
                      hidden="true"
                      oncommand="gZenPinnedTabManager._addGlobalPin();"/>   
        `);

      document.getElementById('context_pinTab').after(element);
    }

    resetPinnedTabData(tabData) {
      if (lazy.zenPinnedTabRestorePinnedTabsToPinnedUrl && tabData.pinned && tabData.zenPinnedEntry) {
        tabData.entries = [JSON.parse(tabData.zenPinnedEntry)];
        tabData.image = tabData.zenPinnedIcon;
        tabData.index = 0;
      }
    }

    updatePinnedTabContextMenu(contextTab) {
      const isVisible = contextTab.pinned  && !contextTab.multiselected;
      document.getElementById("context_zen-reset-pinned-tab").hidden = !isVisible || !contextTab.getAttribute("zen-pin-id");
      document.getElementById("context_zen-replace-pinned-url-with-current").hidden = !isVisible;
      document.getElementById("context_zen-pin-tab-global").hidden = contextTab.pinned;
      document.getElementById("context_zen-pinned-tab-separator").hidden = !isVisible;
    }
  }

  window.gZenPinnedTabManager = new ZenPinnedTabManager();
}