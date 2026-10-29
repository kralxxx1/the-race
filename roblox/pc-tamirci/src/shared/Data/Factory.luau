-- Factory: your own production at the industrial estate. Buy a small workshop and grow it into a
-- technology campus; each level adds a production line, speed, warehouse room and an electricity
-- bill. A line makes a batch of one "Atölye" product (Data/Parts, own = true) from bought-in
-- materials; the batch lands in the factory's warehouse, from where you ship it to your shop (to
-- build PCs and setups with) or sell it to distributors.

local Parts = require(script.Parent.Parts)

local Factory = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

-- cost: to buy (level 1) or upgrade to it; req: player level; elec: $ a day on the utility bill
Factory.levels = {
	{ level = 1, name = N("Küçük Üretim Atölyesi", "Small Production Workshop"), cost = 15000, req = 6, lines = 1, speed = 1, storage = 80, elec = 25 },
	{ level = 2, name = N("Montaj Hattı", "Assembly Line"), cost = 45000, req = 9, lines = 2, speed = 1.2, storage = 160, elec = 45 },
	{ level = 3, name = N("Elektronik Fabrikası", "Electronics Factory"), cost = 120000, req = 13, lines = 3, speed = 1.45, storage = 300, elec = 80 },
	{ level = 4, name = N("Otomasyonlu Fabrika", "Automated Factory"), cost = 300000, req = 17, lines = 4, speed = 1.75, storage = 600, elec = 130 },
	{ level = 5, name = N("Teknoloji Kampüsü", "Technology Campus"), cost = 700000, req = 21, lines = 5, speed = 2.1, storage = 1200, elec = 200 },
}

-- batch: units a run makes; seconds: how long a run takes at speed 1; minLevel: the factory level
Factory.products = {
	{ part = "fan_atl_rgb120", batch = 30, seconds = 60, minLevel = 1 },
	{ part = "per_atl_pad", batch = 30, seconds = 60, minLevel = 1 },
	{ part = "per_atl_ms", batch = 20, seconds = 90, minLevel = 1 },
	{ part = "ram_atl_ddr4_8", batch = 20, seconds = 90, minLevel = 1 },
	{ part = "case_atl_mid", batch = 10, seconds = 120, minLevel = 1 },
	{ part = "case_atl_white", batch = 10, seconds = 120, minLevel = 1 },
	{ part = "per_atl_kb", batch = 15, seconds = 120, minLevel = 2 },
	{ part = "st_atl_ssd1t", batch = 15, seconds = 120, minLevel = 2 },
	{ part = "ram_atl_ddr4_16", batch = 15, seconds = 120, minLevel = 2 },
	{ part = "psu_atl550", batch = 10, seconds = 150, minLevel = 2 },
	{ part = "cool_atl_tower", batch = 12, seconds = 120, minLevel = 2 },
	{ part = "per_atl_hs", batch = 12, seconds = 150, minLevel = 3 },
	{ part = "st_atl_nv1t", batch = 15, seconds = 150, minLevel = 3 },
	{ part = "ram_atl_ddr4_32", batch = 12, seconds = 150, minLevel = 3 },
	{ part = "ram_atl_ddr5_16", batch = 12, seconds = 180, minLevel = 3 },
	{ part = "psu_atl750", batch = 8, seconds = 180, minLevel = 3 },
	{ part = "per_atl_mon", batch = 6, seconds = 240, minLevel = 4 },
	{ part = "cool_atl_aio240", batch = 8, seconds = 240, minLevel = 4 },
	{ part = "psu_atl1000", batch = 6, seconds = 240, minLevel = 4 },
	{ part = "ram_atl_ddr5_32", batch = 10, seconds = 240, minLevel = 5 },
	{ part = "st_atl_nv2t", batch = 10, seconds = 240, minLevel = 5 },
}
Factory.byPart = {}
for _, pr in Factory.products do
	assert(Parts.get(pr.part), "factory product without a part: " .. pr.part)
	Factory.byPart[pr.part] = pr
end

Factory.MaterialRate = 0.35 -- materials for one unit, as a share of the product's market price
Factory.WholesaleRate = 0.8 -- what distributors pay, as a share of the market price

function Factory.level(n: number)
	return Factory.levels[math.clamp(n, 1, #Factory.levels)]
end

-- Materials for one batch.
function Factory.materials(pr): number
	local part = Parts.get(pr.part)
	return math.floor((part and part.price or 0) * Factory.MaterialRate * pr.batch + 0.5)
end

-- Seconds a batch takes in a factory of this level.
function Factory.batchSeconds(pr, level: number): number
	return math.max(10, math.floor(pr.seconds / Factory.level(level).speed + 0.5))
end

-- What a distributor pays for one unit.
function Factory.wholesale(partId: string): number
	local part = Parts.get(partId)
	return math.max(1, math.floor((part and part.price or 0) * Factory.WholesaleRate + 0.5))
end

-- Units waiting in the warehouse.
function Factory.stocked(f): number
	local n = 0
	for _, c in f and f.stock or {} do
		n += c
	end
	return n
end

return Factory
