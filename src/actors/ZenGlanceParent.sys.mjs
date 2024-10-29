export class ZenGlanceParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  async receiveMessage(message) {
    switch (message.name) {
      case 'ZenGlance:GetActivationMethod': {
        return Services.prefs.getStringPref('zen.glance.activation-method', 'ctrl');
      }
      case 'ZenGlance:GetHoverActivationDelay': {
        return Services.prefs.getIntPref('zen.glance.hold-duration', 500);
      }
      case 'ZenGlance:OpenGlance': {
        this.openGlance(message.data);
        break;
      }
    }
  }

  openGlance(data) {
    Services.obs.notifyObservers(null, 'zen-glance-open', JSON.stringify(data));
  }
}