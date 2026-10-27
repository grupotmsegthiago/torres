declare module "text-to-svg" {
  interface TextToSvgMetrics {
    width: number;
    height: number;
  }

  interface TextToSvgOptions {
    x?: number;
    y?: number;
    fontSize?: number;
    anchor?: string;
    attributes?: Record<string, string>;
  }

  class TextToSVG {
    static loadSync(file?: string): TextToSVG;
    getMetrics(text: string, options?: TextToSvgOptions): TextToSvgMetrics;
    getPath(text: string, options?: TextToSvgOptions): string;
  }

  export default TextToSVG;
}
