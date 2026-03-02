/* IMPORT */

import {Container} from 'overstated';

/* COMPOSE */

const compose = ( containers: any ) => {

  return function ( MainContainer: any ) {

    return class ComposedContainer extends ( MainContainer as typeof Container ) {

      constructor () {

        super ();

        ( this as any ).ctx = ( this as any ).ctx || {};
        ( this as any ).state = ( this as any ).state || {};

        for ( let name in containers ) {

          const child = new containers[name]();

          child.ctx = this as any;

          ( this as any )[name] = child;
          ( this as any ).ctx[name] = child;
          ( this as any ).state[name] = Object.assign ( {}, child.state );

          const setState = child.setState;

          child.setState = async function ( this: any ) {

            await setState.apply ( child, arguments as any );

            const state = Object.assign ( {}, child.state );

            this.setState ({ [name]: state } as any );

          }.bind ( this );

        }

      }

    };

  };

};

/* EXPORT */

export default compose;
