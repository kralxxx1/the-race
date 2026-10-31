-- Graphics: the choices on the Settings window's graphics page that go beyond the first handful of
-- switches (shadows, bloom, sun rays, depth of field, clouds). Prefs, the server's checks and the
-- window itself all read this one list, so a new choice needs a line here and its two strings
-- (set_<id>, set_<id>_sub; and set_<id>_<word> for each word of a choice).
--
--   kind "bool" | "num" (lo..hi) | "enum" (words)
--   group: where the window shows it
--   preset: what each quality level sets it to (low, medium, high, ultra, cinematic)

local Graphics = {}

Graphics.QUALITIES = { "low", "medium", "high", "ultra", "cinematic" }

Graphics.groups = { "light", "sky", "weather", "city", "camera" }

local function preset(low, medium, high, ultra, cinematic)
	return { low = low, medium = medium, high = high, ultra = ultra, cinematic = cinematic }
end

Graphics.list = {
	-- light and shadow
	{ id = "shadowsoft", group = "light", kind = "num", default = 0.5, lo = 0, hi = 1, preset = preset(0.1, 0.3, 0.5, 0.7, 0.9) },
	{ id = "skylight", group = "light", kind = "num", default = 1, lo = 0, hi = 1 },
	{ id = "reflections", group = "light", kind = "num", default = 0.8, lo = 0, hi = 1, preset = preset(0.2, 0.5, 0.8, 1, 1) },
	{ id = "bloomamt", group = "light", kind = "num", default = 0.5, lo = 0, hi = 1, preset = preset(0.3, 0.45, 0.5, 0.6, 0.75) },
	{ id = "raysamt", group = "light", kind = "num", default = 0.5, lo = 0, hi = 1, preset = preset(0.3, 0.4, 0.5, 0.6, 0.7) },
	{ id = "glare", group = "light", kind = "bool", default = true, preset = preset(false, false, true, true, true) },
	-- sky and colour
	{ id = "cloudcover", group = "sky", kind = "enum", default = "normal", words = { "clear", "few", "normal", "overcast" } },
	{ id = "haze", group = "sky", kind = "num", default = 0.5, lo = 0, hi = 1 },
	{ id = "look", group = "sky", kind = "enum", default = "natural", words = { "natural", "vivid", "warm", "cool", "cinema" }, preset = preset(nil, nil, nil, nil, "cinema") },
	{ id = "contrast", group = "sky", kind = "num", default = 0, lo = -1, hi = 1 },
	{ id = "saturation", group = "sky", kind = "num", default = 0, lo = -1, hi = 1 },
	-- weather
	{ id = "rain", group = "weather", kind = "enum", default = "high", words = { "low", "medium", "high", "ultra" }, preset = preset("low", "medium", "high", "ultra", "ultra") },
	{ id = "splashes", group = "weather", kind = "bool", default = true, preset = preset(false, true, true, true, true) },
	{ id = "lens", group = "weather", kind = "bool", default = true, preset = preset(false, true, true, true, true) },
	{ id = "flashes", group = "weather", kind = "bool", default = true },
	-- the city
	{ id = "crowd", group = "city", kind = "enum", default = "normal", words = { "off", "low", "normal", "high" }, preset = preset("low", "normal", "normal", "high", "high") },
	{ id = "particles", group = "city", kind = "num", default = 1, lo = 0, hi = 1, preset = preset(0.4, 0.7, 1, 1, 1) },
	-- camera and screen
	{ id = "motionblur", group = "camera", kind = "bool", default = true, preset = preset(false, false, true, true, true) },
	{ id = "gfxlevel", group = "camera", kind = "num", default = 0, lo = 0, hi = 10 },
}

Graphics.byId = {} :: { [string]: any }
for _, o in Graphics.list do
	Graphics.byId[o.id] = o
end

-- The rule for the server's settings check: { kind, lo, hi } | { kind, words }.
function Graphics.rule(o)
	if o.kind == "num" then
		return { kind = "num", lo = o.lo, hi = o.hi }
	elseif o.kind == "enum" then
		return { kind = "enum", words = o.words }
	end
	return { kind = "bool" }
end

return Graphics
