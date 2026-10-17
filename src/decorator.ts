import * as vscode from "vscode";
import { ColorMatch } from "./parser";

export type DisplayStyle = "square" | "circle" | "underline" | "border" | "background";

export class ColorDecoratorManager {
  // Cache of decoration types keyed by `${style}|${cssColor}`
  private decorationTypes = new Map<string, vscode.TextEditorDecorationType>();

  public updateDecorations(editor: vscode.TextEditor, matches: ColorMatch[], style: DisplayStyle): void {
    // In "square" mode, clear custom decorations and let VS Code render its native color swatches
    if (style === "square") {
      this.clear(editor);
      return;
    }

    // Group ranges by unique (style + color) key
    const rangesByKey = new Map<string, { ranges: vscode.Range[]; cssColor: string; color: vscode.Color }>();

    for (const match of matches) {
      const cssColor = toCssRgba(match.color);
      const key = `${style}|${cssColor}`;

      let group = rangesByKey.get(key);
      if (!group) {
        group = { ranges: [], cssColor, color: match.color };
        rangesByKey.set(key, group);
      }
      group.ranges.push(match.range);
    }

    // Create missing decoration types
    for (const [key, group] of rangesByKey.entries()) {
      if (!this.decorationTypes.has(key)) {
        const renderOptions = buildDecorationRenderOptions(style, group.cssColor, group.color);
        const decType = vscode.window.createTextEditorDecorationType(renderOptions);
        this.decorationTypes.set(key, decType);
      }
    }

    // Apply active decorations and clear stale ones on this editor
    for (const [key, decType] of this.decorationTypes.entries()) {
      const group = rangesByKey.get(key);
      editor.setDecorations(decType, group ? group.ranges : []);
    }
  }

  public clear(editor: vscode.TextEditor): void {
    for (const decType of this.decorationTypes.values()) {
      editor.setDecorations(decType, []);
    }
  }

  public dispose(): void {
    for (const decType of this.decorationTypes.values()) {
      decType.dispose();
    }
    this.decorationTypes.clear();
  }
}

function buildDecorationRenderOptions(
  style: DisplayStyle,
  cssColor: string,
  color: vscode.Color
): vscode.DecorationRenderOptions {
  switch (style) {
    case "circle":
      return {
        before: {
          contentText: " ",
          backgroundColor: cssColor,
          width: "1em",
          height: "1em",
          margin: "0 0.35em 0 0.1em",
          border: "1px solid rgba(128, 128, 128, 0.6)",
          textDecoration: "none; border-radius: 50%; display: inline-block; vertical-align: middle; cursor: pointer;"
        }
      };

    case "underline":
      return {
        textDecoration: `none; border-bottom: 4px solid ${cssColor};`,
        cursor: "pointer"
      };

    case "border":
      return {
        border: `1px solid ${cssColor}`,
        // Shift 4px left & 1px up, with 1px top padding and 4px left/right padding
        borderRadius:
          "3px; margin-left: -4px !important; margin-top: -1px !important; padding: 1px 4px 0 4px !important; box-sizing: content-box !important;",
        cursor: "pointer",
        before: {
          contentText: "",
          margin: "0 4px 0 0"
        },
        after: {
          contentText: "",
          margin: "0 0 0 4px"
        }
      };
    case "background": {
      // Calculate relative luminance to keep foreground text readable
      const luminance = 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue;
      const textColor = luminance > 0.55 && color.alpha > 0.4 ? "#000000" : "#FFFFFF";
      return {
        backgroundColor: cssColor,
        color: textColor,
        // Shift 4px left and add 8px total width (4px left + 4px right)
        borderRadius: "3px; margin-left: -4px !important; padding: 0 4px !important; box-sizing: content-box !important;",
        cursor: "pointer",
        before: {
          contentText: "",
          margin: "0 4px 0 0"
        },
        after: {
          contentText: "",
          margin: "0 0 0 4px"
        }
      };
    }

    default:
      return {};
  }
}

function toCssRgba(c: vscode.Color): string {
  const r = Math.round(c.red * 255);
  const g = Math.round(c.green * 255);
  const b = Math.round(c.blue * 255);
  return `rgba(${r}, ${g}, ${b}, ${Number(c.alpha.toFixed(3))})`;
}