-- Avatars: what the city's people look like, built only from Roblox's own catalog items so they
-- always load: the "Base Body" bodies and sculpted heads (realistic proportions, any skin tone),
-- the modern hair series, layered (3D) clothing, shoes and a few everyday accessories.
--
-- Avatars.outfit(look, rng, gender?) picks a complete outfit for one of the NpcService looks.
-- It is plain data so it can be checked without the engine; NpcService turns it into a
-- HumanoidDescription.

local Avatars = {}

-- Base Body bundles (979-995): body parts and the matching head kits (head, eyebrows, eyelashes)
Avatars.BODIES = {
	m = {
		{ name = "Riley", torso = 11572083496, la = 11572074613, ra = 11572079320, ll = 11572076845, rl = 11572081357 },
		{ name = "Harper", torso = 11702749784, la = 11702744222, ra = 11702746286, ll = 11702745067, rl = 11702748396 },
		{ name = "Andi", torso = 11715264057, la = 11715257112, ra = 11715260558, ll = 11715258659, rl = 11715262273 },
		{ name = "Billie", torso = 11748986529, la = 11748981874, ra = 11748984354, ll = 11748983268, rl = 11748985458 },
	},
	f = {
		{ name = "Cameron", torso = 11584241181, la = 11584231502, ra = 11584238141, ll = 11584235843, rl = 11584239464 },
		{ name = "Addison", torso = 11702287641, la = 11702279057, ra = 11702284438, ll = 11702282072, rl = 11702286099 },
		{ name = "Robin", torso = 11709146274, la = 11709138329, ra = 11709143116, ll = 11709141448, rl = 11709144753 },
		{ name = "Dawson", torso = 11709869073, la = 11709862883, ra = 11709865568, ll = 11709864101, rl = 11709867346 },
		{ name = "Rene", torso = 11714041015, la = 11714033534, ra = 11714037276, ll = 11714035598, rl = 11714039415 },
		{ name = "Jordan", torso = 11740060397, la = 11740050465, ra = 11740055375, ll = 11740052832, rl = 11740057815 },
	},
}
Avatars.HEADS = {
	m = {
		{ head = 11572085825, brows = 11572097774, lashes = 11572100557 },
		{ head = 11702751287, brows = 11702755085, lashes = 11702757409 },
		{ head = 11715265417, brows = 11715267394, lashes = 11715268504 },
		{ head = 11748988354, brows = 11748989953, lashes = 11748991080 },
	},
	f = {
		{ head = 11584333045, brows = 11584281898, lashes = 11584305059 },
		{ head = 11702291006, brows = 11702295477, lashes = 11702297008 },
		{ head = 11709148634, brows = 11709149939, lashes = 11709152004 },
		{ head = 11709871094, brows = 11709883139, lashes = 11709884954 },
		{ head = 11714044513, brows = 11714047676, lashes = 11714050380 },
		{ head = 11740063830, brows = 11740066767, lashes = 11740069153 },
	},
}
-- the facial idle that comes with these heads (blinks, small expressions)
Avatars.MOOD = 11573370910

-- "Realistic" animation package from the same bundles (the Animation ids inside the packages)
Avatars.ANIMS = {
	idle = "rbxassetid://11600209531",
	walk = "rbxassetid://11600249883",
	run = "rbxassetid://11600211410",
	jump = "rbxassetid://11600210487",
	fall = "rbxassetid://11600206437",
}
-- studs per second the walk animation covers at speed 1
Avatars.WALK_STRIDE = 8

-- Hair series, each style in black, brown, blonde and red
local HAIR = {
	ShortFringe = { 7193401217, 9243976603, 7193397693, 9243983205 },
	ShortSleek = { 9243992729, 6993758617, 9243987340, 9243995099 },
	SidePart = { 9244021842, 7193419595, 7193386173, 9244024443 },
	CurlyFade = { 7193405096, 9244010432, 9244008307, 9244014391 },
	ShortCurls = { 7193452166, 9244137452, 9244134513, 9244145658 },
	Surfer = { 9174353649, 9244033194, 9244029916, 9244038785 },
	TopKnot = { 9174354743, 9244060144, 9244057408, 9244064248 },
	MediumMiddle = { 9244089488, 7193437847, 7193424874, 9244091757 },
	PonyTail = { 7193442167, 9244097555, 9244095135, 7193444640 },
	WavyMiddle = { 9244111257, 7193448258, 7193445686, 9244114211 },
	StraightBangs = { 6993754725, 7193449810, 7193448988, 9244122897 },
	Braided = { 7193454569, 9244150641, 9244148336, 7193455510 },
	CurlyAfro = { 7193450455, 7193451306, 9244125859, 9244131570 },
}
Avatars.HAIR = HAIR
local HAIR_STYLES = {
	m = { "ShortFringe", "ShortSleek", "SidePart", "SidePart", "CurlyFade", "ShortCurls", "Surfer", "TopKnot", "MediumMiddle" },
	f = { "PonyTail", "PonyTail", "WavyMiddle", "WavyMiddle", "StraightBangs", "Braided", "CurlyAfro", "MediumMiddle", "ShortSleek" },
}
-- black and brown are the most common, red the rarest
local HAIR_COLOR_WEIGHTS = { 5, 5, 2, 1 }

-- Wardrobe: layered clothing by kind (type = the AccessoryType, order = layer from the body out)
local LAYER = { LeftShoe = 1, RightShoe = 1, Pants = 2, Shorts = 2, DressSkirt = 3, TShirt = 4, Shirt = 5, Sweater = 6, Jacket = 7 }
Avatars.LAYER = LAYER
local W = {
	tee = { type = "TShirt", ids = { 7178736794, 9112474888, 7178737816, 9119670803, 9112483644 } },
	darktee = { type = "TShirt", ids = { 7178736794, 9119670803 } },
	longsleeve = { type = "TShirt", ids = { 9120031517, 7178740556 } },
	flannel = { type = "Shirt", ids = { 7178744611, 7178743190 } },
	buttondown = { type = "Shirt", ids = { 9620950227, 9728271806 } },
	floral = { type = "Shirt", ids = { 9728267998 } },
	blouse = { type = "Shirt", ids = { 9240752338, 9174384558, 9620958893 } },
	sweater = { type = "Sweater", ids = { 9240757332, 6984769289, 9240758221 } },
	softsweater = { type = "Sweater", ids = { 6984769289, 6984771334, 9240758221 } },
	hoodie = { type = "Jacket", ids = { 7192553841, 8648389231, 6984765766, 8516620262 } },
	blackhoodie = { type = "Jacket", ids = { 7192553841 } },
	leather = { type = "Jacket", ids = { 7192549218, 6984767443, 7192547628 } },
	blackleather = { type = "Jacket", ids = { 7192549218 } },
	denim = { type = "Jacket", ids = { 8516609675, 8516612751 } },
	whitecoat = { type = "Jacket", ids = { 8648380153 } },
	parka = { type = "Jacket", ids = { 8648397446 } },
	suit = { type = "Jacket", ids = { 8516648620, 8516638468 } },
	smartsuit = { type = "Jacket", ids = { 8516655378, 7192546798 } },
	sweats = { type = "Pants", ids = { 6984763785, 7192664790 } },
	blacksweats = { type = "Pants", ids = { 6984763785 } },
	cargo = { type = "Pants", ids = { 6984740059 } },
	motopants = { type = "Pants", ids = { 8721985925 } },
	bermuda = { type = "Shorts", ids = { 9174391966, 9274782406, 9240767370, 9240765837 } },
	jeanshorts = { type = "Shorts", ids = { 7192687500 } },
	sportshorts = { type = "Shorts", ids = { 7192689453, 7192688494 } },
	longskirt = { type = "DressSkirt", ids = { 9240776381, 7192696851, 7192691582 } },
	shortskirt = { type = "DressSkirt", ids = { 7192690731, 9240772455 } },
	-- classic (texture) trousers under everything else
	jeans = { type = "ClassicPants", ids = { 129458426, 382537569, 144076760, 129458426 } },
	blackjeans = { type = "ClassicPants", ids = { 382537569 } },
	slacks = { type = "ClassicPants", ids = { 129459077 } },
}
Avatars.WARDROBE = W
-- shoes come in left/right pairs
local SHOES = {
	sneakers = { { 7193165925, 7193166879 }, { 9482987287, 9482991343 }, { 9614684090, 9614686845 }, { 9614815801, 9614817943 } },
	canvas = { { 9481782649, 9481786623 }, { 9483690316, 9483697460 }, { 7192843096, 7192846003 } },
	hightops = { { 9542380884, 9542391112 }, { 9614791602, 9614793581 } },
	running = { { 8722108564, 8722044460 }, { 8722159299, 8722157748 }, { 8722031289, 8722020587 } },
	dress = { { 8044843668, 8044852814 }, { 8044823721, 8044826993 } },
	blackdress = { { 8044843668, 8044852814 } },
	boots = { { 9614836327, 9614841343 }, { 9542395442, 9542450828 }, { 7193170137, 7193171232 }, { 7193168012, 7193169059 } },
	blackboots = { { 9614836327, 9614841343 }, { 9542395442, 9542450828 } },
	flats = { { 7193104827, 7193106211 }, { 9530300843, 9530292054 }, { 9538147267, 9538149777 } },
}
Avatars.SHOES = SHOES
-- rigid accessories
local A = {
	glasses = { type = "Face", ids = { 11884330, 62690529 } },
	sunglasses = { type = "Face", ids = { 51245241, 134823161 } },
	bandit = { type = "Face", ids = { 93050572 } },
	headphones = { type = "Hat", ids = { 10467314620 } },
	headset = { type = "Hat", ids = { 100425864 } },
	bluetooth = { type = "Hat", ids = { 30200159 } },
	beanie = { type = "Hat", ids = { 6467488863, 6468105116, 105354517 } },
	robber = { type = "Hat", ids = { 81708856 } },
	cap = { type = "Hat", ids = { 607702162 } },
	flatcap = { type = "Hat", ids = { 60662813 } },
	guardcap = { type = "Hat", ids = { 125886232 } },
	hardhat = { type = "Hat", ids = { 17408283 } },
	scarf = { type = "Neck", ids = { 99860652, 323420663 } },
	camera = { type = "Neck", ids = { 9231542509 } },
	handbag = { type = "Back", ids = { 6803405665, 6807138720, 6807133411 } },
	backpack = { type = "Back", ids = { 1744222336 } },
	guitar = { type = "Back", ids = { 417455866 } },
}
Avatars.ACCESSORIES = A
-- hats sit on the head: no hair style that would poke through them
local HATS = { Hat = true }

-- What each look wears. top: combos of wardrobe kinds (layered from the body out); bottom and
-- shoes: one kind each; extras: { accessory, chance }; female: chance of a woman; age: young,
-- adult, old or kid; topF/bottomF/shoesF/extrasF override for women.
Avatars.OUTFITS = {
	student = {
		female = 0.5, age = "young",
		top = { { "tee" }, { "longsleeve" }, { "tee", "hoodie" }, { "tee", "denim" } },
		bottom = { "jeans", "jeans", "sweats", "jeanshorts" }, shoes = { "sneakers", "canvas", "hightops" },
		extras = { { "backpack", 0.7 }, { "headphones", 0.25 } },
	},
	gamer = {
		female = 0.3, age = "young",
		top = { { "darktee" }, { "tee", "hoodie" }, { "darktee", "blackhoodie" } },
		bottom = { "sweats", "jeans", "blackjeans" }, shoes = { "sneakers", "hightops", "running" },
		extras = { { "headset", 0.5 } },
	},
	streamer = {
		female = 0.5, age = "young",
		top = { { "tee", "hoodie" }, { "longsleeve" }, { "darktee", "leather" } },
		bottom = { "blackjeans", "sweats" }, bottomF = { "blackjeans", "shortskirt" }, shoes = { "hightops", "sneakers" },
		extras = { { "headphones", 0.6 } },
	},
	aunt = {
		female = 1, age = "old",
		top = { { "blouse" }, { "softsweater" }, { "blouse", "parka" } },
		bottom = { "longskirt", "slacks" }, shoes = { "flats" },
		extras = { { "handbag", 0.7 }, { "scarf", 0.35 }, { "glasses", 0.3 } },
	},
	uncle = {
		female = 0, age = "old",
		top = { { "flannel" }, { "buttondown" }, { "sweater" }, { "buttondown", "parka" } },
		bottom = { "slacks", "jeans" }, shoes = { "dress", "boots" },
		extras = { { "flatcap", 0.45 } },
	},
	grandpa = {
		female = 0, age = "old",
		top = { { "sweater" }, { "buttondown", "parka" }, { "buttondown" } },
		bottom = { "slacks" }, shoes = { "dress" },
		extras = { { "flatcap", 0.75 }, { "glasses", 0.7 } },
	},
	business = {
		female = 0.45, age = "adult",
		top = { { "buttondown", "suit" }, { "tee", "suit" }, { "buttondown", "smartsuit" } },
		bottom = { "slacks" }, bottomF = { "slacks", "longskirt" }, shoes = { "blackdress" }, shoesF = { "flats", "blackdress" },
		extras = { { "bluetooth", 0.25 } }, extrasF = { { "handbag", 0.6 } },
	},
	casual = {
		female = 0.5, age = "adult",
		top = { { "tee" }, { "flannel" }, { "tee", "denim" }, { "sweater" }, { "longsleeve" }, { "tee", "leather" } },
		bottom = { "jeans", "jeans", "cargo", "bermuda" }, bottomF = { "jeans", "longskirt", "jeanshorts" },
		shoes = { "sneakers", "canvas", "boots" }, shoesF = { "sneakers", "flats", "canvas" },
		extras = { { "sunglasses", 0.15 } }, extrasF = { { "handbag", 0.4 } },
	},
	cheap = {
		female = 0.3, age = "adult",
		top = { { "tee" }, { "flannel" }, { "tee", "hoodie" } },
		bottom = { "cargo", "jeans", "sweats" }, shoes = { "canvas", "boots" },
		extras = { { "cap", 0.5 } },
	},
	designer = {
		female = 0.5, age = "adult",
		top = { { "darktee", "whitecoat" }, { "darktee", "blackleather" }, { "sweater" } },
		bottom = { "blackjeans" }, shoes = { "hightops", "blackdress" },
		extras = { { "glasses", 0.6 } },
	},
	developer = {
		female = 0.35, age = "young",
		top = { { "tee", "hoodie" }, { "darktee" }, { "flannel" } },
		bottom = { "jeans" }, shoes = { "sneakers", "canvas" },
		extras = { { "glasses", 0.6 }, { "backpack", 0.4 }, { "headphones", 0.2 } },
	},
	doctor = {
		female = 0.5, age = "adult",
		top = { { "buttondown", "whitecoat" }, { "tee", "whitecoat" } },
		bottom = { "slacks" }, shoes = { "blackdress", "sneakers" }, shoesF = { "flats", "sneakers" },
		extras = { { "glasses", 0.35 } },
	},
	hurry = {
		female = 0.4, age = "adult",
		top = { { "longsleeve" }, { "tee", "hoodie" } },
		bottom = { "sweats", "sportshorts" }, shoes = { "running" },
		extras = { { "headphones", 0.3 } },
	},
	influencer = {
		female = 0.8, age = "young",
		top = { { "blouse" }, { "tee", "denim" }, { "longsleeve" } }, topF = { { "blouse" }, { "blouse", "denim" }, { "softsweater" } },
		bottom = { "jeans", "bermuda" }, bottomF = { "shortskirt", "jeanshorts", "jeans" },
		shoes = { "hightops", "sneakers" }, shoesF = { "hightops", "flats" },
		extras = { { "sunglasses", 0.7 } }, extrasF = { { "sunglasses", 0.7 }, { "handbag", 0.6 } },
	},
	kid = {
		female = 0.5, age = "kid",
		top = { { "tee" }, { "longsleeve" }, { "tee", "hoodie" } },
		bottom = { "jeans", "sportshorts", "jeanshorts" }, shoes = { "sneakers", "canvas" },
		extras = { { "cap", 0.3 }, { "backpack", 0.4 } },
	},
	knowitall = {
		female = 0.3, age = "adult",
		top = { { "buttondown", "sweater" }, { "buttondown" }, { "flannel" } },
		bottom = { "slacks", "jeans" }, shoes = { "dress", "canvas" },
		extras = { { "glasses", 0.9 } },
	},
	miner = {
		female = 0.2, age = "adult",
		top = { { "tee", "hoodie" }, { "flannel" }, { "darktee", "parka" } },
		bottom = { "cargo", "jeans" }, shoes = { "boots" },
		extras = { { "beanie", 0.4 } },
	},
	musician = {
		female = 0.4, age = "young",
		top = { { "darktee", "blackleather" }, { "darktee" }, { "flannel" } },
		bottom = { "blackjeans" }, shoes = { "blackboots", "hightops" },
		extras = { { "guitar", 0.8 }, { "beanie", 0.3 } },
	},
	rich = {
		female = 0.45, age = "adult",
		top = { { "buttondown", "smartsuit" }, { "darktee", "smartsuit" }, { "sweater" } },
		bottom = { "slacks" }, bottomF = { "slacks", "longskirt" }, shoes = { "dress" }, shoesF = { "flats", "dress" },
		extras = { { "sunglasses", 0.75 } }, extrasF = { { "sunglasses", 0.7 }, { "handbag", 0.9 } },
	},
	shady = {
		female = 0.15, age = "adult",
		top = { { "darktee", "blackhoodie" }, { "darktee", "blackleather" } },
		bottom = { "blacksweats", "blackjeans" }, shoes = { "blackboots", "hightops" },
		extras = { { "beanie", 0.5 }, { "sunglasses", 0.4 } },
	},
	teacher = {
		female = 0.55, age = "adult",
		top = { { "buttondown", "sweater" }, { "flannel" }, { "sweater" } }, topF = { { "blouse" }, { "softsweater" }, { "blouse", "denim" } },
		bottom = { "slacks", "jeans" }, bottomF = { "slacks", "longskirt" }, shoes = { "dress", "canvas" }, shoesF = { "flats" },
		extras = { { "glasses", 0.7 } },
	},
	tourist = {
		female = 0.5, age = "adult",
		top = { { "floral" }, { "tee" }, { "longsleeve" } },
		bottom = { "bermuda", "cargo" }, shoes = { "canvas", "sneakers" },
		extras = { { "camera", 0.7 }, { "sunglasses", 0.5 }, { "cap", 0.3 }, { "backpack", 0.3 } },
	},
	annoying = {
		female = 0.5, age = "young",
		top = { { "floral" }, { "longsleeve" }, { "tee", "hoodie" } }, topF = { { "blouse" }, { "softsweater" } },
		bottom = { "sportshorts", "sweats" }, bottomF = { "shortskirt", "sweats" }, shoes = { "running", "hightops" },
		extras = { { "sunglasses", 0.5 }, { "cap", 0.3 } },
	},
	shopkeeper = {
		female = 0.4, age = "adult",
		top = { { "buttondown" }, { "flannel" }, { "tee", "sweater" } },
		bottom = { "slacks", "jeans" }, shoes = { "dress", "canvas" }, shoesF = { "flats" },
		extras = {},
	},
	-- staff
	technician = {
		female = 0.4, age = "young",
		top = { { "buttondown" }, { "tee", "hoodie" }, { "darktee" } },
		bottom = { "jeans", "cargo" }, shoes = { "sneakers", "boots" },
		extras = {},
	},
	receptionist = {
		female = 0.65, age = "young",
		top = { { "buttondown" }, { "tee", "suit" } }, topF = { { "blouse" }, { "blouse", "suit" } },
		bottom = { "slacks" }, bottomF = { "slacks", "longskirt" }, shoes = { "blackdress" }, shoesF = { "flats" },
		extras = {},
	},
	manager = {
		female = 0.4, age = "adult",
		top = { { "buttondown", "suit" }, { "tee", "suit" } },
		bottom = { "slacks" }, shoes = { "blackdress" }, shoesF = { "blackdress", "flats" },
		extras = { { "bluetooth", 0.3 } },
	},
	cleaner = {
		female = 0.5, age = "adult",
		top = { { "tee" }, { "tee", "hoodie" } },
		bottom = { "sweats", "cargo" }, shoes = { "boots", "canvas" },
		extras = {},
	},
	guard = {
		female = 0.2, age = "adult",
		top = { { "darktee", "blackleather" } },
		bottom = { "blackjeans", "slacks" }, shoes = { "blackboots" },
		extras = { { "guardcap", 0.8 } },
	},
	thief = {
		female = 0.15, age = "adult",
		top = { { "darktee", "blackhoodie" } },
		bottom = { "blacksweats" }, shoes = { "blackboots", "hightops" },
		extras = { { "robber", 0.9 }, { "bandit", 0.6 } },
	},
}

-- Skin tones, light to dark (weighted toward the city's most common ones)
Avatars.SKIN = {
	{ 255, 224, 196 }, { 241, 194, 160 }, { 234, 184, 146 }, { 224, 172, 130 }, { 198, 140, 98 }, { 160, 108, 72 }, { 120, 80, 52 }, { 92, 60, 40 },
}
local SKIN_WEIGHTS = { 3, 5, 5, 4, 3, 2, 1, 1 }

-- Looks the street pedestrians are drawn from
Avatars.STREET = { "casual", "casual", "casual", "student", "business", "aunt", "uncle", "grandpa", "tourist", "hurry", "teacher", "developer", "influencer", "kid", "doctor", "musician" }

local function pick(rng: Random, list: { any }): any
	return list[rng:NextInteger(1, #list)]
end

local function weighted(rng: Random, weights: { number }): number
	local total = 0
	for _, w in weights do
		total += w
	end
	local r = rng:NextNumber() * total
	for i, w in weights do
		r -= w
		if r <= 0 then
			return i
		end
	end
	return #weights
end

export type Item = { id: number, type: string, order: number? }
export type Outfit = {
	look: string,
	gender: string,
	kid: boolean,
	body: { [string]: any },
	head: number,
	hair: number?,
	pants: number?,
	items: { Item },
	skin: { number },
	scale: { height: number, width: number, depth: number, head: number },
}

-- A complete outfit for one person of the given look. gender ("m"/"f") is honoured when given.
function Avatars.outfit(look: string, rng: Random, gender: string?): Outfit
	local def = Avatars.OUTFITS[look] or Avatars.OUTFITS.casual
	local g = gender
	if g ~= "m" and g ~= "f" then
		g = if rng:NextNumber() < def.female then "f" else "m"
	end
	local isF = g == "f"
	local items: { Item } = {}
	local o: Outfit = {
		look = look,
		gender = g :: string,
		kid = def.age == "kid",
		body = pick(rng, Avatars.BODIES[g]),
		head = 0,
		hair = nil,
		pants = nil,
		items = items,
		skin = Avatars.SKIN[weighted(rng, SKIN_WEIGHTS)],
		scale = { height = 1, width = 1, depth = 1, head = 1 },
	}
	local kit = pick(rng, Avatars.HEADS[g])
	o.head = kit.head
	table.insert(items, { id = kit.brows, type = "Eyebrow" })
	table.insert(items, { id = kit.lashes, type = "Eyelash" })
	-- clothes
	local tops = if isF and def.topF then def.topF else def.top
	for _, kind in pick(rng, tops) do
		local w = W[kind]
		table.insert(items, { id = pick(rng, w.ids), type = w.type, order = LAYER[w.type] })
	end
	local bottom = W[pick(rng, if isF and def.bottomF then def.bottomF else def.bottom)]
	if bottom.type == "ClassicPants" then
		o.pants = pick(rng, bottom.ids)
	else
		table.insert(items, { id = pick(rng, bottom.ids), type = bottom.type, order = LAYER[bottom.type] })
		-- skirts and shorts leave the legs bare; trousers underneath would show
	end
	local pair = pick(rng, SHOES[pick(rng, if isF and def.shoesF then def.shoesF else def.shoes)])
	table.insert(items, { id = pair[1], type = "LeftShoe", order = LAYER.LeftShoe })
	table.insert(items, { id = pair[2], type = "RightShoe", order = LAYER.RightShoe })
	-- accessories
	local hasHat = false
	for _, e in (if isF and def.extrasF then def.extrasF else def.extras) do
		if rng:NextNumber() < e[2] then
			local a = A[e[1]]
			if not (HATS[a.type] and hasHat) then
				hasHat = hasHat or HATS[a.type] == true
				table.insert(items, { id = pick(rng, a.ids), type = a.type })
			end
		end
	end
	-- hair (short styles under hats so nothing pokes through)
	local style = pick(rng, HAIR_STYLES[g])
	if hasHat then
		style = if isF then "PonyTail" else "ShortSleek"
	end
	o.hair = HAIR[style][weighted(rng, HAIR_COLOR_WEIGHTS)]
	-- build: adults vary a little, kids are small
	if o.kid then
		o.scale = { height = rng:NextNumber(0.68, 0.76), width = 0.82, depth = 0.85, head = 1.06 }
	else
		local h = if isF then rng:NextNumber(0.9, 0.98) else rng:NextNumber(0.95, 1.03)
		local w = rng:NextNumber(0.94, 1.06)
		o.scale = { height = h, width = w, depth = w, head = 1 }
	end
	return o
end

-- Every catalog id the outfits can use (for checks and preloading)
function Avatars.allIds(): { number }
	local seen, out = {}, {}
	local function add(id)
		if type(id) == "number" and not seen[id] then
			seen[id] = true
			table.insert(out, id)
		end
	end
	for _, list in Avatars.BODIES do
		for _, b in list do
			for _, k in { "torso", "la", "ra", "ll", "rl" } do
				add(b[k])
			end
		end
	end
	for _, list in Avatars.HEADS do
		for _, h in list do
			add(h.head)
			add(h.brows)
			add(h.lashes)
		end
	end
	for _, s in HAIR do
		for _, id in s do
			add(id)
		end
	end
	for _, w in W do
		for _, id in w.ids do
			add(id)
		end
	end
	for _, list in SHOES do
		for _, pair in list do
			add(pair[1])
			add(pair[2])
		end
	end
	for _, a in A do
		for _, id in a.ids do
			add(id)
		end
	end
	return out
end

return Avatars
