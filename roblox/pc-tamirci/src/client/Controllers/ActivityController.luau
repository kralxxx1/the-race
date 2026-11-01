-- ActivityController: what the player sees while doing something in the city (a progress card at the
-- bottom of the screen with the activity's name, a bar that fills and the seconds left), the toast
-- when it is done (what they got), and a strip of the buffs that are on, each with its icon and the
-- time left. The server (ActivityService) decides everything; this only draws it.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Activities = require(Shared.Data.Activities)

local UI = script.Parent.Parent.UI
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local S = require(script.Parent.Parent.Strings)

local ActivityController = {}

local card: Frame?
local bar: Frame?
local title: TextLabel?
local timeLabel: TextLabel?
local strip: Frame?
local current: { t0: number, seconds: number }? = nil
local buffs: { { id: string, left: number, at: number } } = {}

local function fmt(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

local function drawStrip()
	if not strip then
		return
	end
	Kit.clear(strip)
	local now = os.clock()
	for _, b in buffs do
		local def = Activities.buffs[b.id]
		local left = b.left - (now - b.at)
		if def and left > 0 then
			local chip = Kit.panel(strip, { Size = UDim2.fromOffset(150, 28), BackgroundColor3 = Theme.panel, BackgroundTransparency = 0.15 })
			chip.Name = "Buff_" .. b.id
			Kit.outline(chip, Theme.accent, 1.5, 0.35)
			Kit.label(chip, def.icon .. " " .. S.pick(def.name), { Size = UDim2.new(1, -52, 1, 0), Position = UDim2.fromOffset(6, 0), TextSize = 13, FontFace = Theme.bold, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
			Kit.label(chip, fmt(left), { Size = UDim2.fromOffset(44, 28), Position = UDim2.new(1, -46, 0, 0), TextSize = 13, TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Right })
		end
	end
end

function ActivityController.init(screen: ScreenGui)
	card = Kit.panel(screen, { Size = UDim2.fromOffset(340, 64), AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -96), BackgroundColor3 = Theme.panel, BackgroundTransparency = 0.05, Visible = false })
	Kit.outline(card :: Frame, Theme.accent, 2, 0.1)
	title = Kit.label(card :: Frame, "", { Size = UDim2.new(1, -16, 0, 24), Position = UDim2.fromOffset(8, 6), TextSize = 17, FontFace = Theme.bold })
	timeLabel = Kit.label(card :: Frame, "", { Size = UDim2.fromOffset(60, 24), Position = UDim2.new(1, -68, 0, 6), TextSize = 15, TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Right })
	local back = Kit.panel(card :: Frame, { Size = UDim2.new(1, -16, 0, 12), Position = UDim2.fromOffset(8, 40), BackgroundColor3 = Theme.card })
	bar = Kit.panel(back, { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Theme.good })
	Hud.register(card :: Frame)
	strip = Kit.frame(screen, { BackgroundTransparency = 1, Size = UDim2.fromOffset(150, 200), Position = UDim2.fromOffset(12, 150) })
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 4)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = strip
	Hud.register(strip :: Frame)

	Net.on("activity.start", function(d)
		if type(d) ~= "table" or not card then
			return
		end
		current = { t0 = os.clock(), seconds = tonumber(d.seconds) or 5 }
		;(title :: TextLabel).Text = tostring(d.icon or "") .. "  " .. S.pick(d.name)
		;(card :: Frame).Visible = true
		;(bar :: Frame).Size = UDim2.fromScale(0, 1)
	end)
	Net.on("activity.done", function(d)
		if type(d) ~= "table" then
			return
		end
		current = nil
		if card then
			card.Visible = false
		end
		local text = tostring(d.icon or "") .. " " .. S.pick(d.name)
		if d.buffName then
			text ..= "  →  " .. tostring(d.buffIcon or "") .. " " .. S.pick(d.buffName) .. " (" .. tostring(d.minutes or 0) .. " min)"
		end
		if (d.xp or 0) > 0 then
			text ..= "  +" .. tostring(d.xp) .. " XP"
		end
		Hud.toast(text, "good", 5)
	end)
	Net.on("buffs", function(d)
		if type(d) ~= "table" then
			return
		end
		buffs = {}
		local now = os.clock()
		for _, b in d.list or {} do
			table.insert(buffs, { id = b.id, left = b.left, at = now })
		end
		drawStrip()
	end)
	local last = 0
	RunService.RenderStepped:Connect(function()
		local now = os.clock()
		if current and bar and timeLabel then
			local f = math.clamp((now - current.t0) / current.seconds, 0, 1)
			bar.Size = UDim2.fromScale(f, 1)
			timeLabel.Text = fmt(math.ceil(current.seconds * (1 - f)))
			if f >= 1 and card then
				card.Visible = false
			end
		end
		if now - last > 1 and #buffs > 0 then
			last = now
			drawStrip()
		end
	end)
end

-- (for the tests) is the progress card showing, and which buffs are drawn
function ActivityController._state()
	return { showing = card ~= nil and card.Visible, buffs = buffs }
end

return ActivityController
