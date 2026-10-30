-- MarketingService: advertising campaigns and brand awareness (Data/Marketing).
-- The player buys a campaign from the phone's Marketing app (marketing.buy); CustomerService reads
-- MarketingService.flow(player) when it decides how soon the next customer comes and
-- MarketingService.richBias(player) when it picks who comes. Awareness fades a little every
-- minute and grows with good repairs (MarketingService.cheer).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Marketing = require(Shared.Data.Marketing)

local DataService = require(script.Parent.DataService)

local MarketingService = {}

local V = Net.V

local function brandOf(player: Player)
	local p = DataService.get(player)
	if not p then
		return nil, nil
	end
	p.brand = p.brand or { fame = 5, sat = 70, ads = {} }
	p.brand.ads = p.brand.ads or {}
	return p.brand, p
end

function MarketingService.flow(player: Player): number
	return Marketing.flow(brandOf(player), os.time())
end

function MarketingService.richBias(player: Player): number
	return Marketing.richBias(brandOf(player), os.time())
end

-- A customer went home happy (or not): awareness follows the stars, satisfaction is a running
-- average of them.
function MarketingService.cheer(player: Player, stars: number)
	local brand = brandOf(player)
	if not brand then
		return
	end
	brand.fame = math.clamp(brand.fame + (stars - 2.5) * 0.35, 0, 100)
	brand.sat = math.clamp(brand.sat * 0.9 + (stars / 5 * 100) * 0.1, 0, 100)
	DataService.touch(player)
end

function MarketingService.start()
	Net.handle("marketing.buy", function(player, payload)
		if not V.tbl(payload) or type(payload.id) ~= "string" then
			return { ok = false, err = "bad_request" }
		end
		local brand, p = brandOf(player)
		local camp = Marketing.byId[payload.id]
		if not brand or not p or not camp then
			return { ok = false, err = "bad_request" }
		end
		if p.level < camp.level then
			return { ok = false, err = "level" }
		end
		local now = os.time()
		if Marketing.active(brand, now)[camp.id] then
			return { ok = false, err = "already_running" }
		end
		if not DataService.money(player, -camp.cost, "marketing") then
			return { ok = false, err = "money" }
		end
		brand.ads[camp.id] = now + camp.minutes * 60
		brand.fame = math.clamp(brand.fame + camp.fame, 0, 100)
		DataService.touch(player)
		return { ok = true }
	end)
	-- awareness fades slowly when nobody talks about the shop
	task.spawn(function()
		while true do
			task.wait(60)
			for _, player in Players:GetPlayers() do
				local brand = brandOf(player)
				if brand and brand.fame > 0 then
					brand.fame = math.max(0, brand.fame - 0.05)
				end
			end
		end
	end)
end

function MarketingService.init() end

return MarketingService
