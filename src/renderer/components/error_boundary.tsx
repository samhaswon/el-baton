
/* IMPORT */

import {is, openNewGitHubIssue} from '@common/electron_util_shim';
import * as os from 'os';
import * as React from 'react';
import pkg from '@root/package.json';

/* ERROR BOUNDARY */

type ErrorBoundaryProps = {
  children?: React.ReactNode;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, { error?: Error }> {

  /* STATE */

  state = {
    error: undefined as Error | undefined
  };

  /* SPECIAL */

  componentDidCatch ( error: Error ) {

    this.setState ({ error });

  }

  /* API */

  report = () => {

    const {error} = this.state;

    if ( !error ) return;

    openNewGitHubIssue ({
      repoUrl: pkg.homepage,
      title: `An error occurred: ${error.message}`,
      body: `- **OS Version**: ${os.platform} ${os.release}\n- **El Baton Version**: v${pkg.version}\n\n\`\`\`\n${error.stack}\n\`\`\``
    });

  }

  /* RENDER */

  render () {

    const {error} = this.state;

    if ( !error ) return this.props.children;

    const isMacOS = is.macos,
          errorCode = ( error as Error & { code?: number } ).code,
          errorTitle = errorCode ? `Error ${errorCode}` : 'An Error Occurred!';

    return (
      <div className="error-boundary app-wrapper layout">
        {!isMacOS ? null : (
          <div className="layout-header titlebar">
            <span className="title">{errorTitle}</span>
          </div>
        )}
        <div className="layout-content container sharp">
          {isMacOS ? null : (
            <h1 className="text-center">{errorTitle}</h1>
          )}
          <h2 className="text-center">{error.message}</h2>
          <pre className="error-stack">{error.stack}</pre>
        </div>
        <div className="layout-footer toolbar">
          <div className="button warning" onClick={this.report}>Report It</div>
        </div>
      </div>
    );

  }

}

/* EXPORT */

export default ErrorBoundary;
