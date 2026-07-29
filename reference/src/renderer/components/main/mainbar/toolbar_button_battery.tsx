/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import ToolbarButton from './toolbar_button';

/* TOOLBAR BUTTON BATTERY */

const ToolbarButtonBattery = ({ isBatteryModeActive, batteryAutoDetect, hasBatteryPowerDetection, isOnBatteryPower, toggleBatteryMode }) => {

  const modeLabel = isBatteryModeActive ? 'On-Battery Mode: Active' : 'On-Battery Mode: Inactive',
        powerLabel = hasBatteryPowerDetection ? ( isOnBatteryPower ? 'Power Source: Battery' : 'Power Source: AC' ) : 'Power Source: Unknown',
        icon = isOnBatteryPower ? 'on_battery' : 'on_ac',
        disableLabel = ( isOnBatteryPower && batteryAutoDetect ) ? 'Disable On-Battery Mode (also turns off auto-detect)' : 'Disable On-Battery Mode',
        enableLabel = 'Enable Manual On-Battery Mode',
        title = `${isBatteryModeActive ? disableLabel : enableLabel}\n${modeLabel}\n${powerLabel}`;

  return <ToolbarButton icon={icon} title={title} isActive={isBatteryModeActive} onClick={toggleBatteryMode} />;

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isBatteryModeActive: container.window.isBatteryModeActive (),
    batteryAutoDetect: container.appConfig.get ().battery.autoDetect,
    hasBatteryPowerDetection: container.window.hasBatteryPowerDetection (),
    isOnBatteryPower: container.window.isOnBatteryPower (),
    toggleBatteryMode: () => {
      const config = container.appConfig.get (),
            isOnBatteryPower = container.window.isOnBatteryPower (),
            isBatteryModeActive = container.window.isBatteryModeActive ();

      if ( isBatteryModeActive ) {
        return container.appConfig.set ({
          ...config,
          battery: {
            ...config.battery,
            enabled: false,
            autoDetect: isOnBatteryPower ? false : config.battery.autoDetect
          }
        });
      }

      return container.appConfig.set ({
        ...config,
        battery: {
          ...config.battery,
          enabled: true
        }
      });
    }
  })
})( ToolbarButtonBattery );
