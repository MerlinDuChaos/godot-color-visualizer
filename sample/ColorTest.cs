using Godot;

public partial class ColorTest : Node
{
    public override void _Ready()
    {
        // 1. RGBA floats with 'f' suffix
        Color c1 = new Color(0.2f, 1f, 0.5f);
        Color c1Alpha = new Color(0.2f, 1f, 0.5f, 0.75f);
        Color c1Hdr = new Color(1.3f, 1.3f, 1.5f, 1f);

        // 2. 8-bit integer values (0-255)
        Color c2 = Color.Color8(255, 68, 68);
        Color c2Alpha = Color.Color8(255, 68, 68, 128);

        // 3. Hex strings
        Color c3 = Color.FromHtml("#FF4444");
        Color c3Short = Color.FromHtml("#F44");
        Color c3Alpha = Color.FromHtml("#FF4444FF");
        Color c3New = new Color("#FF4444");

        // 4. HSV values
        Color c4 = Color.FromHsv(0.5f, 0.8f, 1.0f);
        Color c4Alpha = Color.FromHsv(0.5f, 0.8f, 1.0f, 0.5f);

        // 5. Named constants (PascalCase)
        Color c5White = Colors.White;
        Color c5Crimson = Colors.Crimson;
        Color c5Transparent = Colors.Transparent;
    }
}