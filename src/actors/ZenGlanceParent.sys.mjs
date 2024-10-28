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
        this.openGlance();
        break;
      }
    }
  }

  openGlance() {
    console.log('Opening glance');
  }
}
