-- ShowcaseService: the PC showcase in the shop window (a shop item from level 4). Put a finished
-- build of your own on a stand; walk-in buyers pay more for it than the second-hand dealer.
-- The prompt on a stand puts your best finished project on it, or takes the PC back. With a
-- monitor, a keyboard and a mouse in the inventory the PC goes out as a setup: the best
-- peripherals of each kind (headset, mouse pad, speakers, webcam, chair, desk too) are bundled
-- with it, sold together for more, and come back to the inventory if you take the PC back.

local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Employees = require(Shared.Data.Employees)
local Parts = require(Shared.Data.Parts)
local Market = require(Shared.Economy.Market)
local B = require(Shared.Util.Builder)
local Rules = require(Shared.Repair.RepairRules)
local PCModel = require(Shared.Models.PCModel)
local DeviceGen = require(Shared.Repair.DeviceGen)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)
local RepairService = require(script.Parent.RepairService)

local ShowcaseService = {}

local rng = Random.new()
local SALE_EVERY = 40 -- seconds between buyer visits
local SALE_CHANCE = 0.22 -- per PC on display per visit
local PRICE_FACTOR = 1.35 -- on top of what the second-hand dealer pays
local SETUP_MARKUP = 1.3 -- the bundled peripherals sell for more than their shop price
local SETUP_KINDS = { "monitor", "keyboard", "mouse", "headset", "pad", "speakers", "webcam", "chair", "desk" }
local SETUP_NEEDS = { monitor = true, keyboard = true, mouse = true }

local models: { [Player]: { [number]: Model } } = {}

local function slotPart(player: Player, slot: number): BasePart?
	local shop = PlotService.shopOf(player)
	local points = shop and shop.points
	return points and points:FindFirstChild("Showcase_" .. slot) :: BasePart?
end

local function jobOn(player: Player, slot: number)
	for _, job in RepairService.jobs(player) do
		if job.status == "showcase" and job.showcase == slot then
			return job
		end
	end
	return nil
end

local function staffOf(player: Player)
	local p = DataService.get(player)
	return p and p.staff
end

-- What the bundled peripherals are worth.
local function setupValue(job): number
	local v = 0
	for _, item in job.setup or {} do
		local part = Parts.get(item.part)
		if part then
			v += Market.price(part) * (item.cond or 1)
		end
	end
	return v
end

-- The price on the stand: the PC, plus the setup's peripherals, plus a sales consultant's pitch.
function ShowcaseService.priceOf(player: Player, job): number
	local base = RepairService.resale(job) * PRICE_FACTOR + setupValue(job) * SETUP_MARKUP
	return math.floor(base * (1 + Employees.effect(staffOf(player), "salesPrice")))
end

-- Takes the best monitor, keyboard and mouse (and whatever else goes on a desk) out of the
-- inventory for a setup. Nothing is taken unless the three essentials are there.
local function bundle(player: Player, job): boolean
	local p = DataService.get(player)
	if not p then
		return false
	end
	local best = {}
	for _, item in p.inv do
		local part = Parts.get(item.part)
		if part and part.cat == "peripheral" and not item.broken then
			local cur = best[part.kind]
			if not cur or part.price * (item.cond or 1) > cur.v then
				best[part.kind] = { item = item, v = part.price * (item.cond or 1) }
			end
		end
	end
	for kind in SETUP_NEEDS do
		if not best[kind] then
			return false
		end
	end
	job.setup = {}
	-- (kept in the save as well: projects live only as long as the session, peripherals don't)
	p.setupItems = p.setupItems or {}
	p.setupItems[job.id] = job.setup
	for _, kind in SETUP_KINDS do
		local b = best[kind]
		if b then
			local i = table.find(p.inv, b.item)
			if i then
				table.remove(p.inv, i)
				table.insert(job.setup, b.item)
			end
		end
	end
	DataService.touch(player)
	return true
end
ShowcaseService._bundle = bundle

-- Back from the stand: the peripherals return to the inventory.
local function unbundle(player: Player, job)
	local p = DataService.get(player)
	if p and job.setup then
		for _, item in job.setup do
			table.insert(p.inv, item)
		end
		if p.setupItems then
			p.setupItems[job.id] = nil
		end
		DataService.touch(player)
	end
	job.setup = nil
end

local function clearModel(player: Player, slot: number)
	local list = models[player]
	if list and list[slot] then
		list[slot]:Destroy()
		list[slot] = nil
	end
end

-- The PC itself, standing on the stand with its window towards the street.
local function showModel(player: Player, slot: number, job)
	clearModel(player, slot)
	local part = slotPart(player, slot)
	if not part then
		return
	end
	local shop = PlotService.shopOf(player)
	local view = Rules.view(job.device)
	local ok, h = pcall(PCModel.build, shop.model, view, PCModel.displayCFrame(part.CFrame, view), { animate = false })
	if not ok then
		warn("[ShowcaseService] " .. tostring(h))
		return
	end
	h.model.Name = "ShowcasePC_" .. slot
	for _, d in h.model:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
		end
	end
	-- a price card on the stand (a setup lists what comes with it)
	local card = B.box(h.model, part.CFrame * CFrame.new(-3.5, 0.85, -2.7) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(2.6, 1.5, 0.1), Color3.new(1, 1, 1), Enum.Material.SmoothPlastic, { CanCollide = false, CanQuery = false, CanTouch = false, Name = "PriceCard" })
	local kinds = {}
	for _, item in job.setup or {} do
		local pp = Parts.get(item.part)
		if pp then
			table.insert(kinds, pp.kind)
		end
	end
	local head = if #kinds > 0 then "🖥️ SET (" .. #kinds + 1 .. " parts)" else "🖥️ PC"
	B.sign(card, Enum.NormalId.Front, head .. "\n$" .. ShowcaseService.priceOf(player, job), { color = Color3.fromRGB(20, 20, 24), font = B.Fonts.Bold })
	models[player] = models[player] or {}
	models[player][slot] = h.model
end

-- The finished own project worth the most that isn't on display yet.
local function bestProject(player: Player)
	local best, bestValue = nil, -1
	for _, job in RepairService.jobs(player) do
		if job.own and job.status == "ready" and job.verdict and job.verdict.fixed then
			local v = DeviceGen.value(job.device)
			if v > bestValue then
				best, bestValue = job, v
			end
		end
	end
	return best
end

local function onPrompt(player: Player, slot: number)
	local job = jobOn(player, slot)
	if job then
		job.status = "ready"
		job.showcase = nil
		unbundle(player, job)
		clearModel(player, slot)
		RepairService.pushJobs(player)
		Net.push(player, "toast", { key = "showcase_back", vars = { name = job.name } })
		return
	end
	local pick = bestProject(player)
	if not pick then
		Net.push(player, "toast", { key = "showcase_none" })
		return
	end
	pick.status = "showcase"
	pick.showcase = slot
	local setup = bundle(player, pick)
	showModel(player, slot, pick)
	RepairService.pushJobs(player)
	Net.push(player, "toast", { key = if setup then "showcase_setup" else "showcase_put", vars = { name = pick.name, price = ShowcaseService.priceOf(player, pick), n = if pick.setup then #pick.setup else 0 } })
end

-- Prompts on the stands and the PCs back on them after the shop was rebuilt.
local function setup(player: Player, shop)
	models[player] = {}
	local points = shop.points
	if not points then
		return
	end
	for _, pt in points:GetChildren() do
		local slot = pt:GetAttribute("Showcase")
		if typeof(slot) == "number" and pt:IsA("BasePart") then
			local prompt = Instance.new("ProximityPrompt")
			prompt.Name = "ShowcasePrompt"
			prompt.ActionText = "Showcase"
			prompt.ObjectText = "PC Showcase"
			prompt.HoldDuration = 0.3
			prompt.MaxActivationDistance = 9
			prompt.RequiresLineOfSight = false
			prompt:SetAttribute("Slot", slot)
			prompt.Parent = pt
			local job = jobOn(player, slot)
			if job then
				showModel(player, slot, job)
			end
		end
	end
	-- stands that disappeared (the item can't be lost, but levels can rebuild the front)
	for _, job in RepairService.jobs(player) do
		if job.status == "showcase" and not slotPart(player, job.showcase) then
			job.status = "ready"
			job.showcase = nil
		end
	end
end

local function sellRound()
	for player, list in models do
		for slot in table.clone(list) do
			local job = jobOn(player, slot)
			if not job then
				clearModel(player, slot)
			elseif rng:NextNumber() < SALE_CHANCE * (1 + Employees.effect(staffOf(player), "sales")) * (if job.setup then 1.25 else 1) then
				local price = ShowcaseService.priceOf(player, job)
				-- (the setup's peripherals go with the PC)
				local p = DataService.get(player)
				if p and p.setupItems then
					p.setupItems[job.id] = nil
				end
				job.setup = nil
				clearModel(player, slot)
				RepairService.removeJob(player, job.id)
				DataService.money(player, price, "showcase")
				DataService.addXp(player, 35)
				DataService.rep(player, 1)
				Net.push(player, "toast", { key = "showcase_sold", vars = { name = job.name, price = price } })
			end
		end
	end
end

function ShowcaseService.init() end

function ShowcaseService.start()
	-- peripherals left in a setup when the last session ended come back to the inventory
	DataService.loaded:Connect(function(player, p)
		for _, items in p.setupItems or {} do
			for _, item in items do
				table.insert(p.inv, item)
			end
		end
		p.setupItems = nil
		DataService.touch(player)
	end)
	PlotService.built:Connect(setup)
	PlotService.released:Connect(function(player)
		models[player] = nil
	end)
	Players.PlayerRemoving:Connect(function(player)
		models[player] = nil
	end)
	ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "ShowcasePrompt" then
			return
		end
		local shop = PlotService.shopOf(player)
		local slot = prompt:GetAttribute("Slot")
		if not shop or typeof(slot) ~= "number" or not prompt:IsDescendantOf(shop.model) then
			Net.push(player, "toast", { key = "not_your_bench" })
			return
		end
		onPrompt(player, slot)
	end)
	task.spawn(function()
		while true do
			task.wait(SALE_EVERY)
			local ok, err = pcall(sellRound)
			if not ok then
				warn("[ShowcaseService] " .. tostring(err))
			end
		end
	end)
end

ShowcaseService._sellRound = sellRound
ShowcaseService._prompt = onPrompt

return ShowcaseService
