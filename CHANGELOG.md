# Change Log

All notable changes to the "godot-color-visualizer" extension will be documented in this file.

## [0.1.0] - 2026-10-17

### Added
- **Multi-language Godot Color Visualization**:
  - **GDScript**: `Color(r, g, b[, a])`, `Color8(r, g, b[, a])`, `Color("#hex")`, `Color.html("#hex")`, `Color.from_hsv(...)`, named constants `Color.WHITE`, etc.
  - **C#**: `new Color(r, g, b[, a])`, `Color.Color8(r, g, b[, a])`, `Color.FromHtml("#hex")`, `Color.FromHsv(...)`, named constants `Colors.White`, etc.
  - **GDShader**: `vec3(r, g, b)` and `vec4(r, g, b, a)` color vectors.
  - **BBCode**: `[color=...]`, `[fgcolor=...]`, `[bgcolor=...]` tags in text, dialogs, and resource files.
  - **Godot Resources**: Optional support for `.tscn`, `.tres`, and `project.godot`.
- **Multiple Display Styles**:
  - `square`: Native VS Code color swatch with built-in color picker.
  - `circle`: Sleek modern circular color badge before the color expression.
  - `underline`: Elegant colored underline beneath the expression.
  - `border`: Colored border box enclosing the expression.
  - `background`: Subtle tinted translucent highlight behind the text.
- **On-Demand Standalone Color Picker**:
  - Click on any decorated color in custom styles to trigger the standalone picker.
  - Dedicated command `Godot Color: Open Color Picker` (`godotColorVisualizer.pickColor`).
- **Original Format Preservation**:
  - Picking a color replaces the code while respecting original suffixes (like `f` in C#), integer scales (`Color8`), float precision, and explicit alpha.
- **Custom Regex Patterns**:
  - Configure your own custom color representations and variables in user/workspace settings.
