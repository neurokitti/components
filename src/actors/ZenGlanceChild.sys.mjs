export class ZenGlanceChild extends JSWindowActorChild {
  constructor() {
    super();

    this.mouseUpListener = this.handleMouseUp.bind(this);
    this.mouseDownListener = this.handleMouseDown.bind(this);
    this.clickListener = this.handleClick.bind(this);
  }

  async handleEvent(event) {
    switch (event.type) {
      case 'DOMContentLoaded':
        await this.initiateGlance();
        break;
      default:
    }
  }

  async getActivationMethod() {
    if (this._activationMethod === undefined) {
      this._activationMethod = await this.sendQuery('ZenGlance:GetActivationMethod');
    }
    return this._activationMethod;
  }

  async getHoverActivationDelay() {
    if (this._hoverActivationDelay === undefined) {
      this._hoverActivationDelay = await this.sendQuery('ZenGlance:GetHoverActivationDelay');
    }
    return this._hoverActivationDelay;
  }

  async receiveMessage(message) {
    switch (message.name) {
    }
  }

  async initiateGlance() {
    this.mouseIsDown = false;
    const activationMethod = await this.getActivationMethod();
    if (activationMethod === 'hover') {
      this.contentWindow.addEventListener('mousedown', this.mouseDownListener);
      this.contentWindow.addEventListener('mouseup', this.mouseUpListener);

      this.contentWindow.document.removeEventListener('click', this.clickListener);
    } else if (activationMethod === 'ctrl' || activationMethod === 'alt' || activationMethod === 'shift') {
      this.contentWindow.document.addEventListener('click', this.clickListener);

      this.contentWindow.removeEventListener('mousedown', this.mouseDownListener);
      this.contentWindow.removeEventListener('mouseup', this.mouseUpListener);
    }
  }

  ensureOnlyKeyModifiers(event) {
    return !(event.ctrlKey ^ event.altKey ^ event.shiftKey);
  }

  openGlance(url) {
    this.sendAsyncMessage('ZenGlance:OpenGlance', { url });
  }

  handleMouseUp(event) {
    this.mouseIsDown = false;
  }

  async handleMouseDown(event) {
    if (event.target.tagName !== 'A') {
      return;
    }
    this.mouseIsDown = true;
    const hoverActivationDelay = await this.getHoverActivationDelay();
    setTimeout(() => {
      if (this.mouseIsDown) {
        this.openGlance(event.target.href);
      }
    }, hoverActivationDelay);
  }

  handleClick(event) {
    if (this.ensureOnlyKeyModifiers(event)) {
      return;
    }
    const activationMethod = this._activationMethod;
    if (activationMethod === 'ctrl' && !event.ctrlKey) {
      return;
    } else if (activationMethod === 'alt' && !event.altKey) {
      return;
    } else if (activationMethod === 'shift' && !event.shiftKey) {
      return;
    } else if (activationMethod === 'hover' || typeof activationMethod === 'undefined') {
      return;
    }
    // get closest A element
    const target = event.target.closest('A');
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      
      this.openGlance(target.href);
    }
  }
}
