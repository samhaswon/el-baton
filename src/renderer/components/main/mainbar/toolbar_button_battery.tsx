/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import ToolbarButton from './toolbar_button';

/* TOOLBAR BUTTON BATTERY */

const ToolbarButtonBattery = ({ isBatteryModeActive, batteryModeEnabled, hasBatteryPowerDetection, isOnBatteryPower, toggleBatteryMode }) => {

  const modeLabel = isBatteryModeActive ? 'On-Battery Mode: Active' : 'On-Battery Mode: Inactive',
        powerLabel = hasBatteryPowerDetection ? ( isOnBatteryPower ? 'Power Source: Battery' : 'Power Source: AC' ) : 'Power Source: Unknown',
        icon = isBatteryModeActive ? 'battery_full' : 'battery_std',
        title = `${batteryModeEnabled ? 'Disable' : 'Enable'} Manual On-Battery Mode\n${modeLabel}\n${powerLabel}`;

  return (
    <ToolbarButton icon={icon} title={title} isActive={isBatteryModeActive} onClick={toggleBatteryMode} />
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isBatteryModeActive: container.window.isBatteryModeActive (),
    batteryModeEnabled: container.appConfig.get ().battery.enabled,
    hasBatteryPowerDetection: container.window.hasBatteryPowerDetection (),
    isOnBatteryPower: container.window.isOnBatteryPower (),
    toggleBatteryMode: () => {
      const current = container.appConfig.get ().battery.enabled;
      return container.appConfig.setValue ( 'battery.enabled', !current );
    }
  })
})( ToolbarButtonBattery );
