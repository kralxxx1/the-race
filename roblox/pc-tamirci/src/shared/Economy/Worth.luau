-- Worth: what a player's business is worth, for the "net worth" leaderboards. Cash at face value;
-- parts at what they'd fetch (market price, condition, a dealer's cut); the shop, its fittings,
-- the vehicles and the factory at a share of what they cost; the factory's warehouse at
-- wholesale.

local Parts = require(script.Parent.Parent.Data.Parts)
local Upgrades = require(script.Parent.Parent.Data.Upgrades)
local Vehicles = require(script.Parent.Parent.Data.Vehicles)
local Factory = require(script.Parent.Parent.Data.Factory)

local Worth = {}

Worth.PartRate = 0.7 -- of the part's price, by condition
Worth.AssetRate = 0.6 -- of what the shop, items, vehicles and factory cost

function Worth.of(p): { [string]: number }
	local cash = math.floor(p.money or 0)
	local stock = 0
	for _, item in p.inv or {} do
		local part = Parts.get(item.part)
		if part and not item.broken then
			stock += part.price * (item.cond or 1) * Worth.PartRate
		end
	end
	local shop = 0
	local level = p.shop and p.shop.level or 1
	for l = 2, level do
		local L = Upgrades.levels[l]
		shop += (L and L.cost or 0) * Worth.AssetRate
	end
	for id, has in p.shop and p.shop.items or {} do
		local it = has and Upgrades.get(id)
		if it then
			shop += it.cost * Worth.AssetRate * 0.8
		end
	end
	local vehicles = 0
	for id in p.vehicles or {} do
		local v = Vehicles.get(id)
		if v then
			vehicles += v.price * Worth.AssetRate
		end
	end
	local factory = 0
	if type(p.factory) == "table" and p.factory.level then
		for l = 1, p.factory.level do
			factory += Factory.level(l).cost * Worth.AssetRate
		end
		for id, n in p.factory.stock or {} do
			factory += Factory.wholesale(id) * n
		end
	end
	local total = cash + stock + shop + vehicles + factory
	return {
		cash = cash,
		stock = math.floor(stock),
		shop = math.floor(shop),
		vehicles = math.floor(vehicles),
		factory = math.floor(factory),
		total = math.floor(total),
	}
end

return Worth
