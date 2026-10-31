-- PersonStyle: what one person of the city looks like, rolled from a "look" (the role: student,
-- doctor, thief...) and a dice. Plain data -- NpcService turns it into parts on a standard R15 rig
-- (the realistic catalog bodies had a pale, grey, staring face in the game, so every person is now
-- built from our own parts: always loads, always has a friendly face, and mixes thousands of ways).
--
--   skin, hair (style, color), top (kind, color, accent, pattern), bottom (kind, color), shoes,
--   sleeves, extras (accessories), size ("s" | "m" | "l": which body the rig is made on)
--
-- The look's own palette (shirt and trouser colours, role accessories) stays in NpcService.Looks;
-- the roll mixes everything else around it.

local PersonStyle = {}

PersonStyle.SKINS = {
	{ 255, 224, 196 }, { 250, 214, 184 }, { 241, 194, 160 }, { 234, 184, 146 }, { 224, 172, 130 }, { 206, 150, 108 },
	{ 188, 128, 88 }, { 160, 108, 72 }, { 136, 92, 62 }, { 112, 76, 52 }, { 92, 60, 40 }, { 74, 48, 34 },
}

-- natural colours are common; the dyed ones are rare (they are entered once, the others several times)
PersonStyle.HAIR_COLORS = {
	{ 20, 18, 16 }, { 20, 18, 16 }, { 28, 22, 18 }, { 52, 36, 26 }, { 52, 36, 26 }, { 80, 52, 34 }, { 80, 52, 34 }, { 112, 74, 44 },
	{ 150, 108, 64 }, { 188, 150, 92 }, { 224, 196, 132 }, { 240, 228, 190 }, { 150, 56, 34 }, { 176, 82, 44 }, { 150, 150, 150 },
	{ 226, 226, 226 }, { 240, 90, 160 }, { 70, 170, 240 }, { 80, 200, 120 }, { 160, 90, 240 },
}

PersonStyle.HAIR_STYLES = {
	m = { "buzz", "short", "short", "side", "quiff", "curly", "afro", "long", "topknot", "bald", "spiky", "slick", "mohawk", "wavy", "fade", "pompadour" },
	f = { "long", "long", "ponytail", "ponytail", "bob", "bun", "braid", "curly", "afro", "pixie", "bangs", "shoulder", "twinbuns", "sidepony", "curlybob", "halfup" },
}

PersonStyle.TOPS = { "tee", "tee", "long", "polo", "hoodie", "jacket", "sweater", "shirt", "tank", "vest" }
PersonStyle.TOPS_F = { "tee", "tee", "long", "blouse", "hoodie", "jacket", "sweater", "tank", "dress", "shirt" }
PersonStyle.PATTERNS = { "plain", "plain", "plain", "stripe", "band", "pocket", "logo", "collar", "sleeves", "stripes2" }
PersonStyle.BOTTOMS = { "jeans", "jeans", "trousers", "shorts", "cargo", "sweats" }
PersonStyle.BOTTOMS_F = { "jeans", "jeans", "trousers", "shorts", "skirt", "skirt", "leggings", "cargo" }
PersonStyle.SHOES = {
	{ 240, 240, 240 }, { 30, 30, 32 }, { 30, 30, 32 }, { 200, 50, 50 }, { 50, 90, 200 }, { 110, 76, 50 }, { 220, 200, 60 }, { 70, 70, 76 },
}
-- colours for a part of the outfit the look does not decide (an accent stripe, a hood, a bag)
PersonStyle.ACCENTS = {
	{ 240, 240, 240 }, { 30, 30, 34 }, { 220, 60, 60 }, { 240, 190, 40 }, { 60, 140, 220 }, { 60, 170, 110 }, { 240, 130, 50 }, { 160, 90, 220 }, { 240, 120, 170 },
}

-- accessories that anybody may carry or wear, whatever the role (each with a chance)
PersonStyle.EXTRAS = {
	{ "glasses", 0.12 }, { "sunglasses", 0.05 }, { "watch", 0.25 }, { "earrings", 0.12 }, { "headphones", 0.08 },
	{ "bag", 0.14 }, { "tote", 0.06 }, { "beanie", 0.05 }, { "cap", 0.07 }, { "bucket", 0.03 }, { "mask_med", 0.03 }, { "bandana", 0.03 },
	{ "beard", 0.07 }, { "goatee", 0.04 }, { "stubble", 0.05 }, { "scarf_s", 0.04 }, { "necklace", 0.07 }, { "bracelet", 0.07 },
}
-- (extras only on one gender: they do not roll for the other)
PersonStyle.EXTRA_ONLY = { beard = "m", goatee = "m", stubble = "m", earrings = "f", necklace = "f" }

local function pick(list, rng: Random)
	return list[rng:NextInteger(1, #list)]
end

-- Rolls one person. `look` is the NpcService look table (shirt/pants palettes, extras).
function PersonStyle.roll(look, gender: string, rng: Random)
	local s = {}
	s.gender = gender
	s.skin = pick(PersonStyle.SKINS, rng)
	s.hair = { style = pick(PersonStyle.HAIR_STYLES[if gender == "f" then "f" else "m"], rng), color = pick(PersonStyle.HAIR_COLORS, rng) }
	local formal = false
	for _, e in look.extras or {} do
		if e == "tie" then
			formal = true
		end
	end
	local topKind = pick(if gender == "f" then PersonStyle.TOPS_F else PersonStyle.TOPS, rng)
	if formal then
		topKind = if gender == "f" then pick({ "blouse", "jacket", "shirt" }, rng) else pick({ "shirt", "jacket", "polo" }, rng)
	end
	local shirt = pick(look.shirt, rng)
	-- (a little variation of the look's own colours, so a row of students is not in uniform)
	local jitter = function(c)
		return {
			math.clamp(c[1] + rng:NextInteger(-18, 18), 0, 255),
			math.clamp(c[2] + rng:NextInteger(-18, 18), 0, 255),
			math.clamp(c[3] + rng:NextInteger(-18, 18), 0, 255),
		}
	end
	s.top = {
		kind = topKind,
		color = jitter(shirt),
		accent = pick(PersonStyle.ACCENTS, rng),
		pattern = if rng:NextNumber() < 0.45 then "plain" else pick(PersonStyle.PATTERNS, rng),
	}
	s.sleeves = if topKind == "tee" or topKind == "polo" or topKind == "tank" or topKind == "dress" then "short" else "long"
	if topKind == "tank" or (topKind == "dress" and rng:NextNumber() < 0.5) then
		s.sleeves = "none"
	end
	local bottomKind = pick(if gender == "f" then PersonStyle.BOTTOMS_F else PersonStyle.BOTTOMS, rng)
	if formal then
		bottomKind = if gender == "f" and rng:NextNumber() < 0.4 then "skirt" else "trousers"
	end
	if topKind == "dress" then
		bottomKind = "dress"
	end
	s.bottom = { kind = bottomKind, color = jitter(pick(look.pants, rng)) }
	s.shoes = if formal then { 30, 30, 32 } else pick(PersonStyle.SHOES, rng)
	-- role accessories first, then a few of anybody's
	s.extras = {}
	local seen = {}
	for _, e in look.extras or {} do
		table.insert(s.extras, e)
		seen[e] = true
	end
	for _, x in PersonStyle.EXTRAS do
		local only = PersonStyle.EXTRA_ONLY[x[1]]
		if not seen[x[1]] and (not only or only == gender) and rng:NextNumber() < x[2] then
			-- (one hat at a time, one thing on the face)
			local hat = x[1] == "beanie" or x[1] == "cap" or x[1] == "bucket" or x[1] == "bandana"
			local hasHat = seen.cap or seen.cap_back or seen.beanie or seen.bucket or seen.bandana or seen.flatcap or seen.beret or seen.sunhat or seen.hardhat or seen.guardcap or seen.hood or seen.headband
			local face = x[1] == "glasses" or x[1] == "sunglasses" or x[1] == "mask_med"
			local hasFace = seen.glasses or seen.sunglasses or seen.mask_med or seen.mask or seen.sunglasses_up
			if not (hat and hasHat) and not (face and hasFace) then
				table.insert(s.extras, x[1])
				seen[x[1]] = true
			end
		end
	end
	-- the build: three body sizes (the rigs are made once per size)
	s.size = pick({ "s", "m", "m", "l" }, rng)
	return s
end

-- A short text that is the same for two people who look exactly alike (for counting variety).
function PersonStyle.key(s): string
	local function c(t)
		return string.format("%d.%d.%d", t[1], t[2], t[3])
	end
	return table.concat({
		c(s.skin), s.hair.style, c(s.hair.color), s.top.kind, c(s.top.color), s.top.pattern, c(s.top.accent),
		s.bottom.kind, c(s.bottom.color), c(s.shoes), table.concat(s.extras, ","), s.size,
	}, "|")
end

return PersonStyle
