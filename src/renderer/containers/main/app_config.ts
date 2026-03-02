/* IMPORT */

import * as _ from 'lodash';
import {Container, autosuspend} from 'overstated';
import Config from '@common/config';
import GlobalConfig from '@common/global_config';

/* APP CONFIG */

class AppConfig extends Container<AppConfigState, MainCTX> {

  /* STATE */

  state = {
    config: GlobalConfig.read ( Config.cwd ),
    filePath: GlobalConfig.resolveWritablePath ( Config.cwd )
  };

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

  }

  /* HELPERS */

  _read () {

    const cwd = Config.cwd;

    return {
      config: GlobalConfig.read ( cwd ),
      filePath: GlobalConfig.resolveWritablePath ( cwd )
    };

  }

  /* API */

  get = (): import ( '@common/global_config' ).GlobalConfigShape => {

    return this.state.config;

  }

  getFilePath = (): string | undefined => {

    return this.state.filePath;

  }

  refresh = () => {

    return this.setState ( this._read () );

  }

  set = ( config: import ( '@common/global_config' ).GlobalConfigShape ) => {

    const cwd = Config.cwd;

    if ( !cwd ) return Promise.resolve ( undefined );

    const normalized = GlobalConfig.normalize ( _.cloneDeep ( config ) as any ),
          filePath = GlobalConfig.write ( cwd, normalized );

    return this.setState ({
      config: normalized,
      filePath
    });

  }

  setValue = ( dotPath: string, value: unknown ) => {

    const nextConfig = _.cloneDeep ( this.state.config ) as Record<string, unknown>;

    _.set ( nextConfig, dotPath, value );

    return this.set ( nextConfig as import ( '@common/global_config' ).GlobalConfigShape );

  }

}

/* EXPORT */

export default AppConfig;
