
{
  class ZenThemePicker extends ZenDOMOperatedFeature {
    static GRADIENT_IMAGE_URL = 'chrome://browser/content/zen-images/gradient.png';
    static GRADIENT_DISPLAY_URL = 'chrome://browser/content/zen-images/gradient-display.png';
    static MAX_DOTS = 5;

    currentOpacity = 0.5;
    currentRotation = 45;

    init() {
      if (!Services.prefs.getBoolPref('zen.theme.gradient', true)) {
        return;
      }

      ChromeUtils.defineLazyGetter(this, 'panel', () => document.getElementById('PanelUI-zen-gradient-generator'));
      ChromeUtils.defineLazyGetter(this, 'toolbox', () => document.getElementById('TabsToolbar'));
      ChromeUtils.defineLazyGetter(this, 'customColorInput', () => document.getElementById('PanelUI-zen-gradient-generator-custom-input'));
      ChromeUtils.defineLazyGetter(this, 'customColorList', () => document.getElementById('PanelUI-zen-gradient-generator-custom-list'));

      this.initRotation();
      this.initCanvas();

      ZenWorkspaces.addChangeListeners(this.onWorkspaceChange.bind(this));
      window.matchMedia('(prefers-color-scheme: dark)').addListener(this.onDarkModeChange.bind(this));
    }

    get isDarkMode() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    async onDarkModeChange(event, skipUpdate = false) {
      const currentWorkspace = await ZenWorkspaces.getActiveWorkspace();
      this.onWorkspaceChange(currentWorkspace, skipUpdate);
    }

    initContextMenu() {
      const menu = window.MozXULElement.parseXULToFragment(`
        <menuitem id="zenToolbarThemePicker"
                  data-lazy-l10n-id="zen-workspaces-change-gradient"
                  oncommand="gZenThemePicker.openThemePicker(event);"/>
      `);
      document.getElementById('toolbar-context-customize').before(menu);
    }

    openThemePicker(event) {
      PanelMultiView.openPopup(this.panel, this.toolbox, {
        position: 'topright topleft',
        triggerEvent: event,
      });
    }

    initCanvas() {
      this.image = new Image();
      this.image.src = ZenThemePicker.GRADIENT_IMAGE_URL;

      // wait for the image to load
      this.image.onload = this.onImageLoad.bind(this);
    }

    onImageLoad() {
      // resize the image to fit the panel
      const imageSize = 300 - 20; // 20 is the padding (10px)
      const scale = imageSize / Math.max(this.image.width, this.image.height);
      this.image.width *= scale;
      this.image.height *= scale;

      this.canvas = document.createElement('canvas');
      this.canvas.width = this.image.width;
      this.canvas.height = this.image.height;
      this.panel.appendChild(this.canvas);
      this.canvasCtx = this.canvas.getContext('2d');
      this.canvasCtx.drawImage(this.image, 0, 0);

      this.canvas.setAttribute('hidden', 'true');

      // Call the rest of the initialization
      this.initContextMenu();
      this.initThemePicker();
    }

    initRotation() {
      this.rotationInput = document.getElementById('PanelUI-zen-gradient-degrees');
      this.rotationInputDot = this.rotationInput.querySelector('.dot');
      this.rotationInputText = this.rotationInput.querySelector('.text');
      this.rotationInputDot.addEventListener('mousedown', this.onRotationMouseDown.bind(this));
      this.rotationInput.addEventListener('wheel', this.onRotationWheel.bind(this));
    }

    onRotationWheel(event) {
      event.preventDefault();
      const delta = event.deltaY;
      const degrees = this.currentRotation + (delta > 0 ? 10 : -10);
      this.setRotationInput(degrees);
      this.updateCurrentWorkspace();
    }

    onRotationMouseDown(event) {
      event.preventDefault();
      this.rotationDragging = true;
      this.rotationInputDot.style.zIndex = 2;
      this.rotationInputDot.classList.add('dragging');
      document.addEventListener('mousemove', this.onRotationMouseMove.bind(this));
      document.addEventListener('mouseup', this.onRotationMouseUp.bind(this));
    }

    onRotationMouseUp(event) {
      this.rotationDragging = false;
      this.rotationInputDot.style.zIndex = 1;
      this.rotationInputDot.classList.remove('dragging');
      document.removeEventListener('mousemove', this.onRotationMouseMove.bind(this));
      document.removeEventListener('mouseup', this.onRotationMouseUp.bind(this));
    }

    onRotationMouseMove(event) {
      if (this.rotationDragging) {
        event.preventDefault();
        const rect = this.rotationInput.getBoundingClientRect();
        // Make the dot follow the mouse in a circle, it can't go outside or inside the circle
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
        const distance = Math.sqrt((event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2);
        const radius = rect.width / 2;
        let x = centerX + Math.cos(angle) * radius;
        let y = centerY + Math.sin(angle) * radius;
        if (distance > radius) {
          x = event.clientX;
          y = event.clientY;
        }
        const degrees = Math.round(Math.atan2(y - centerY, x - centerX) * 180 / Math.PI);
        this.setRotationInput(degrees);
        this.updateCurrentWorkspace();
      }
    }

    setRotationInput(degrees) {
      let fixedRotation = degrees;
      while (fixedRotation < 0) {
        fixedRotation += 360;
      }
      while (fixedRotation >= 360) {
        fixedRotation -= 360;
      }
      this.currentRotation = degrees;
      this.rotationInputDot.style.transform = `rotate(${degrees - 20}deg)`;
      this.rotationInputText.textContent = `${fixedRotation}°`;
    }

    initThemePicker() {
      const themePicker = this.panel.querySelector('.zen-theme-picker-gradient');
      themePicker.style.setProperty('--zen-theme-picker-gradient-image', `url(${ZenThemePicker.GRADIENT_DISPLAY_URL})`);
      themePicker.addEventListener('mousemove', this.onDotMouseMove.bind(this));
      themePicker.addEventListener('mouseup', this.onDotMouseUp.bind(this));
    }

    calculateInitialPosition(color) {
      const [r, g, b] = color.c;
      const imageData = this.canvasCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const pixels = imageData.data;
      let x = 0;
      let y = 0;
      let minDistance = Infinity;
      for (let i = 0; i < pixels.length; i += 4) {
        const r2 = pixels[i];
        const g2 = pixels[i + 1];
        const b2 = pixels[i + 2];
        const distance = Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2);
        if (distance < minDistance) {
          minDistance = distance;
          x = (i / 4) % this.canvas.width;
          y = Math.floor((i / 4) / this.canvas.width);
        }
      }
      return { x: x / this.canvas.width, y: y / this.canvas.height };
    }

    getColorFromPosition(x, y) {
      // get the color from the x and y from the image
      const imageData = this.canvasCtx.getImageData(x, y, 1, 1);
      return imageData.data;
    }

    createDot(color, fromWorkspace = false) {
      if (color.isCustom) {
        this.addColorToCustomList(color.c);
      }
      const [r, g, b] = color.c;
      const dot = document.createElement('div');
      dot.classList.add('zen-theme-picker-dot');
      if (color.isCustom) {
        if (!color.c) {
          return;
        }
        dot.classList.add('custom');
        dot.style.opacity = 0;
        dot.style.setProperty('--zen-theme-picker-dot-color', color.c);
      } else {
        dot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${r}, ${g}, ${b})`);
        const { x, y } = this.calculateInitialPosition(color);
        dot.style.left = `${x * 100}%`;
        dot.style.top = `${y * 100}%`;
        dot.addEventListener('mousedown', this.onDotMouseDown.bind(this));
      }
      this.panel.querySelector('.zen-theme-picker-gradient').appendChild(dot);
      if (!fromWorkspace) {
        this.onDarkModeChange(null, true);
      }
    }

    onDotMouseDown(event) {
      event.preventDefault();
      if (event.button === 2) {
        return;
      }
      this.dragging = true;
      this.draggedDot = event.target;
      this.draggedDot.style.zIndex = 1;
      this.draggedDot.classList.add('dragging');
    }

    onDotMouseMove(event) {
      if (this.dragging) {
        event.preventDefault();
        const rect = this.panel.querySelector('.zen-theme-picker-gradient').getBoundingClientRect();
        const padding = 90; // each side
        // do NOT let the ball be draged outside of an imaginary circle. You can drag it anywhere inside the circle
        // if the distance between the center of the circle and the dragged ball is bigger than the radius, then the ball 
        // should be placed on the edge of the circle. If it's inside the circle, then the ball just follows the mouse
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const radius = (rect.width - padding) / 2;
        let pixelX = event.clientX;
        let pixelY = event.clientY;
        const distance = Math.sqrt((pixelX - centerX) ** 2 + (pixelY - centerY) ** 2);
        if (distance > radius) {
          const angle = Math.atan2(pixelY - centerY, pixelX - centerX);
          pixelX = centerX + Math.cos(angle) * radius;
          pixelY = centerY + Math.sin(angle) * radius;
        }
        // set the location of the dot in pixels
        const relativeX = pixelX - rect.left;
        const relativeY = pixelY - rect.top;
        this.draggedDot.style.left = `${relativeX}px`;
        this.draggedDot.style.top = `${relativeY}px`;
        const color = this.getColorFromPosition(relativeX, relativeY);
        this.draggedDot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
        this.updateCurrentWorkspace();
      }
    }

    addColorToCustomList(color) {
      const listItems = window.MozXULElement.parseXULToFragment(`
        <hbox class="zen-theme-picker-custom-list-item">
          <html:div class="zen-theme-picker-dot-custom"></html:div>
          <label class="zen-theme-picker-custom-list-item-label"></label>
          <toolbarbutton class="zen-theme-picker-custom-list-item-remove toolbarbutton-1" oncommand="gZenThemePicker.removeCustomColor(event);"></toolbarbutton>
        </hbox>
      `);
      listItems.querySelector('.zen-theme-picker-custom-list-item').setAttribute('data-color', color);
      listItems.querySelector('.zen-theme-picker-dot-custom').style.setProperty('--zen-theme-picker-dot-color', color);
      listItems.querySelector('.zen-theme-picker-custom-list-item-label').textContent = color;
      this.customColorList.appendChild(listItems);
    }

    async addCustomColor() {
      const color = this.customColorInput.value;
      if (!color) {
        return;
      }
      // can be any color format, we just add it to the list as a dot, but hidden
      const dot = document.createElement('div');
      dot.classList.add('zen-theme-picker-dot', 'hidden', 'custom');
      dot.style.opacity = 0;
      dot.style.setProperty('--zen-theme-picker-dot-color', color);
      this.panel.querySelector('.zen-theme-picker-gradient').appendChild(dot);
      this.customColorInput.value = '';
      await this.updateCurrentWorkspace();
    }

    onDotMouseUp(event) {
      if (event.button === 2) {
        if (this.numberOfDots < 2 || !event.target.classList.contains('zen-theme-picker-dot')
            || this.numberOfDots === 1) {
          return;
        }
        event.target.remove();
        this.updateCurrentWorkspace();
        return;
      }
      if (this.dragging) {
        event.preventDefault();
        this.dragging = false;
        this.draggedDot.style.zIndex = 1;
        this.draggedDot.classList.remove('dragging');
        this.draggedDot = null;
        return;
      }
      this.numberOfDots = this.panel.querySelectorAll('.zen-theme-picker-dot').length;
      if (this.numberOfDots < ZenThemePicker.MAX_DOTS) {
        this.createDot({c:[Math.random() * 255, Math.random() * 255, Math.random() * 255]});
      }
    }

    themedColors(colors) {
      const isDarkMode = this.isDarkMode;
      const factor = isDarkMode ? 0.5 : 1.1;
      return colors.map(color => {
        return {
          c: color.isCustom ? color.c : [
            Math.min(255, color.c[0] * factor),
            Math.min(255, color.c[1] * factor),
            Math.min(255, color.c[2] * factor),
          ],
          isCustom: color.isCustom,
        }
      });
    }

    onOpacityChange(event) {
      this.currentOpacity = event.target.value;
      this.updateCurrentWorkspace();
    }

    onTextureChange(event) {
      this.currentTexture = event.target.value;
      this.updateCurrentWorkspace();
    }

    getSingleRGBColor(color) {
      if (color.isCustom) {
        return color.c;
      }
      return `color-mix(in srgb, rgb(${color.c[0]}, ${color.c[1]}, ${color.c[2]}) ${this.currentOpacity * 100}%, var(--zen-themed-toolbar-bg) ${(1 - this.currentOpacity) * 100}%)`;
    }
      

    getGradient(colors) {
      const themedColors = this.themedColors(colors);
      if (themedColors.length === 1) {
        return this.getSingleRGBColor(themedColors[0]);
      }
      return `linear-gradient(${this.currentRotation}deg, ${themedColors.map(color => this.getSingleRGBColor(color)).join(', ')})`;
    }

    getTheme(colors, opacity = 0.5, rotation = 45, texture = 0) {
      return {
        type: 'gradient',
        gradientColors: colors.filter(color => color), // remove undefined
        opacity,
        rotation,
        texture,
      }
    }

    updateNoise(texture) {
      const wrapper = document.getElementById('zen-main-app-wrapper');
      wrapper.style.setProperty('--zen-grainy-background-opacity', texture);
    }

    async onWorkspaceChange(workspace, skipUpdate = false) {
      const uuid = workspace.uuid;
      const theme = await ZenWorkspacesStorage.getWorkspaceTheme(uuid);
      const appWrapepr = document.getElementById('zen-main-app-wrapper');
      if (!skipUpdate) {
        appWrapepr.removeAttribute('animating');
        appWrapepr.setAttribute('animating', 'true');
        document.body.style.setProperty('--zen-main-browser-background-old', document.body.style.getPropertyValue('--zen-main-browser-background'));
        window.requestAnimationFrame(() => {
          setTimeout(() => {
            appWrapepr.removeAttribute('animating');
          }, 600);
        });
      }
      this.customColorList.innerHTML = '';
      if (!theme || theme.type !== 'gradient') {
        document.body.style.removeProperty('--zen-main-browser-background');
        this.updateNoise(0);
        if (!skipUpdate) {
          for (const dot of this.panel.querySelectorAll('.zen-theme-picker-dot')) {
            dot.remove();
          }
        }
        return;
      }
      this.currentOpacity = theme.opacity || 0.5;
      this.currentRotation = theme.rotation || 45;
      this.currentTexture = theme.texture || 0;
      document.getElementById('PanelUI-zen-gradient-generator-opacity').value = this.currentOpacity;
      document.getElementById('PanelUI-zen-gradient-generator-texture').value = this.currentTexture;
      this.setRotationInput(this.currentRotation);
      const gradient = this.getGradient(theme.gradientColors);
      this.updateNoise(theme.texture);
      for (const dot of theme.gradientColors) {
        if (dot.isCustom) {
          this.addColorToCustomList(dot.c);
        }
      }
      document.body.style.setProperty('--zen-main-browser-background', gradient);
      if (!skipUpdate) {
        this.recalculateDots(theme.gradientColors);
      }
    }

    removeCustomColor(event) {
      const target = event.target.closest('.zen-theme-picker-custom-list-item');
      const color = target.getAttribute('data-color');
      const dots = this.panel.querySelectorAll('.zen-theme-picker-dot');
      for (const dot of dots) {
        if (dot.style.getPropertyValue('--zen-theme-picker-dot-color') === color) {
          dot.remove();
          break;
        }
      }
      target.remove();
      this.updateCurrentWorkspace();
    }

    recalculateDots(colors) {
      const dots = this.panel.querySelectorAll('.zen-theme-picker-dot');
      for (let i = 0; i < colors.length; i++) {
        dots[i]?.remove();
      }
      for (const color of colors) {
        this.createDot(color, true);
      }
    }

    async updateCurrentWorkspace() {
      const dots = this.panel.querySelectorAll('.zen-theme-picker-dot');
      const colors = Array.from(dots).map(dot => {
        const color = dot.style.getPropertyValue('--zen-theme-picker-dot-color');
        if (color === 'undefined') {
          return;
        }
        const isCustom = dot.classList.contains('custom');
        return {c: isCustom ? color : color.match(/\d+/g).map(Number), isCustom};
      });
      const gradient = this.getTheme(colors, this.currentOpacity, this.currentRotation, this.currentTexture);
      const currentWorkspace = await ZenWorkspaces.getActiveWorkspace();
      await ZenWorkspacesStorage.saveWorkspaceTheme(currentWorkspace.uuid, gradient);
      this.onWorkspaceChange(currentWorkspace, true);
    }
  }

  window.gZenThemePicker = new ZenThemePicker();
}
