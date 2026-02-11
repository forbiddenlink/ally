/**
 * Type declarations for apca-w3 package
 * APCA: Advanced Perceptual Contrast Algorithm
 */
declare module "apca-w3" {
  /**
   * Calculate APCA contrast between text and background luminance values
   * @param txtY - Text luminance (0.0-1.0)
   * @param bgY - Background luminance (0.0-1.0)
   * @param places - Decimal places (-1 for float, 0+ for string)
   * @returns Lc contrast value (typically -108 to +106)
   */
  export function APCAcontrast(txtY: number, bgY: number, places?: number): number | string;

  /**
   * Convert sRGB color to luminance (Y)
   * @param rgb - RGB array [r, g, b] with values 0-255
   * @returns Luminance value 0.0-1.0
   */
  export function sRGBtoY(rgb: [number, number, number] | number[]): number;

  /**
   * Convert Display P3 color to luminance (Y)
   * @param rgb - RGB array [r, g, b] with values 0.0-1.0
   * @returns Luminance value 0.0-1.0
   */
  export function displayP3toY(rgb: [number, number, number] | number[]): number;

  /**
   * Convert Adobe RGB color to luminance (Y)
   * @param rgb - RGB array [r, g, b] with values 0-255
   * @returns Luminance value 0.0-1.0
   */
  export function adobeRGBtoY(rgb: [number, number, number] | number[]): number;

  /**
   * Calculate APCA contrast from color values (convenience function)
   * @param textColor - Text color (hex, rgb string, or array)
   * @param bgColor - Background color (hex, rgb string, or array)
   * @param places - Decimal places
   * @param round - Whether to round values
   * @returns Lc contrast value
   */
  export function calcAPCA(textColor: unknown, bgColor: unknown, places?: number, round?: boolean): number | string;

  /**
   * Look up recommended font sizes for a given contrast
   * @param contrast - APCA Lc contrast value
   * @param places - Decimal places
   * @returns Array of font sizes by weight [Lc, 100, 200, 300, 400, 500, 600, 700, 800, 900]
   */
  export function fontLookupAPCA(contrast: number, places?: number): (number | string)[];

  /**
   * Reverse APCA calculation - find color for target contrast
   * @param contrast - Target Lc contrast
   * @param knownY - Known luminance value
   * @param knownType - 'bg' or 'txt'
   * @param returnAs - 'hex', 'color', 'Y', or 'y'
   * @returns Calculated color or false on error
   */
  export function reverseAPCA(contrast?: number, knownY?: number, knownType?: string, returnAs?: string): string | number[] | number | false;

  /**
   * Alpha blend foreground over background
   * @param rgbaFG - Foreground RGBA [r, g, b, a]
   * @param rgbBG - Background RGB [r, g, b]
   * @param round - Whether to round values
   * @returns Blended RGB array
   */
  export function alphaBlend(rgbaFG?: number[], rgbBG?: number[], round?: boolean): number[];
}
