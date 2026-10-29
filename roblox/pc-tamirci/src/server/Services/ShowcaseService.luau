-- ShowcaseService: the PC showcase in the shop window (a shop item from level 4). Put a finished
-- build of your own on a stand; walk-in buyers pay more for it than the second-hand dealer.
-- The prompt on a stand puts your best finished project on it, or takes the PC back.

local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Employees = require(Shared.Data.Employees)
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
	showModel(player, slot, pick)
	RepairService.pushJobs(player)
	Net.push(player, "toast", { key = "showcase_put", vars = { name = pick.name, price = math.floor(RepairService.resale(pick) * PRICE_FACTOR) } })
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
			prompt.ActionText = "Vitrin"
			prompt.ObjectText = "PC Vitrini"
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

local function staffOf(player: Player)
	local p = DataService.get(player)
	return p and p.staff
end

local function sellRound()
	for player, list in models do
		for slot in table.clone(list) do
			local job = jobOn(player, slot)
			if not job then
				clearModel(player, slot)
			elseif rng:NextNumber() < SALE_CHANCE * (1 + Employees.effect(staffOf(player), "sales")) then
				local price = math.floor(RepairService.resale(job) * PRICE_FACTOR * (1 + Employees.effect(staffOf(player), "salesPrice")))
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
