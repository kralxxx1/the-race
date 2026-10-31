-- Tutorial: the guided start. A card at the bottom of the screen says what to do next and the
-- Guide arrow shows where: open the shop (cut the ribbon), talk to the first customer, take the
-- device to the bench, diagnose and fix it, get paid, find the parts depot, then the phone and
-- the map. Progress is saved (settings.set { tutorial = n }); DONE or more means finished.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local CityLayout = require(Shared.World.CityLayout)

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local App = require(Client.UI.App)
local Hud = require(Client.UI.Hud)
local Stores = require(Client.UI.Stores)
local Phone = require(Client.UI.Phone)
local S = require(Client.Strings)
local State = require(Client.State)
local BenchController = require(script.Parent.BenchController)
local MapController = require(script.Parent.MapController)
local Guide = require(script.Parent.Guide)

local Tutorial = {}

-- the steps in order (their number is what's saved)
local STEPS = { "open", "talk", "bench", "diagnose", "finish", "parts", "phone", "map" }
local DONE = #STEPS + 1
Tutorial.DONE = DONE
Tutorial.STEPS = STEPS

local player = Players.LocalPlayer
local step = DONE
local stepStarted = os.clock()
local card: Frame
local title: TextLabel
local text: TextLabel

local skipButton: TextButton? = nil

local function name(): string?
	return STEPS[step]
end

local function show()
	Guide.clear()
	if step >= DONE then
		card.Visible = false
		return
	end
	card.Visible = true
	title.Text = S.t("tut_step", { n = step, total = #STEPS })
	text.Text = S.t("tut_" .. STEPS[step])
	-- the step's own target is set by the watcher loop (things appear as the game goes on)
	if STEPS[step] == "parts" then
		local poi = CityLayout.get().poiById.megastore
		if poi then
			MapController.navigate(poi.door, S.pick(poi.def.name))
		end
	end
end

local function advance(to: number)
	if to <= step or step >= DONE then
		return
	end
	step = math.min(to, DONE)
	stepStarted = os.clock()
	Net.request("settings.set", { tutorial = step })
	show()
end
Tutorial.advance = advance

-- The language changed: the card says it again in the new one.
function Tutorial.relabel()
	if skipButton then
		skipButton.Text = S.t("tut_skip") .. " ×"
	end
	if card and card.Visible and step < DONE then
		title.Text = S.t("tut_step", { n = step, total = #STEPS })
		text.Text = S.t("tut_" .. STEPS[step])
	end
end

function Tutorial.step(): number
	return step
end

-- My customer nearest the counter, for the "talk" step.
local function myCustomer(): Model?
	local register = Guide.shopPoint("Register")
	local best, bestD = nil, math.huge
	for _, m in CollectionService:GetTagged("Customer") do
		if m:GetAttribute("Shop") == player.UserId and m.Parent and m:IsA("Model") then
			local d = if register then (m:GetPivot().Position - register.Position).Magnitude else 0
			if d < bestD then
				best, bestD = m, d
			end
		end
	end
	return best
end

local function myBench(): Instance?
	local shop = Guide.myShop()
	if not shop then
		return nil
	end
	for _, d in shop:GetChildren() do
		if d:IsA("Model") and d:GetAttribute("Bench") == 1 then
			return d
		end
	end
	return nil
end

local function myRibbon(): BasePart?
	for _, r in CollectionService:GetTagged("OpeningRibbon") do
		if r:GetAttribute("Owner") == player.UserId and r.Parent then
			return r :: BasePart
		end
	end
	return nil
end

-- Keeps the guide arrow on the current step's target and moves on when a step is done by
-- something that has no event of its own.
local function watch()
	local s = name()
	if not s then
		card.Visible = false
		return
	end
	-- at the bench the Coach card does the talking, and a window (phone, shop...) covers the screen:
	-- this card waits out of the way
	card.Visible = not BenchController.active() and Kit.currentWindow() == nil
	local elapsed = os.clock() - stepStarted
	if s == "open" then
		if State.data and State.data.opened then
			advance(2)
			return
		end
		Guide.point(myRibbon() or Guide.shopPoint("Door"), 5)
	elseif s == "talk" then
		local c = myCustomer()
		Guide.point(if c then c:FindFirstChild("Head") or c else Guide.shopPoint("Register"), 3.5)
	elseif s == "bench" then
		Guide.point(myBench(), 6)
	elseif s == "diagnose" or s == "finish" then
		Guide.clear()
		-- (the Coach guides the repair itself; a step nobody finishes does not hang around)
		if elapsed > 150 and not BenchController.active() then
			advance(step + 1)
		end
	elseif s == "parts" then
		local poi = CityLayout.get().poiById.megastore
		if poi then
			Guide.point(poi.door + Vector3.new(0, 2, 0), 10)
			local char = player.Character
			local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if root and (root.Position - poi.door).Magnitude < 30 then
				advance(step + 1)
				return
			end
		end
		local opened = Stores.lastOpened
		if (opened and opened.at > stepStarted and opened.service == "parts") or elapsed > 240 then
			advance(step + 1)
		end
	elseif s == "phone" then
		Guide.pointUi(Hud.buttons.phone)
		if (Phone.lastOpened and Phone.lastOpened > stepStarted) or elapsed > 60 then
			advance(step + 1)
		end
	elseif s == "map" then
		Guide.pointUi(Hud.buttons.map)
		if MapController.isOpen() or elapsed > 45 then
			advance(DONE)
		end
	end
end

function Tutorial.init()
	-- lower middle: clear of the toasts (top), the speedometer and the bench hint (bottom)
	card = Kit.panel(App.screen, { Name = "Tutorial", Size = UDim2.fromOffset(580, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(0.5, 0, 1, -190), AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 0.06, Visible = false })
	Kit.outline(card, Theme.accent2, 2, 0)
	Hud.register(card)
	Kit.padding(card, 12)
	title = Kit.label(card, "", { Size = UDim2.new(1, -84, 0, 18), TextSize = 13, FontFace = Theme.bold, TextColor3 = Theme.accent2 })
	text = Kit.label(card, "", { Size = UDim2.new(1, -84, 0, 0), Position = UDim2.fromOffset(0, 22), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 17, FontFace = Theme.bold })
	skipButton = Kit.button(card, S.t("tut_skip") .. " ×", function()
		advance(DONE)
		MapController.clearRoute()
	end, { Size = UDim2.fromOffset(72, 28), Position = UDim2.new(1, -72, 0, 0), TextSize = 13 }, "ghost")

	step = State.data and State.data.tutorial or 1
	if step < 1 then
		step = 1
	end
	stepStarted = os.clock()
	show()

	Net.on("opened", function()
		advance(2)
	end)
	-- talk → bench: a job was taken; bench → diagnose: a job is on a bench
	State.jobsChanged:Connect(function(jobs)
		for _, j in jobs do
			if j.status == "bench" then
				advance(4)
				return
			end
		end
		if #jobs > 0 then
			advance(3)
		end
	end)
	-- diagnose → finish: did something at the bench
	BenchController.acted:Connect(function()
		advance(5)
	end)
	-- finish → parts: the first customer paid
	Net.on("paid", function()
		advance(6)
	end)
	task.spawn(function()
		while card.Parent do
			watch()
			task.wait(0.25)
		end
	end)
end

return Tutorial
