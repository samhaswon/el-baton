"use strict";
/* TYPES */
Object.defineProperty(exports, "__esModule", { value: true });
/* HELPERS */
const PlantUML = {
    graphvizDownloadUrl: 'https://www.graphviz.org/download/',
    normalizeSource(rawSource) {
        const source = String(rawSource || ''), lines = source.replace(/\r\n?/g, '\n').split('\n'), nonEmptyIndexes = lines.reduce((indexes, line, index) => {
            if (line.trim())
                indexes.push(index);
            return indexes;
        }, []);
        if (!nonEmptyIndexes.length)
            return '';
        const firstLineIndex = nonEmptyIndexes[0], lastLineIndex = nonEmptyIndexes[nonEmptyIndexes.length - 1], firstLine = lines[firstLineIndex].trim(), lastLine = lines[lastLineIndex].trim(), startMatch = firstLine.match(/^@start(\w+)?\b/i), endMatch = lastLine.match(/^@end(\w+)?\b/i);
        if (startMatch && endMatch)
            return lines.join('\n');
        const startSuffix = (startMatch?.[1] || endMatch?.[1] || 'uml').toLowerCase(), endSuffix = (endMatch?.[1] || startMatch?.[1] || 'uml').toLowerCase(), outputLines = [];
        if (!startMatch) {
            outputLines.push(`@start${startSuffix}`);
        }
        outputLines.push(...lines);
        if (!endMatch) {
            outputLines.push(`@end${endSuffix}`);
        }
        return outputLines.join('\n');
    },
    isGraphvizMissingError(rawMessage) {
        const message = String(rawMessage || '').toLowerCase();
        if (!message)
            return false;
        return (/cannot find graphviz/.test(message) ||
            /graphviz[^\n]*not found/.test(message) ||
            /dot executable/.test(message) ||
            /file does not exist/.test(message) && /\bdot\b/.test(message) ||
            /testdot/.test(message) ||
            /failed to execute dot/.test(message));
    },
    normalizeLocalError(rawMessage) {
        if (PlantUML.isGraphvizMissingError(rawMessage)) {
            return 'Graphviz is required for local PlantUML rendering but was not found.';
        }
        return rawMessage;
    },
    getErrorHelpUrl(rawMessage, origin = 'local') {
        if (origin !== 'local')
            return;
        if (PlantUML.isGraphvizMissingError(rawMessage)) {
            return PlantUML.graphvizDownloadUrl;
        }
    },
    normalizeServerUrl(rawUrl) {
        const value = String(rawUrl || '').trim();
        if (!value)
            return;
        const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        try {
            const url = new URL(withProtocol);
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                return;
            // Keep pathname prefix support while avoiding trailing slashes duplicates.
            url.pathname = url.pathname.replace(/\/+$/g, '') || '/plantuml';
            url.search = '';
            url.hash = '';
            return url.toString().replace(/\/+$/g, '');
        }
        catch (error) {
            return;
        }
    },
    buildRemoteSvgUrl(serverUrl, encodedDiagram) {
        let url;
        try {
            url = new URL(serverUrl);
        }
        catch (error) {
            return `${serverUrl.replace(/\/+$/g, '')}/svg/${encodedDiagram}`;
        }
        const normalizedPath = url.pathname.replace(/\/+/g, '/').replace(/\/+$/g, '') || '', svgWithPayloadMatch = normalizedPath.match(/^(.*)\/svg\/[^/]+$/i);
        if (/\/svg$/i.test(normalizedPath)) {
            url.pathname = `${normalizedPath}/${encodedDiagram}`;
        }
        else if (svgWithPayloadMatch) {
            url.pathname = `${svgWithPayloadMatch[1] || ''}/svg/${encodedDiagram}`;
        }
        else {
            url.pathname = `${normalizedPath}/svg/${encodedDiagram}` || `/svg/${encodedDiagram}`;
        }
        url.search = '';
        url.hash = '';
        return url.toString();
    },
    clampCacheEntries(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            return 400;
        return Math.max(20, Math.min(5000, Math.round(parsed)));
    },
    clampCacheBytes(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            return 64 * 1024 * 1024;
        return Math.max(1 * 1024 * 1024, Math.min(512 * 1024 * 1024, Math.round(parsed)));
    },
    clampTimeoutMs(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            return 12000;
        return Math.max(1000, Math.min(120000, Math.round(parsed)));
    }
};
exports.default = PlantUML;
