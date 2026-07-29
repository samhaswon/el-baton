declare module 'asciimath2tex/asciimath2tex.js' {
  const AsciiMathParser: new () => { parse: (input: string) => string };
  export default AsciiMathParser;
}
