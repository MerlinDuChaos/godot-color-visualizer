import * as vscode from "vscode";
import { ColorMatch, findColorsInDocument, formatColorReplacement } from "./parser";
import { ColorDecoratorManager, DisplayStyle } from "./decorator";

const CODE_EXTENSIONS = [".cs", ".gd", ".gdshader"];
const RESOURCE_EXTENSIONS = [".tscn", ".tres", "project.godot"];

export function activate(context: vscode.ExtensionContext) {
  const decorator = new ColorDecoratorManager();
  const documentMatchesCache = new Map<string, ColorMatch[]>();

  // Stores the currently clicked color match when using custom styles (circle, underline, border, background)
  let activeClickedMatch: { uri: string; match: ColorMatch } | null = null;

  function isDocumentSupported(doc: vscode.TextDocument): boolean {
    const config = vscode.workspace.getConfiguration("godotColorVisualizer");
    const enableCode = config.get<boolean>("enableCodeFiles", true);
    const enableRes = config.get<boolean>("enableResourceFiles", false);
    const fileName = doc.fileName.toLowerCase();

    if (enableCode && CODE_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return true;
    }
    if (enableRes && RESOURCE_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return true;
    }
    return false;
  }

  function getDisplayStyle(): DisplayStyle {
    const config = vscode.workspace.getConfiguration("godotColorVisualizer");
    return config.get<DisplayStyle>("displayStyle", "square");
  }

  function refreshEditor(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const doc = editor.document;

    if (!isDocumentSupported(doc)) {
      documentMatchesCache.delete(doc.uri.toString());
      decorator.clear(editor);
      return;
    }

    const matches = findColorsInDocument(doc);
    documentMatchesCache.set(doc.uri.toString(), matches);
    decorator.updateDecorations(editor, matches, getDisplayStyle());
  }

  // 1. Register the DocumentColorProvider
  const colorProvider: vscode.DocumentColorProvider = {
    provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
      if (!isDocumentSupported(document)) return [];

      const style = getDisplayStyle();
      const matches = findColorsInDocument(document);
      documentMatchesCache.set(document.uri.toString(), matches);

      // In "square" mode, return all colors so VS Code renders its native inline color boxes
      if (style === "square") {
        return matches.map((m) => new vscode.ColorInformation(m.range, m.color));
      }

      // In other modes, only expose the color the user just clicked on so no native square is rendered at rest
      if (activeClickedMatch && activeClickedMatch.uri === document.uri.toString()) {
        const currentMatch = matches.find((m) => m.range.intersection(activeClickedMatch!.match.range));
        if (currentMatch) {
          return [new vscode.ColorInformation(currentMatch.range, currentMatch.color)];
        }
      }

      return [];
    },

    provideColorPresentations(
      color: vscode.Color,
      context: { document: vscode.TextDocument; range: vscode.Range }
    ): vscode.ColorPresentation[] {
      const matches =
        documentMatchesCache.get(context.document.uri.toString()) ?? findColorsInDocument(context.document);
      const targetMatch = matches.find((m) => m.range.isEqual(context.range));

      if (!targetMatch) return [];

      const formattedLabel = formatColorReplacement(color, targetMatch);
      const presentation = new vscode.ColorPresentation(formattedLabel);
      presentation.textEdit = vscode.TextEdit.replace(context.range, formattedLabel);
      return [presentation];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerColorProvider({ scheme: "file" }, colorProvider)
  );

  // 2. Listen for mouse clicks to open the native standalone color picker on demand
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      const editor = event.textEditor;
      const doc = editor.document;
      if (!isDocumentSupported(doc)) return;

      const style = getDisplayStyle();
      if (style === "square") return; // Native square mode already handles hover/click

      const selection = event.selections[0];
      if (!selection || !selection.isEmpty) return;

      const matches = documentMatchesCache.get(doc.uri.toString()) ?? [];
      const hit = matches.find((m) => m.range.contains(selection.active));

      // Trigger the standalone color picker when clicking inside a color expression
      if (hit && event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        activeClickedMatch = { uri: doc.uri.toString(), match: hit };
        await vscode.commands.executeCommand("editor.action.showOrFocusStandaloneColorPicker");
      } else if (!hit && activeClickedMatch) {
        activeClickedMatch = null;
      }
    })
  );

  // 3. Manual command to open the color picker at the current cursor position
  context.subscriptions.push(
    vscode.commands.registerCommand("godotColorVisualizer.pickColor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const matches = documentMatchesCache.get(editor.document.uri.toString()) ?? [];
      const hit = matches.find((m) => m.range.contains(editor.selection.active));
      if (hit) {
        activeClickedMatch = { uri: editor.document.uri.toString(), match: hit };
        await vscode.commands.executeCommand("editor.action.showOrFocusStandaloneColorPicker");
      }
    })
  );

  // 4. Refresh decorations on editor switch, document change, or settings update
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => refreshEditor(editor)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        refreshEditor(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("godotColorVisualizer")) {
        activeClickedMatch = null;
        vscode.window.visibleTextEditors.forEach((editor) => refreshEditor(editor));
      }
    }),
    decorator
  );

  // Initial pass for all visible editors on startup
  vscode.window.visibleTextEditors.forEach((editor) => refreshEditor(editor));
}

export function deactivate() {}