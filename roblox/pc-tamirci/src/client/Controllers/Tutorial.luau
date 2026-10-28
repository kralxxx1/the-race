-- Tutorial: five short steps for new players, shown in a card at the top of the screen.
-- Progress is saved (settings.set { tutorial = n }); 6 means done.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local App = require(Client.UI.App)
local Hud = require(Client.UI.Hud)
local S = require(Client.Strings)
local State = require(Client.State)
local BenchController = require(script.Parent.BenchController)

local Tutorial = {}

local DONE = 6
local step = DONE
local card: Frame
local text: TextLabel

local function show()
	if step >= DONE then
		card.Visible = false
		return
	end
	card.Visible = true
	text.Text = S.t("tut_" .. step)
end

local function advance(to: number)
	if to <= step or step >= DONE then
		return
	end
	step = math.min(to, DONE)
	Net.request("settings.set", { tutorial = step })
	show()
	if step == 5 then
		task.delay(14, function()
			advance(DONE)
		end)
	end
end

function Tutorial.init()
	card = Kit.panel(App.screen, { Name = "Tutorial", Size = UDim2.fromOffset(560, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(0.5, 0, 0, 72), AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 0.08, Visible = false })
	Kit.outline(card, Theme.accent2, 2, 0)
	Hud.register(card)
	Kit.padding(card, 12)
	text = Kit.label(card, "", { Size = UDim2.new(1, -70, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 17, FontFace = Theme.bold })
	Kit.button(card, S.t("tut_skip"), function()
		advance(DONE)
	end, { Size = UDim2.fromOffset(60, 28), Position = UDim2.new(1, -60, 0, 0), TextSize = 13 }, "ghost")

	step = State.data and State.data.tutorial or 1
	if step < 1 then
		step = 1
	end
	show()

	-- step 1 → 2: a job was taken; 2 → 3: a job is on a bench
	State.jobsChanged:Connect(function(jobs)
		for _, j in jobs do
			if j.status == "bench" then
				advance(3)
				return
			end
		end
		if #jobs > 0 then
			advance(2)
		end
	end)
	-- 3 → 4: did something at the bench
	BenchController.acted:Connect(function()
		advance(4)
	end)
	-- 4 → 5: the first customer paid
	Net.on("paid", function()
		advance(5)
	end)
end

return Tutorial
