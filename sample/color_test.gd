extends Node

func _ready() -> void:
	# 1. RGBA floats (no 'f' suffix)
	var c1 = Color(0.2, 1.0, 0.5)
	var c1_alpha = Color(0.2, 1.0, 0.5, 0.75)
	
	# 2. 8-bit integer values (0-255)
	var c2 = Color8(255, 68, 68)
	var c2_alpha = Color8(255, 68, 68, 128)
	
	# 3. Hex strings
	var c3 = Color("#ff4444")
	var c3_html = Color.html("#ff4444")
	var c3_single = Color('#ff4444')
	
	# 4. HSV values (snake_case)
	var c4 = Color.from_hsv(0.5, 0.8, 1.0)
	var c4_alpha = Color.from_hsv(0.5, 0.8, 1.0, 0.5)
	
	# 5. Named constants (UPPER_SNAKE_CASE)
	var c5_white = Color.WHITE
	var c5_crimson = Color.CRIMSON
	var c5_transparent = Color.TRANSPARENT