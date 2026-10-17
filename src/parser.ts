import * as vscode from "vscode";
import { RgbaColor, parseGodotNamedColor, parseHexColor } from "./godotColors";

export type PatternFormat =
  | "cs_rgba_float"
  | "gd_rgba_float"
  | "cs_rgba_8"
  | "gd_rgba_8"
  | "cs_hex"
  | "gd_hex"
  | "cs_hsv"
  | "gd_hsv"
  | "cs_named"
  | "gd_named"
  | "bbcode"
  | "shader_vec"
  | "custom_rgba_float"
  | "custom_rgba_8"
  | "custom_hex";

export interface ColorMatch {
  range: vscode.Range;
  color: vscode.Color;
  originalText: string;
  format: PatternFormat;
  hasExplicitAlpha: boolean;
  useFloatSuffix: boolean;
  groups: Record<string, string | undefined>;
}

interface PatternRule {
  format: PatternFormat;
  regex: RegExp;
  useFloatSuffix?: boolean;
}

const BUILTIN_PATTERNS: PatternRule[] = [
  // 1. C#: new Color(0.2f, 1f, 0.5f[, 1f])
  {
    format: "cs_rgba_float",
    useFloatSuffix: true,
    regex: /\bnew\s+Color\s*\(\s*(?<r>-?\d*\.?\d+)f?\s*,\s*(?<g>-?\d*\.?\d+)f?\s*,\s*(?<b>-?\d*\.?\d+)f?(?:\s*,\s*(?<a>-?\d*\.?\d+)f?)?\s*\)/g
  },
  // 2. GDScript / Resource: Color(0.2, 1, 0.5[, 1])
  {
    format: "gd_rgba_float",
    useFloatSuffix: false,
    regex: /(?<!new\s+)\bColor\s*\(\s*(?<r>-?\d*\.?\d+)\s*,\s*(?<g>-?\d*\.?\d+)\s*,\s*(?<b>-?\d*\.?\d+)(?:\s*,\s*(?<a>-?\d*\.?\d+))?\s*\)/g
  },
  // 3. C#: Color.Color8(255, 68, 68[, 255])
  {
    format: "cs_rgba_8",
    regex: /\bColor\.Color8\s*\(\s*(?<r>\d+)\s*,\s*(?<g>\d+)\s*,\s*(?<b>\d+)(?:\s*,\s*(?<a>\d+))?\s*\)/g
  },
  // 4. GDScript: Color8(255, 68, 68[, 255])
  {
    format: "gd_rgba_8",
    regex: /(?<!\.)\bColor8\s*\(\s*(?<r>\d+)\s*,\s*(?<g>\d+)\s*,\s*(?<b>\d+)(?:\s*,\s*(?<a>\d+))?\s*\)/g
  },
  // 5. C#: Color.FromHtml("#FF4444") or new Color("#FF4444")
  {
    format: "cs_hex",
    regex: /\b(?<prefix>Color\.FromHtml|new\s+Color)\s*\(\s*"(?<hex>#?[0-9a-fA-F]{3,8})"\s*\)/g
  },
  // 6. GDScript: Color.html("#FF4444") or Color("#FF4444")
  {
    format: "gd_hex",
    regex: /(?<!new\s+)\b(?<prefix>Color(?:\.html)?)\s*\(\s*(?<quote>["'])(?<hex>#?[0-9a-fA-F]{3,8})\k<quote>\s*\)/g
  },
  // 7. C#: Color.FromHsv(0.5f, 0.8f, 1.0f[, 1.0f])
  {
    format: "cs_hsv",
    useFloatSuffix: true,
    regex: /\bColor\.FromHsv\s*\(\s*(?<h>\d*\.?\d+)f?\s*,\s*(?<s>\d*\.?\d+)f?\s*,\s*(?<v>\d*\.?\d+)f?(?:\s*,\s*(?<a>\d*\.?\d+)f?)?\s*\)/g
  },
  // 8. GDScript: Color.from_hsv(0.5, 0.8, 1.0[, 1.0])
  {
    format: "gd_hsv",
    useFloatSuffix: false,
    regex: /\bColor\.from_hsv\s*\(\s*(?<h>\d*\.?\d+)\s*,\s*(?<s>\d*\.?\d+)\s*,\s*(?<v>\d*\.?\d+)(?:\s*,\s*(?<a>\d*\.?\d+))?\s*\)/g
  },
  // 9. C# Named Constants: Colors.White
  {
    format: "cs_named",
    useFloatSuffix: true,
    regex: /\bColors\.(?<name>[A-Z][a-zA-Z0-9]*)\b/g
  },
  // 10. GDScript Named Constants: Color.WHITE
  {
    format: "gd_named",
    useFloatSuffix: false,
    regex: /\bColor\.(?<name>[A-Z][A-Z0-9_]+)\b/g
  },
  // 11. BBCode: [color=#FF4444], [fgcolor=red], [bgcolor=#00FF00]
  {
    format: "bbcode",
    regex: /\[(?<tag>(?:fg|bg)?color)=(?<val>#[0-9a-fA-F]{3,8}|[a-zA-Z_]+)\]/g
  },
  // 12. GDShader: vec3(1.0, 0.2, 0.5) / vec4(1.0, 0.2, 0.5, 1.0)
  {
    format: "shader_vec",
    regex: /\b(?<vec>vec[34])\s*\(\s*(?<r>-?\d*\.?\d+)\s*,\s*(?<g>-?\d*\.?\d+)\s*,\s*(?<b>-?\d*\.?\d+)(?:\s*,\s*(?<a>-?\d*\.?\d+))?\s*\)/g
  }
];

export function findColorsInDocument(document: vscode.TextDocument): ColorMatch[] {
  const text = document.getText();
  const matches: ColorMatch[] = [];
  const config = vscode.workspace.getConfiguration("godotColorVisualizer");

  const customConfigs = config.get<any[]>("customPatterns", []);
  const activePatterns: PatternRule[] = [...BUILTIN_PATTERNS];

  for (const custom of customConfigs) {
    if (!custom.regex) continue;
    if (Array.isArray(custom.extensions) && custom.extensions.length > 0) {
      const matchesExt = custom.extensions.some((ext: string) =>
        document.fileName.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!matchesExt) continue;
    }
    try {
      const formatMap: Record<string, PatternFormat> = {
        rgba_float: "custom_rgba_float",
        rgba_8: "custom_rgba_8",
        hex: "custom_hex"
      };
      activePatterns.push({
        format: formatMap[custom.format] || "custom_rgba_float",
        regex: new RegExp(custom.regex, "g"),
        useFloatSuffix: Boolean(custom.useFloatSuffix)
      });
    } catch {
      // Ignore invalid user regular expressions
    }
  }

  for (const rule of activePatterns) {
    // Restrict vec3/vec4 matching to .gdshader files to avoid false positives
    if (rule.format === "shader_vec" && !document.fileName.endsWith(".gdshader")) {
      continue;
    }

    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.regex.exec(text)) !== null) {
      const groups = match.groups || {};
      const parsed = evaluateColorFromGroups(rule.format, groups);
      if (!parsed) continue;

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      matches.push({
        range,
        color: new vscode.Color(parsed.rgba.r, parsed.rgba.g, parsed.rgba.b, parsed.rgba.a),
        originalText: match[0],
        format: rule.format,
        hasExplicitAlpha: parsed.hasExplicitAlpha,
        useFloatSuffix: Boolean(rule.useFloatSuffix),
        groups
      });
    }
  }

  matches.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.character - b.range.start.character;
  });

  return matches;
}

function evaluateColorFromGroups(
  format: PatternFormat,
  groups: Record<string, string | undefined>
): { rgba: RgbaColor; hasExplicitAlpha: boolean } | null {
  switch (format) {
    case "cs_rgba_float":
    case "gd_rgba_float":
    case "shader_vec":
    case "custom_rgba_float": {
      const r = clamp01(parseFloat(groups.r ?? "0"));
      const g = clamp01(parseFloat(groups.g ?? "0"));
      const b = clamp01(parseFloat(groups.b ?? "0"));
      const hasAlpha = groups.a !== undefined;
      const a = hasAlpha ? clamp01(parseFloat(groups.a!)) : 1;
      return { rgba: { r, g, b, a }, hasExplicitAlpha: hasAlpha };
    }

    case "cs_rgba_8":
    case "gd_rgba_8":
    case "custom_rgba_8": {
      const r = clamp01(parseInt(groups.r ?? "0", 10) / 255);
      const g = clamp01(parseInt(groups.g ?? "0", 10) / 255);
      const b = clamp01(parseInt(groups.b ?? "0", 10) / 255);
      const hasAlpha = groups.a !== undefined;
      const a = hasAlpha ? clamp01(parseInt(groups.a!, 10) / 255) : 1;
      return { rgba: { r, g, b, a }, hasExplicitAlpha: hasAlpha };
    }

    case "cs_hex":
    case "gd_hex":
    case "custom_hex": {
      if (!groups.hex) return null;
      const rgba = parseHexColor(groups.hex);
      if (!rgba) return null;
      const cleanLen = groups.hex.replace(/^#/, "").length;
      return { rgba, hasExplicitAlpha: cleanLen === 4 || cleanLen === 8 };
    }

    case "cs_hsv":
    case "gd_hsv": {
      const h = clamp01(parseFloat(groups.h ?? "0"));
      const s = clamp01(parseFloat(groups.s ?? "0"));
      const v = clamp01(parseFloat(groups.v ?? "0"));
      const hasAlpha = groups.a !== undefined;
      const a = hasAlpha ? clamp01(parseFloat(groups.a!)) : 1;
      return { rgba: hsvToRgb(h, s, v, a), hasExplicitAlpha: hasAlpha };
    }

    case "cs_named":
    case "gd_named": {
      if (!groups.name) return null;
      const rgba = parseGodotNamedColor(groups.name);
      if (!rgba) return null;
      return { rgba, hasExplicitAlpha: rgba.a < 1 };
    }

    case "bbcode": {
      const val = groups.val;
      if (!val) return null;
      if (val.startsWith("#")) {
        const rgba = parseHexColor(val);
        if (!rgba) return null;
        const cleanLen = val.replace(/^#/, "").length;
        return { rgba, hasExplicitAlpha: cleanLen === 4 || cleanLen === 8 };
      }
      const rgba = parseGodotNamedColor(val);
      if (!rgba) return null;
      return { rgba, hasExplicitAlpha: rgba.a < 1 };
    }
  }
}

export function formatColorReplacement(newColor: vscode.Color, match: ColorMatch): string {
  const config = vscode.workspace.getConfiguration("godotColorVisualizer");
  const precision = config.get<number>("floatPrecision", 3);

  // Include alpha only if it was explicitly present in the original code OR if the new alpha is < 1.0
  const includeAlpha = match.hasExplicitAlpha || newColor.alpha < 0.999;
  const suffix = match.useFloatSuffix ? "f" : "";

  const fmtFloat = (n: number) => `${Number(n.toFixed(precision))}${suffix}`;
  const fmtInt = (n: number) => `${Math.round(n * 255)}`;

  switch (match.format) {
    // Convert C# named colors (e.g., Colors.White) to exact new Color(r, g, b[, a]) values
    case "cs_named":
    case "cs_rgba_float": {
      const args = [fmtFloat(newColor.red), fmtFloat(newColor.green), fmtFloat(newColor.blue)];
      if (includeAlpha) args.push(fmtFloat(newColor.alpha));
      return `new Color(${args.join(", ")})`;
    }

    // Convert GDScript named colors (e.g., Color.WHITE) to exact Color(r, g, b[, a]) values
    case "gd_named":
    case "gd_rgba_float": {
      const args = [fmtFloat(newColor.red), fmtFloat(newColor.green), fmtFloat(newColor.blue)];
      if (includeAlpha) args.push(fmtFloat(newColor.alpha));
      return `Color(${args.join(", ")})`;
    }

    case "cs_rgba_8": {
      const args = [fmtInt(newColor.red), fmtInt(newColor.green), fmtInt(newColor.blue)];
      if (includeAlpha) args.push(fmtInt(newColor.alpha));
      return `Color.Color8(${args.join(", ")})`;
    }

    case "gd_rgba_8": {
      const args = [fmtInt(newColor.red), fmtInt(newColor.green), fmtInt(newColor.blue)];
      if (includeAlpha) args.push(fmtInt(newColor.alpha));
      return `Color8(${args.join(", ")})`;
    }

    case "cs_hex": {
      const prefix = match.groups.prefix || "Color.FromHtml";
      const hasHash = (match.groups.hex ?? "#").startsWith("#");
      return `${prefix}("${toHexString(newColor, includeAlpha, hasHash)}")`;
    }

    case "gd_hex": {
      const prefix = match.groups.prefix || "Color";
      const quote = match.groups.quote || '"';
      const hasHash = (match.groups.hex ?? "#").startsWith("#");
      return `${prefix}(${quote}${toHexString(newColor, includeAlpha, hasHash)}${quote})`;
    }

    case "cs_hsv":
    case "gd_hsv": {
      const { h, s, v } = rgbToHsv(newColor.red, newColor.green, newColor.blue);
      const args = [fmtFloat(h), fmtFloat(s), fmtFloat(v)];
      if (includeAlpha) args.push(fmtFloat(newColor.alpha));
      const fn = match.format === "cs_hsv" ? "Color.FromHsv" : "Color.from_hsv";
      return `${fn}(${args.join(", ")})`;
    }

    case "bbcode": {
      const tag = match.groups.tag || "color";
      return `[${tag}=${toHexString(newColor, includeAlpha, true)}]`;
    }

    case "shader_vec": {
      const isVec4 = match.groups.vec === "vec4" || newColor.alpha < 0.999;
      const vecName = isVec4 ? "vec4" : "vec3";
      const args = [fmtFloat(newColor.red), fmtFloat(newColor.green), fmtFloat(newColor.blue)];
      if (isVec4) args.push(fmtFloat(newColor.alpha));
      return `${vecName}(${args.join(", ")})`;
    }

    case "custom_rgba_float":
    case "custom_rgba_8":
    case "custom_hex": {
      return replaceNamedGroupsInCustomMatch(newColor, match, includeAlpha, fmtFloat, fmtInt);
    }
  }
}

function replaceNamedGroupsInCustomMatch(
  newColor: vscode.Color,
  match: ColorMatch,
  includeAlpha: boolean,
  fmtFloat: (n: number) => string,
  fmtInt: (n: number) => string
): string {
  if (match.format === "custom_hex" && match.groups.hex) {
    const hasHash = match.groups.hex.startsWith("#");
    return match.originalText.replace(match.groups.hex, toHexString(newColor, includeAlpha, hasHash));
  }
  const fmt = match.format === "custom_rgba_8" ? fmtInt : fmtFloat;
  const parts = [fmt(newColor.red), fmt(newColor.green), fmt(newColor.blue)];
  if (includeAlpha) parts.push(fmt(newColor.alpha));
  const openParen = match.originalText.indexOf("(");
  const closeParen = match.originalText.lastIndexOf(")");
  if (openParen !== -1 && closeParen !== -1) {
    return `${match.originalText.slice(0, openParen + 1)}${parts.join(", ")}${match.originalText.slice(closeParen)}`;
  }
  return match.originalText;
}

function toHexString(c: vscode.Color, includeAlpha: boolean, withHash: boolean): string {
  const hex2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
  const prefix = withHash ? "#" : "";
  const rgb = `${hex2(c.red)}${hex2(c.green)}${hex2(c.blue)}`;
  return includeAlpha ? `${prefix}${rgb}${hex2(c.alpha)}` : `${prefix}${rgb}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, isNaN(n) ? 0 : n));
}

function hsvToRgb(h: number, s: number, v: number, a: number): RgbaColor {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r, g, b, a };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, v };
}