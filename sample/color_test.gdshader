shader_type canvas_item;

uniform vec4 tint_color : source_color = vec4(1.0, 0.2, 0.5, 1.0);
uniform vec3 emissive_color = vec3(0.2, 0.8, 1.0);

void fragment() {
    vec4 base_col = vec4(0.0, 0.0, 0.0, 1.0);
    COLOR = base_col * tint_color;
}