-- Market: prices and listings, shared by the server (which sells) and the client (which shows them).
-- Everything is deterministic for a given UTC day so all players see the same deals.

local Shared = script.Parent.Parent
local Config = require(Shared.Config)
local Parts = require(Shared.Data.Parts)
local Rand = require(Shared.Util.Rand)

local Market = {}

function Market.day(): number
	return math.floor(os.time() / 86400)
end

local function swing(id: string, day: number): number
	local h = Rand.hash(id .. ":" .. day) % 1000 / 1000
	return 1 + (h * 2 - 1) * Config.DailyPriceSwing
end

-- Today's deals: a handful of parts 25 % off.
local dealCache = { day = -1, set = {} }
function Market.deals(day: number): { [string]: boolean }
	if dealCache.day == day then
		return dealCache.set
	end
	local rng = Rand.new(day * 7 + 3)
	local out = {}
	local pool = {}
	for _, p in Parts.list do
		if p.cat ~= "misc" and p.cat ~= "case" then
			table.insert(pool, p.id)
		end
	end
	for _ = 1, 10 do
		out[pool[rng:NextInteger(1, #pool)]] = true
	end
	dealCache.day, dealCache.set = day, out
	return out
end

-- New price at the parts depot.
function Market.price(p, day: number?): number
	local d = day or Market.day()
	local v = p.price * swing(p.id, d)
	if Market.deals(d)[p.id] then
		v *= 0.75
	end
	return math.max(1, math.floor(v + 0.5))
end

-- What can be bought at a service: "parts" sells everything new, the bazaar older generations.
function Market.catalog(service: string, day: number?)
	local d = day or Market.day()
	local out = {}
	for _, p in Parts.list do
		local ok = true
		if (p.cat == "case" and service ~= "parts") or p.own then
			ok = false
		end
		if service == "parts_bazaar" then
			ok = ok and p.cat ~= "misc" and (p.year or 2030) <= 2019
		end
		if ok then
			local price = Market.price(p, d)
			if service == "parts_bazaar" then
				price = math.max(1, math.floor(price * 0.72))
			end
			table.insert(out, { id = p.id, price = price, deal = Market.deals(d)[p.id] == true })
		end
	end
	return out
end

-- Second-hand listings at a market (cond 0.35..0.95); some hide faults (decided at purchase).
function Market.used(poi: string, day: number?)
	local d = day or Market.day()
	local rng = Rand.new(Rand.hash(poi) + d * 131)
	local out = {}
	local cats = { "gpu", "gpu", "cpu", "ram", "ram", "storage", "storage", "psu", "mobo", "cooler", "fan" }
	for i = 1, 14 do
		local list = Parts.byCat[Rand.pick(rng, cats)]
		local p = list[rng:NextInteger(1, #list)]
		while p.own do
			p = list[rng:NextInteger(1, #list)]
		end
		local cond = math.floor(Rand.range(rng, 0.35, 0.95) * 100) / 100
		local price = math.max(2, math.floor(p.price * Config.UsedSellRate * cond * 1.35 + 0.5))
		table.insert(out, { id = poi .. "_" .. d .. "_" .. i, part = p.id, cond = cond, price = price, risk = math.floor((1 - cond) * 40) })
	end
	-- laptops' service parts turn up too
	for i = 1, 4 do
		local list = Parts.byCat.laptop
		local p = list[rng:NextInteger(1, #list)]
		local cond = math.floor(Rand.range(rng, 0.5, 0.95) * 100) / 100
		table.insert(out, { id = poi .. "_" .. d .. "_L" .. i, part = p.id, cond = cond, price = math.max(2, math.floor(p.price * 0.55 * cond + 0.5)), risk = 12 })
	end
	return out
end

-- Junk PCs at the scrapyard (the device itself is generated on purchase from `seed`).
function Market.junk(day: number?)
	local d = day or Market.day()
	local rng = Rand.new(d * 977 + 5)
	local out = {}
	for i = 1, 5 do
		table.insert(out, { id = "junk_" .. d .. "_" .. i, seed = rng:NextInteger(1, 1e8), price = rng:NextInteger(35, 160), look = Rand.pick(rng, { "beige", "black", "grey" }) })
	end
	return out
end

-- What the second-hand dealer pays for an inventory item.
function Market.sellPrice(item): number
	local p = Parts.get(item.part)
	if not p then
		return 0
	end
	if item.broken then
		return math.max(1, math.floor(p.price * 0.06))
	end
	return math.max(1, math.floor(p.price * Config.UsedSellRate * (item.cond or 1) + 0.5))
end

-- What the scrapyard pays (metal and gold): little, but for anything.
function Market.scrapPrice(item): number
	local p = Parts.get(item.part)
	if not p then
		return 0
	end
	return math.max(1, math.floor(p.price * 0.09 + 0.5))
end

return Market
