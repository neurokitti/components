
class ZenEssentialsToolbar extends PlacesViewBase {
    constructor(placesUrl, rootElt, viewElt) {
        // We'll initialize the places URL after ensuring the folder exists
        super(null, rootElt, viewElt);
        // Do initialization of properties that don't depend on Places
        this._init();
        this._initPlacesFolder();
    }

    get _accordionHeader() {
        return document.getElementById("essentials-accordion-header");
    }

    async _initPlacesFolder() {
        try {
            const ESSENTIALS_GUID = "pfgqteRgY-Wr"; // Fixed GUID for the folder

            // First try to fetch by GUID since it's more efficient
            let folder = await PlacesUtils.bookmarks.fetch(ESSENTIALS_GUID );

            if (!folder) {
                // If not found by GUID, try creating with our specific GUID
                // try {
                folder = await PlacesUtils.bookmarks.insert({
                    type: PlacesUtils.bookmarks.TYPE_FOLDER,
                    guid: ESSENTIALS_GUID,
                    title: "Zen Essentials",
                    parentGuid: PlacesUtils.bookmarks.menuGuid
                });
            }

            // Ensure the folder is in the right place with the right title
            if (folder.parentGuid !== PlacesUtils.bookmarks.menuGuid ||
                folder.title !== "Zen Essentials") {
                await PlacesUtils.bookmarks.update({
                    guid: folder.guid,
                    title: "Zen Essentials",
                    parentGuid: PlacesUtils.bookmarks.menuGuid,
                    index: folder.index
                });
            }

            if(!folder) {
                console.error("Failed to initialize ZenEssentials folder");
                return;
            }

            // Now that we have the folder, set up the places URL
            this.place = `place:parent=${folder.guid}`;

            // Initialize view event listeners and setup
            this._setupEventListeners();

        } catch (ex) {
            console.error("Failed to initialize ZenEssentials folder:", ex);
        }
    }

    _updateEssentialsVisibility() {
        // Get current preference value
        this.isEssentialsEnabled = Services.prefs.getBoolPref("zen.essentials.enabled", false);

        // Update visibility
        if (this._rootElt) {
            this._rootElt.hidden = !this.isEssentialsEnabled;
        }

        if (this._accordionHeader) {
            this._accordionHeader.style.display = this.isEssentialsEnabled ? "flex" : "none";
        }
    }

    // Called by PlacesViewBase during initialization
    _init() {
        this._prefObserver = (() => {
            this._updateEssentialsVisibility();
        }).bind(this);

        // Get initial preference value and set up observer
        Services.prefs.addObserver("zen.essentials.enabled", this._prefObserver);

        // Initialize visibility based on current pref value
        this.isEssentialsEnabled = Services.prefs.getBoolPref("zen.essentials.enabled", false);
        this._updateEssentialsVisibility();
        this._overFolder = {
            elt: null,
            openTimer: null,
            hoverTime: 350,
            closeTimer: null,
        };

        let thisView = this;
        [
            ["_dropIndicator", "EssentialsToolbarDropIndicator"],
        ].forEach(function (elementGlobal) {
            let [name, id] = elementGlobal;
            thisView.__defineGetter__(name, function () {
                let element = document.getElementById(id);
                if (!element) {
                    return null;
                }
                delete thisView[name];
                return (thisView[name] = element);
            });
        });

        // Initialize base properties
        this._viewElt._placesView = this;
        this._dragRoot = this._viewElt;
    }

    _setupEventListeners() {
        // Add standard event listeners
        this._addEventListeners(this._dragRoot, this._cbEvents, false);
        this._addEventListeners(this._rootElt, ["popupshowing", "popuphidden"], true);
        this._addEventListeners(window, ["unload"], false);
    }

    _cbEvents = [
        "dragstart",
        "dragover",
        "dragleave",
        "dragend",
        "drop",
        "mousemove",
        "mouseover",
        "mouseout",
        "mousedown",
    ];

    QueryInterface = ChromeUtils.generateQI([
        "nsINamed",
        "nsITimerCallback",
        ...PlacesViewBase.interfaces,
    ]);

    uninit() {
        if (this._prefObserver) {
            Services.prefs.removeObserver("zen.essentials.enabled", this._prefObserver);
            this._prefObserver = null;
        }
        if (this._dragRoot) {
            this._removeEventListeners(this._dragRoot, this._cbEvents, false);
        }
        this._removeEventListeners(
            this._rootElt,
            ["popupshowing", "popuphidden"],
            true
        );
        this._removeEventListeners(window, ["unload"], false);

        super.uninit();
    }

    _allowPopupShowing = true;



    get _isAlive() {
        return this._resultNode && this._rootElt;
    }

    async _rebuild() {
        if (this._overFolder.elt) {
            this._clearOverFolder();
        }

        while (this._rootElt.hasChildNodes()) {
            this._rootElt.firstChild.remove();
        }

        let cc = this._resultNode.childCount;
        if (cc > 0) {
            for (let i = 0; i < cc; i++) {
                this._insertNewItem(this._resultNode.getChild(i), this._rootElt);
            }
        }
    }

    _insertNewItem(aChild, aInsertionNode, aBefore = null) {
        this._domNodes.delete(aChild);

        let type = aChild.type;
        let button;
        if (type == Ci.nsINavHistoryResultNode.RESULT_TYPE_SEPARATOR) {
            button = document.createXULElement("toolbarseparator");
        } else {
            button = document.createXULElement("toolbarbutton");
            button.className = "bookmark-item";
            button.setAttribute("label", aChild.title || "");

            if (PlacesUtils.containerTypes.includes(type)) {
                button.setAttribute("type", "menu");
                button.setAttribute("container", "true");

                if (PlacesUtils.nodeIsQuery(aChild)) {
                    button.setAttribute("query", "true");
                    if (PlacesUtils.nodeIsTagQuery(aChild)) {
                        button.setAttribute("tagContainer", "true");
                    }
                }

                let popup = document.createXULElement("menupopup", {
                    is: "places-popup",
                });
                popup.setAttribute("placespopup", "true");
                popup.classList.add("toolbar-menupopup");
                button.appendChild(popup);
                popup._placesNode = PlacesUtils.asContainer(aChild);
                popup.setAttribute("context", "placesContext");

                this._domNodes.set(aChild, popup);
            } else if (PlacesUtils.nodeIsURI(aChild)) {
                button.setAttribute(
                    "scheme",
                    PlacesUIUtils.guessUrlSchemeForUI(aChild.uri)
                );
                button.hidden = ZenWorkspaces.isBookmarkInAnotherWorkspace(aChild);
                button.addEventListener("command", gZenGlanceManager.openGlanceForBookmark.bind(gZenGlanceManager));
            }
        }

        button._placesNode = aChild;
        let { icon } = button._placesNode;
        if (icon) {
            button.setAttribute("image", icon);
        }
        if (!this._domNodes.has(aChild)) {
            this._domNodes.set(aChild, button);
        }

        if (aBefore) {
            aInsertionNode.insertBefore(button, aBefore);
        } else {
            aInsertionNode.appendChild(button);
        }
        return button;
    }

    handleEvent(aEvent) {
        switch (aEvent.type) {
            case "unload":
                this.uninit();
                break;
            case "dragstart":
                this._onDragStart(aEvent);
                break;
            case "dragover":
                this._onDragOver(aEvent);
                break;
            case "dragleave":
                this._onDragLeave(aEvent);
                break;
            case "dragend":
                this._onDragEnd(aEvent);
                break;
            case "drop":
                this._onDrop(aEvent);
                break;
            case "mouseover":
                this._onMouseOver(aEvent);
                break;
            case "mousemove":
                this._onMouseMove(aEvent);
                break;
            case "mouseout":
                this._onMouseOut(aEvent);
                break;
            case "mousedown":
                this._onMouseDown(aEvent);
                break;
            case "popupshowing":
                this._onPopupShowing(aEvent);
                break;
            case "popuphidden":
                this._onPopupHidden(aEvent);
                break;
            default:
                throw new Error("Trying to handle unexpected event.");
        }
    }



    nodeInserted(aParentPlacesNode, aPlacesNode, aIndex) {
        let parentElt = this._getDOMNodeForPlacesNode(aParentPlacesNode);
        if (parentElt == this._rootElt) {
            let children = this._rootElt.children;
            if (aIndex > children.length) {
                return;
            }

            this._insertNewItem(
                aPlacesNode,
                this._rootElt,
                children[aIndex] || null
            );
            return;
        }

        super.nodeInserted(aParentPlacesNode, aPlacesNode, aIndex);
    }

    nodeRemoved(aParentPlacesNode, aPlacesNode, aIndex) {
        let parentElt = this._getDOMNodeForPlacesNode(aParentPlacesNode);
        if (parentElt == this._rootElt) {
            let elt = this._getDOMNodeForPlacesNode(aPlacesNode, true);
            if (!elt) {
                return;
            }

            if (elt.localName == "menupopup") {
                elt = elt.parentNode;
            }

            this._removeChild(elt);
            if (this._resultNode.childCount > this._rootElt.children.length) {
                this._insertNewItem(
                    this._resultNode.getChild(this._rootElt.children.length),
                    this._rootElt
                );
            }
            return;
        }

        super.nodeRemoved(aParentPlacesNode, aPlacesNode, aIndex);
    }

    nodeMoved(aPlacesNode, aOldParentPlacesNode, aOldIndex, aNewParentPlacesNode, aNewIndex) {
        let parentElt = this._getDOMNodeForPlacesNode(aNewParentPlacesNode);
        if (parentElt == this._rootElt) {
            let elt = this._getDOMNodeForPlacesNode(aPlacesNode, true);
            if (elt) {
                if (elt.localName == "menupopup") {
                    elt = elt.parentNode;
                }
                this._removeChild(elt);
            }

            this._insertNewItem(
                aPlacesNode,
                this._rootElt,
                this._rootElt.children[aNewIndex]
            );
            return;
        }

        super.nodeMoved(
            aPlacesNode,
            aOldParentPlacesNode,
            aOldIndex,
            aNewParentPlacesNode,
            aNewIndex
        );
    }

    nodeTitleChanged(aPlacesNode, aNewTitle) {
        let elt = this._getDOMNodeForPlacesNode(aPlacesNode, true);
        if (!elt || elt == this._rootElt) {
            return;
        }

        super.nodeTitleChanged(aPlacesNode, aNewTitle);

        if (elt.localName == "menupopup") {
            elt = elt.parentNode;
        }
    }

    invalidateContainer(aPlacesNode) {
        let elt = this._getDOMNodeForPlacesNode(aPlacesNode, true);
        // Nothing to do if it's a never-visible node.
        if (!elt) {
            return;
        }

        if (elt == this._rootElt) {
            // Container is the toolbar itself.
            let instance = (this._rebuildingInstance = {});
            if (!this._rebuilding) {
                this._rebuilding = Promise.withResolvers();
            }
            this._rebuild()
                .catch(console.error)
                .finally(() => {
                    if (instance == this._rebuildingInstance) {
                        this._rebuilding.resolve();
                        this._rebuilding = null;
                    }
                });
            return;
        }

        super.invalidateContainer(aPlacesNode);
    }

    _clearOverFolder() {
        // The mouse is no longer dragging over the stored menubutton.
        // Close the menubutton, clear out drag styles, and clear all
        // timers for opening/closing it.
        if (this._overFolder.elt && this._overFolder.elt.menupopup) {
            if (!this._overFolder.elt.menupopup.hasAttribute("dragover")) {
                this._overFolder.elt.menupopup.hidePopup();
            }
            this._overFolder.elt.removeAttribute("dragover");
            this._overFolder.elt = null;
        }
        if (this._overFolder.openTimer) {
            this._overFolder.openTimer.cancel();
            this._overFolder.openTimer = null;
        }
        if (this._overFolder.closeTimer) {
            this._overFolder.closeTimer.cancel();
            this._overFolder.closeTimer = null;
        }
    }

    /**
     * Determines the drop target while dragging over the vertical toolbar.
     *
     * @param {object} aEvent
     *   The drag event.
     * @returns {object}
     *   - ip: The insertion point for the bookmarks service.
     *   - beforeIndex: Child index to drop before, for the drop indicator.
     *   - folderElt: The folder to drop into, if applicable.
     */
    _getDropPoint(aEvent) {
        if (!PlacesUtils.nodeIsFolderOrShortcut(this._resultNode)) {
            return null;
        }

        let dropPoint = { ip: null, beforeIndex: null, folderElt: null };
        let elt = aEvent.target;

        // If we're not dragging over a child element, handle dropping at the end
        if (!elt._placesNode || elt == this._rootElt || elt.localName == "menupopup") {
            dropPoint.ip = new PlacesInsertionPoint({
                parentGuid: PlacesUtils.getConcreteItemGuid(this._resultNode),
                orientation: Ci.nsITreeView.DROP_BEFORE
            });
            dropPoint.beforeIndex = -1;

            // Find the closest child based on vertical position
            for (let i = 0; i < this._rootElt.children.length; i++) {
                let childRect = this._rootElt.children[i].getBoundingClientRect();
                if (aEvent.clientY <= childRect.top) {
                    dropPoint.beforeIndex = i;
                    dropPoint.ip.index = i;
                    break;
                }
            }
            return dropPoint;
        }

        // Get target element's position info
        let eltRect = elt.getBoundingClientRect();
        let eltIndex = Array.prototype.indexOf.call(this._rootElt.children, elt);

        // Handle dropping on folders
        if (PlacesUtils.nodeIsFolderOrShortcut(elt._placesNode) &&
            !PlacesUIUtils.isFolderReadOnly(elt._placesNode)) {

            // Define drop zones: top 25%, middle 50%, bottom 25%
            let topThreshold = eltRect.top + (eltRect.height * 0.25);
            let bottomThreshold = eltRect.bottom - (eltRect.height * 0.25);

            if (aEvent.clientY < topThreshold) {
                // Drop before folder
                dropPoint.ip = new PlacesInsertionPoint({
                    parentGuid: PlacesUtils.getConcreteItemGuid(this._resultNode),
                    index: eltIndex,
                    orientation: Ci.nsITreeView.DROP_BEFORE
                });
                dropPoint.beforeIndex = eltIndex;
            } else if (aEvent.clientY > bottomThreshold) {
                // Drop after folder
                let beforeIndex = eltIndex == this._rootElt.children.length - 1 ? -1 : eltIndex + 1;
                dropPoint.ip = new PlacesInsertionPoint({
                    parentGuid: PlacesUtils.getConcreteItemGuid(this._resultNode),
                    index: beforeIndex,
                    orientation: Ci.nsITreeView.DROP_BEFORE
                });
                dropPoint.beforeIndex = beforeIndex;
            } else {
                // Drop inside folder
                let tagName = PlacesUtils.nodeIsTagQuery(elt._placesNode)
                    ? elt._placesNode.title
                    : null;
                dropPoint.ip = new PlacesInsertionPoint({
                    parentGuid: PlacesUtils.getConcreteItemGuid(elt._placesNode),
                    tagName
                });
                dropPoint.beforeIndex = eltIndex;
                dropPoint.folderElt = elt;
            }
        } else {
            // Handle dropping around non-folder items
            let midPoint = eltRect.top + (eltRect.height / 2);

            if (aEvent.clientY < midPoint) {
                // Drop before item
                dropPoint.ip = new PlacesInsertionPoint({
                    parentGuid: PlacesUtils.getConcreteItemGuid(this._resultNode),
                    index: eltIndex,
                    orientation: Ci.nsITreeView.DROP_BEFORE
                });
                dropPoint.beforeIndex = eltIndex;
            } else {
                // Drop after item
                let beforeIndex = eltIndex == this._rootElt.children.length - 1 ? -1 : eltIndex + 1;
                dropPoint.ip = new PlacesInsertionPoint({
                    parentGuid: PlacesUtils.getConcreteItemGuid(this._resultNode),
                    index: beforeIndex,
                    orientation: Ci.nsITreeView.DROP_BEFORE
                });
                dropPoint.beforeIndex = beforeIndex;
            }
        }

        return dropPoint;
    }

    _setTimer(aTime) {
        let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(this, aTime, timer.TYPE_ONE_SHOT);
        return timer;
    }

    get name() {
        return "ZenEssentialsToolbar";
    }

    notify(aTimer) {
        if (aTimer == this._overFolder.openTimer) {
            this._overFolder.elt.menupopup.setAttribute("autoopened", "true");
            this._overFolder.elt.open = true;
            this._overFolder.openTimer = null;
        } else if (aTimer == this._overFolder.closeTimer) {
            let currentPlacesNode = PlacesControllerDragHelper.currentDropTarget;
            let inHierarchy = false;
            while (currentPlacesNode) {
                if (currentPlacesNode == this._rootElt) {
                    inHierarchy = true;
                    break;
                }
                currentPlacesNode = currentPlacesNode.parentNode;
            }
            if (inHierarchy) {
                this._overFolder.elt = null;
            }
            this._clearOverFolder();
        }
    }

    _onMouseOver(aEvent) {
        let button = aEvent.target;
        if (
            button.parentNode == this._rootElt &&
            button._placesNode &&
            PlacesUtils.nodeIsURI(button._placesNode)
        ) {
            window.XULBrowserWindow.setOverLink(aEvent.target._placesNode.uri);
        }
    }

    _onMouseOut() {
        window.XULBrowserWindow.setOverLink("");
    }

    _onMouseDown(aEvent) {
        let target = aEvent.target;
        if (
            aEvent.button == 0 &&
            target.localName == "toolbarbutton" &&
            target.getAttribute("type") == "menu"
        ) {


            let modifKey = aEvent.shiftKey || aEvent.getModifierState("Accel");
            if (modifKey) {
                // Do not open the popup since BEH_onClick is about to
                // open all child uri nodes in tabs.
                this._allowPopupShowing = false;
            }
        }
        PlacesUIUtils.maybeSpeculativeConnectOnMouseDown(aEvent);
    }

    _cleanupDragDetails() {
        // Called on dragend and drop.
        PlacesControllerDragHelper.currentDropTarget = null;
        this._draggedElt = null;
        this._dropIndicator.collapsed = true;
    }

    _onDragStart(aEvent) {
        // Sub menus have their own d&d handlers.
        let draggedElt = aEvent.target;
        if (draggedElt.parentNode != this._rootElt || !draggedElt._placesNode) {
            return;
        }

        if (
            draggedElt.localName == "toolbarbutton" &&
            draggedElt.getAttribute("type") == "menu"
        ) {
            // If the drag gesture on a container is toward down we open instead
            // of dragging.
            let translateY = this._cachedMouseMoveEvent.clientY - aEvent.clientY;
            let translateX = this._cachedMouseMoveEvent.clientX - aEvent.clientX;
            if (translateY >= Math.abs(translateX / 2)) {
                // Don't start the drag.
                aEvent.preventDefault();
                // Open the menu.
                draggedElt.open = true;
                return;
            }

            // If the menu is open, close it.
            if (draggedElt.open) {
                draggedElt.menupopup.hidePopup();
                draggedElt.open = false;
            }
        }

        // Activate the view and cache the dragged element.
        this._draggedElt = draggedElt._placesNode;
        this._rootElt.focus();

        this._controller.setDataTransfer(aEvent);
        aEvent.stopPropagation();
    }

    _onDragOver(aEvent) {
        // Cache the dataTransfer
        PlacesControllerDragHelper.currentDropTarget = aEvent.target;
        let dt = aEvent.dataTransfer;

        let dropPoint = this._getDropPoint(aEvent);
        if (
            !dropPoint ||
            !dropPoint.ip ||
            !PlacesControllerDragHelper.canDrop(dropPoint.ip, dt)
        ) {
            this._dropIndicator.collapsed = true;
            aEvent.stopPropagation();
            return;
        }

        if (dropPoint.folderElt) {
            let overElt = dropPoint.folderElt;
            if (this._overFolder.elt != overElt) {
                this._clearOverFolder();
                this._overFolder.elt = overElt;
                this._overFolder.openTimer = this._setTimer(this._overFolder.hoverTime);
            }
            if (!this._overFolder.elt.hasAttribute("dragover")) {
                this._overFolder.elt.setAttribute("dragover", "true");
            }

            this._dropIndicator.collapsed = true;
        } else {
            // Dragging over a normal toolbarbutton,
            // show indicator bar and move it to the appropriate drop point.
            let ind = this._dropIndicator;
            ind.parentNode.collapsed = false;
            let halfInd = ind.clientWidth / 2;
            let translateX;
            if (this.isRTL) {
                halfInd = Math.ceil(halfInd);
                translateX = 0 - this._rootElt.getBoundingClientRect().right - halfInd;
                if (this._rootElt.firstElementChild) {
                    if (dropPoint.beforeIndex == -1) {
                        translateX +=
                            this._rootElt.lastElementChild.getBoundingClientRect().left;
                    } else {
                        translateX +=
                            this._rootElt.children[
                                dropPoint.beforeIndex
                                ].getBoundingClientRect().right;
                    }
                }
            } else {
                halfInd = Math.floor(halfInd);
                translateX = 0 - this._rootElt.getBoundingClientRect().left + halfInd;
                if (this._rootElt.firstElementChild) {
                    if (dropPoint.beforeIndex == -1) {
                        translateX +=
                            this._rootElt.lastElementChild.getBoundingClientRect().right;
                    } else {
                        translateX +=
                            this._rootElt.children[
                                dropPoint.beforeIndex
                                ].getBoundingClientRect().left;
                    }
                }
            }

            ind.style.transform = "translate(" + Math.round(translateX) + "px)";
            ind.style.marginInlineStart = -ind.clientWidth + "px";
            ind.collapsed = false;

            // Clear out old folder information.
            this._clearOverFolder();
        }

        aEvent.preventDefault();
        aEvent.stopPropagation();
    }

    _onDrop(aEvent) {
        PlacesControllerDragHelper.currentDropTarget = aEvent.target;

        let dropPoint = this._getDropPoint(aEvent);
        if (dropPoint && dropPoint.ip) {
            PlacesControllerDragHelper.onDrop(
                dropPoint.ip,
                aEvent.dataTransfer
            ).catch(console.error);
            aEvent.preventDefault();
        }

        this._cleanupDragDetails();
        aEvent.stopPropagation();
    }

    _onDragLeave() {
        PlacesControllerDragHelper.currentDropTarget = null;

        this._dropIndicator.collapsed = true;

        // If we hovered over a folder, close it now.
        if (this._overFolder.elt) {
            this._overFolder.closeTimer = this._setTimer(this._overFolder.hoverTime);
        }
    }

    _onDragEnd() {
        this._cleanupDragDetails();
    }

    _onPopupShowing(aEvent) {
        if (!this._allowPopupShowing) {
            this._allowPopupShowing = true;
            aEvent.preventDefault();
            return;
        }

        let parent = aEvent.target.parentNode;
        if (parent.localName == "toolbarbutton") {
            this._openedMenuButton = parent;
        }

        super._onPopupShowing(aEvent);
    }

    _onPopupHidden(aEvent) {
        let popup = aEvent.target;
        let placesNode = popup._placesNode;
        // Avoid handling popuphidden of inner views
        if (
            placesNode &&
            PlacesUIUtils.getViewForNode(popup) == this &&
            // UI performance: folder queries are cheap, keep the resultnode open
            // so we don't rebuild its contents whenever the popup is reopened.
            !PlacesUtils.nodeIsFolderOrShortcut(placesNode)
        ) {
            placesNode.containerOpen = false;
        }

        let parent = popup.parentNode;
        if (parent.localName == "toolbarbutton") {
            this._openedMenuButton = null;
            // Clear the dragover attribute if present, if we are dragging into a
            // folder in the hierachy of current opened popup we don't clear
            // this attribute on clearOverFolder.  See Notify for closeTimer.
            if (parent.hasAttribute("dragover")) {
                parent.removeAttribute("dragover");
            }
        }
    }

    _onMouseMove(aEvent) {
        // Used in dragStart to prevent dragging folders when dragging down.
        this._cachedMouseMoveEvent = aEvent;

        if (
            this._openedMenuButton == null ||
            PlacesControllerDragHelper.getSession()
        ) {
            return;
        }

        let target = aEvent.originalTarget;
        if (
            this._openedMenuButton != target &&
            target.localName == "toolbarbutton" &&
            target.type == "menu"
        ) {
            this._openedMenuButton.open = false;
            target.open = true;
        }
    }
}