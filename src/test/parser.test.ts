import { test } from "node:test";
import * as assert from "node:assert";

// --- Mock lightweight VS Code API for pure Node.js test execution ---
const mockVscode = {
  Color: class {
    red: number;
    green: number;
    blue: number;
    alpha: number;
    constructor(red: number, green: number, blue: number, alpha: number) {
      this.red = red;
      this.green = green;
      this.blue = blue;
      this.alpha = alpha;
    }
  },
  Range: class {
    start: any;
    end: any;
    constructor(start: any, end: any) {
      this.start = start;
      this.end = end;
    }
  },
  window: {
    createTextEditorDecorationType: (options: any) => ({
      key: "mock-decoration",
      dispose: () => {}
    })
  },
  workspace: {
    getConfiguration: (section: string) => ({
      get: (key: string, defaultValue: any) => {
        if (key === "customPatterns") {
          return [
            {
              name: "Custom CSS-like Hex",
              extensions: [".gd"],
              regex: "CUSTOM_COLOR\\s*=\\s*(?<hex>#[0-9a-fA-F]{6})",
              format: "hex"
            }
          ];
        }
        if (key === "floatPrecision") {
          return 3;
        }
        return defaultValue;
      }
    })
  },
  TextDocument: class {}
};

(globalThis as any).vscode = mockVscode;

// Mock module 'vscode' so parser.ts and decorator.ts can require it successfully
import { Module } from "node:module";
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "vscode") {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

import { parseGodotNamedColor, parseHexColor } from "../godotColors";
import { formatColorReplacement, findColorsInDocument, ColorMatch } from "../parser";
import { ColorDecoratorManager } from "../decorator";

test("Godot Named Colors Parser", () => {
  const white = parseGodotNamedColor("White");
  assert.deepStrictEqual(white, { r: 1, g: 1, b: 1, a: 1 });

  const upperSnake = parseGodotNamedColor("CRIMSON");
  assert.notStrictEqual(upperSnake, null);
  assert.strictEqual(upperSnake?.r, parseHexColor("#dc143c")?.r);

  const transparent = parseGodotNamedColor("transparent");
  assert.deepStrictEqual(transparent, { r: 1, g: 1, b: 1, a: 0 });

  const invalid = parseGodotNamedColor("NonExistentColor");
  assert.strictEqual(invalid, null);
});

test("Hex Color Parser", () => {
  const hex6 = parseHexColor("#FF4444");
  assert.notStrictEqual(hex6, null);
  assert.strictEqual(hex6?.r, 255 / 255);
  assert.strictEqual(hex6?.g, 68 / 255);
  assert.strictEqual(hex6?.b, 68 / 255);
  assert.strictEqual(hex6?.a, 1);

  const hexShort = parseHexColor("#F44");
  assert.strictEqual(hexShort?.r, parseHexColor("#FF4444")?.r);

  const hexWithAlpha = parseHexColor("#FF444480");
  assert.strictEqual(hexWithAlpha?.a, 0.5019607843137255);
});

test("Color Replacement Formatter - C# new Color", () => {
  const mockMatch: ColorMatch = {
    range: {} as any,
    color: { red: 0.2, green: 1.0, blue: 0.5, alpha: 1.0 } as any,
    originalText: "new Color(0.1f, 0.1f, 0.1f)",
    format: "cs_rgba_float",
    hasExplicitAlpha: false,
    useFloatSuffix: true,
    groups: {}
  };

  const newColor = { red: 0.2, green: 1.0, blue: 0.5, alpha: 1.0 } as any;
  const result = formatColorReplacement(newColor, mockMatch);
  assert.strictEqual(result, "new Color(0.2f, 1f, 0.5f)");
});

test("Color Replacement Formatter - GDScript Color.WHITE named constant conversion to exact values", () => {
  const mockMatch: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 1, blue: 1, alpha: 1 } as any,
    originalText: "Color.WHITE",
    format: "gd_named",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: { name: "WHITE" }
  };

  const newColor = { red: 0.5, green: 0.5, blue: 0.5, alpha: 1.0 } as any;
  const result = formatColorReplacement(newColor, mockMatch);
  assert.strictEqual(result, "Color(0.5, 0.5, 0.5)");
});

test("Color Replacement Formatter - Alpha preservation / addition", () => {
  const mockMatch: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 1, blue: 1, alpha: 1 } as any,
    originalText: "Color(1, 1, 1)",
    format: "gd_rgba_float",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: {}
  };

  const translucentColor = { red: 1, green: 1, blue: 1, alpha: 0.5 } as any;
  const result = formatColorReplacement(translucentColor, mockMatch);
  assert.strictEqual(result, "Color(1, 1, 1, 0.5)");
});

test("Color Replacement Formatter - BBCode tags", () => {
  const mockMatch: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 0.266, blue: 0.266, alpha: 1 } as any,
    originalText: "[color=#FF4444]",
    format: "bbcode",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: { tag: "color", val: "#FF4444" }
  };

  const newColor = { red: 0, green: 1, blue: 0, alpha: 1 } as any;
  const result = formatColorReplacement(newColor, mockMatch);
  assert.strictEqual(result, "[color=#00FF00]");
});

test("Document Parser - Standard Godot Colors Detection", () => {
  const mockDoc = {
    fileName: "test.gd",
    getText: () => 'var col = Color(0.2, 1.0, 0.5)\nvar csharp = new Color(1f, 0f, 0f, 1f)',
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  assert.strictEqual(matches.length, 2);
  assert.strictEqual(matches[0].originalText, "Color(0.2, 1.0, 0.5)");
  assert.strictEqual(matches[1].originalText, "new Color(1f, 0f, 0f, 1f)");
});

test("Document Parser - Custom User Patterns", () => {
  const mockDoc = {
    fileName: "script.gd",
    getText: () => 'CUSTOM_COLOR = #FF9900',
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  // Must find both native Color() pattern and custom pattern
  const customMatch = matches.find((m) => m.originalText.includes("#FF9900"));
  assert.notStrictEqual(customMatch, undefined);
  assert.strictEqual(customMatch?.color.red, parseHexColor("#FF9900")?.r);
});

test("ColorDecoratorManager - Styles & Cache management", () => {
  // Mock VS Code methods for editors and decorations
  let appliedDecorations: any[] = [];
  const mockEditor = {
    setDecorations: (decType: any, ranges: any[]) => {
      appliedDecorations = ranges;
    }
  } as any;

  const decorator = new ColorDecoratorManager();

  const mockMatches = [
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } as any,
      color: { red: 1, green: 0, blue: 0, alpha: 1 } as any,
      originalText: "Color(1,0,0)",
      format: "gd_rgba_float" as any,
      hasExplicitAlpha: false,
      useFloatSuffix: false,
      groups: {}
    }
  ];

  // 1. In "square" mode, custom decorations should be cleared
  decorator.updateDecorations(mockEditor, mockMatches, "square");
  assert.strictEqual(appliedDecorations.length, 0);

  // 2. In "background" mode, manager should apply decorations via cache
  decorator.updateDecorations(mockEditor, mockMatches, "background");
  assert.strictEqual(appliedDecorations.length, 1);
  assert.deepStrictEqual(appliedDecorations[0], mockMatches[0].range);

  // Cleanup
  decorator.dispose();
});

test("Hex Color Parser - Negative cases & Invalid inputs", () => {
  // Invalid length (5 characters)
  assert.strictEqual(parseHexColor("#12345"), null);
  // Non-hexadecimal characters
  assert.strictEqual(parseHexColor("#ZZZZZZ"), null);
  assert.strictEqual(parseHexColor("#GGGG"), null);
  // Too short or too long
  assert.strictEqual(parseHexColor("#F"), null);
  assert.strictEqual(parseHexColor("#123456789"), null);
  assert.strictEqual(parseHexColor(""), null);
});

test("Document Parser - Negative cases & False positive rejection", () => {
  const mockDoc = {
    fileName: "script.gd",
    getText: () => `
      # Keywords that are not colors
      var rect = ColorRect.new()
      var picker = new ColorPicker()
      var custom = MyColor(1.0, 0.5, 0.2)
      
      # Invalid argument count
      var two_args = Color(1.0, 0.5)
      var five_args = Color(1, 2, 3, 4, 5)
      
      # Non-existent constants
      var fake_gd = Color.NON_EXISTENT_COLOR_NAME
      var fake_cs = Colors.FakeColorName
      
      # vec3/vec4 in a .gd file (must be ignored)
      var position = vec3(1.0, 0.0, 0.5)
    `,
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  // No false positives should be detected
  assert.strictEqual(matches.length, 0);
});

test("Document Parser - Shaders vec3/vec4 in .gdshader vs non-shader", () => {
  // 1. In a .gdshader file, vec3 and vec4 MUST be detected
  const shaderDoc = {
    fileName: "material.gdshader",
    getText: () => "COLOR = vec4(1.0, 0.5, 0.0, 1.0); vec3 ambient = vec3(0.2, 0.2, 0.2);",
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const shaderMatches = findColorsInDocument(shaderDoc);
  assert.strictEqual(shaderMatches.length, 2);
  assert.strictEqual(shaderMatches[0].originalText, "vec4(1.0, 0.5, 0.0, 1.0)");
  assert.strictEqual(shaderMatches[0].color.red, 1.0);
  assert.strictEqual(shaderMatches[0].color.green, 0.5);
  assert.strictEqual(shaderMatches[1].originalText, "vec3(0.2, 0.2, 0.2)");

  // 2. In a .gd or .cs file, vec3/vec4 MUST NOT be detected
  const gdDoc = {
    fileName: "player.gd",
    getText: () => "var v = vec3(1.0, 0.5, 0.0);",
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const gdMatches = findColorsInDocument(gdDoc);
  assert.strictEqual(gdMatches.length, 0);
});

test("Document Parser - Floats without leading zero (.5, .2, .8)", () => {
  const mockDoc = {
    fileName: "script.gd",
    getText: () => "var c1 = Color(.5, .2, .8)\nvar c2 = new Color(.1f, .4f, .9f)",
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  assert.strictEqual(matches.length, 2);
  assert.strictEqual(matches[0].color.red, 0.5);
  assert.strictEqual(matches[0].color.green, 0.2);
  assert.strictEqual(matches[0].color.blue, 0.8);
  assert.strictEqual(matches[1].color.red, 0.1);
  assert.strictEqual(matches[1].color.green, 0.4);
  assert.strictEqual(matches[1].color.blue, 0.9);
});

test("Document Parser - Color8, HSV, and Hex constructors", () => {
  const mockDoc = {
    fileName: "test_all.gd",
    getText: () => `
      var c_gd8 = Color8(255, 128, 0)
      var c_cs8 = Color.Color8(0, 255, 0, 128)
      var c_gdhsv = Color.from_hsv(0.5, 1.0, 1.0)
      var c_hex1 = Color("#FF8800")
      var c_hex2 = Color.html("#00FF88")
      var c_cs_hex = Color.FromHtml("#112233")
    `,
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  assert.strictEqual(matches.length, 6);

  // GDScript Color8
  assert.strictEqual(matches[0].originalText, "Color8(255, 128, 0)");
  assert.strictEqual(matches[0].color.red, 1);
  assert.strictEqual(matches[0].color.green, 128 / 255);
  assert.strictEqual(matches[0].color.blue, 0);

  // C# Color.Color8 with alpha
  assert.strictEqual(matches[1].originalText, "Color.Color8(0, 255, 0, 128)");
  assert.strictEqual(matches[1].color.green, 1);
  assert.strictEqual(matches[1].color.alpha, 128 / 255);

  // HSV (h=0.5 -> cyan: r=0, g=1, b=1)
  assert.strictEqual(matches[2].originalText, "Color.from_hsv(0.5, 1.0, 1.0)");
  assert.strictEqual(matches[2].color.red, 0);
  assert.strictEqual(matches[2].color.green, 1);
  assert.strictEqual(matches[2].color.blue, 1);

  // Hex constructors
  assert.strictEqual(matches[3].originalText, 'Color("#FF8800")');
  assert.strictEqual(matches[4].originalText, 'Color.html("#00FF88")');
  assert.strictEqual(matches[5].originalText, 'Color.FromHtml("#112233")');
});

test("Document Parser - BBCode with named colors and hex", () => {
  const mockDoc = {
    fileName: "dialog.tres",
    getText: () => "[color=red]Warning[/color] and [bgcolor=#00FF00]Success[/bgcolor]",
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  assert.strictEqual(matches.length, 2);
  // [color=red]
  assert.strictEqual(matches[0].originalText, "[color=red]");
  assert.strictEqual(matches[0].color.red, 1);
  assert.strictEqual(matches[0].color.green, 0);
  assert.strictEqual(matches[0].color.blue, 0);
  // [bgcolor=#00FF00]
  assert.strictEqual(matches[1].originalText, "[bgcolor=#00FF00]");
  assert.strictEqual(matches[1].color.red, 0);
  assert.strictEqual(matches[1].color.green, 1);
  assert.strictEqual(matches[1].color.blue, 0);
});

test("Document Parser - Values clamping (> 1.0 and < 0.0)", () => {
  const mockDoc = {
    fileName: "hdr.gd",
    getText: () => "var hdr = Color(2.5, -0.5, 0.5, 3.0)",
    positionAt: (offset: number) => ({ line: 0, character: offset })
  } as any;

  const matches = findColorsInDocument(mockDoc);
  assert.strictEqual(matches.length, 1);
  // Color components must be clamped between 0 and 1
  assert.strictEqual(matches[0].color.red, 1.0);
  assert.strictEqual(matches[0].color.green, 0.0);
  assert.strictEqual(matches[0].color.blue, 0.5);
  assert.strictEqual(matches[0].color.alpha, 1.0);
});

test("Color Replacement Formatter - Color8, Hex, and HSV replacements", () => {
  const newGreen = { red: 0, green: 1, blue: 0, alpha: 1 } as any;

  // 1. GDScript Color8 replacement
  const matchGd8: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 0, blue: 0, alpha: 1 } as any,
    originalText: "Color8(255, 0, 0)",
    format: "gd_rgba_8",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: {}
  };
  assert.strictEqual(formatColorReplacement(newGreen, matchGd8), "Color8(0, 255, 0)");

  // 2. C# Color.Color8 replacement
  const matchCs8: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 0, blue: 0, alpha: 1 } as any,
    originalText: "Color.Color8(255, 0, 0)",
    format: "cs_rgba_8",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: {}
  };
  assert.strictEqual(formatColorReplacement(newGreen, matchCs8), "Color.Color8(0, 255, 0)");

  // 3. GDScript Color("#...") replacement
  const matchHex: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 0, blue: 0, alpha: 1 } as any,
    originalText: 'Color("#FF0000")',
    format: "gd_hex",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: { prefix: "Color", quote: '"' }
  };
  assert.strictEqual(formatColorReplacement(newGreen, matchHex), 'Color("#00FF00")');

  // 4. GDScript Color.from_hsv replacement
  const matchHsv: ColorMatch = {
    range: {} as any,
    color: { red: 1, green: 0, blue: 0, alpha: 1 } as any,
    originalText: "Color.from_hsv(0, 1, 1)",
    format: "gd_hsv",
    hasExplicitAlpha: false,
    useFloatSuffix: false,
    groups: {}
  };
  // Pure green -> H=120 deg = 0.333, S=1, V=1
  const hsvResult = formatColorReplacement(newGreen, matchHsv);
  assert.strictEqual(hsvResult, "Color.from_hsv(0.333, 1, 1)");
});