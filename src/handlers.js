// -----------------------------------------------------------------------------
// The SDK handlers, wired to the app. Shared by index.js and the tests, so the
// tests run the exact wiring of the container. Every handler is registered
// before connect().
// -----------------------------------------------------------------------------

import { ACTIONS, WIDGETS } from './constants.js';

export function registerHandlers(gladys, app, logger) {
  // Commands from Gladys: device boxes, scenes, voice, assistants.
  gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

  // Discovery: the buttons, at every start, after every change and on a scan.
  gladys.onScanRequest(() => app.publishDiscovery());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onDeviceUpdated(() => app.reportStatus());
  gladys.onDeviceDeleted((device) => app.deviceDeleted(device));

  // Configuration screen actions.
  gladys.onAction(ACTIONS.ADD, (fields) => app.add(fields));
  gladys.onAction(ACTIONS.EDIT, (fields) => app.edit(fields));
  gladys.onAction(ACTIONS.REMOVE, (fields) => app.remove(fields));

  // Dashboard widget.
  gladys.onWidgetGet(WIDGETS.BUTTONS, (request) => app.getWidget(request));
  gladys.onWidgetAction(WIDGETS.BUTTONS, (actionKey, params) =>
    app.widgetAction(actionKey, params),
  );

  // Connection lifecycle (also after every reconnection to Gladys).
  gladys.on('connected', async () => {
    try {
      await app.connected();
    } catch (err) {
      logger?.error('Start failed', err);
    }
  });
}
