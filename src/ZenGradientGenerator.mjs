
{
  class ZenThemePicker extends ZenDOMOperatedFeature {
    static GRADIENT_IMAGE_URL = 'chrome://browser/content/zen-images/gradient.png';
    static MAX_DOTS = 5;

    init() {
      ChromeUtils.defineLazyGetter(this, 'panel', () => document.getElementById('PanelUI-zen-gradient-generator'));
      ChromeUtils.defineLazyGetter(this, 'toolbox', () => document.getElementById('navigator-toolbox'));

      this.initCanvas();
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

    initThemePicker() {
      const themePicker = this.panel.querySelector('.zen-theme-picker-gradient');
      themePicker.style.setProperty('--zen-theme-picker-gradient-image', `url(${ZenThemePicker.GRADIENT_IMAGE_URL})`);
      themePicker.addEventListener('mousemove', this.onDotMouseMove.bind(this));
      themePicker.addEventListener('mouseup', this.onDotMouseUp.bind(this));
    }

    calculateInitialPosition(color) {
      const [r, g, b] = color;
      // get the x and y position of the color
      const x = r / 255;
      const y = g / 255;
      return { x, y };
    }

    getColorFromPosition(x, y) {
      // get the color from the x and y from the image
      const imageData = this.canvasCtx.getImageData(x, y, 1, 1);
      return imageData.data;
    }

    createDot(color) {
      const [r, g, b] = color;
      const dot = document.createElement('div');
      dot.classList.add('zen-theme-picker-dot');
      dot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${r}, ${g}, ${b})`);
      const { x, y } = this.calculateInitialPosition(color);
      dot.style.left = `${x * 100}%`;
      dot.style.top = `${y * 100}%`;
      dot.addEventListener('mousedown', this.onDotMouseDown.bind(this));
      this.panel.querySelector('.zen-theme-picker-gradient').appendChild(dot);
    }

    onDotMouseDown(event) {
      event.preventDefault();
      if (event.button === 2) {
        this.draggedDot.remove();
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
        let x = (event.clientX - rect.left) / rect.width;
        let y = (event.clientY - rect.top) / rect.height;
        // percentage to pixel
        const dotSize = 16;
        const maxX = rect.width - dotSize;
        const maxY = rect.height - dotSize;
        if (x < 0) {
          x = 0.01;
        } else if (x > 1) {
          x = 0.99;
        }
        if (y < 0) {
          y = 0.01;
        } else if (y > 1) {
          y = 0.99;
        }
        const pixelX = x * rect.width - dotSize*2;
        const pixelY = y * rect.height - dotSize*2;
        this.draggedDot.style.left = `${Math.min(maxX, Math.max(0, pixelX))}px`;
        this.draggedDot.style.top = `${Math.min(maxY, Math.max(0, pixelY))}px`;
        const color = this.getColorFromPosition(pixelX, pixelY);
        this.draggedDot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
      }
    }

    onDotMouseUp(event) {
      if (this.dragging) {
        event.preventDefault();
        this.dragging = false;
        this.draggedDot.style.zIndex = 0;
        this.draggedDot.classList.remove('dragging');
        this.draggedDot = null;
        return;
      }
      this.numberOfDots = this.panel.querySelectorAll('.zen-theme-picker-dot').length;
      if (this.numberOfDots < ZenThemePicker.MAX_DOTS) {
        this.createDot([Math.random() * 255, Math.random() * 255, Math.random() * 255]);
      }
    }
  }

  window.gZenThemePicker = new ZenThemePicker();
}
