-- Hud: money, level and XP, reputation, the clock, the quick buttons and toasts.

local Lighting = game:GetService("Lighting")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")
local UserInputService = game:GetService("UserInputService")

local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local S = require(script.Parent.Parent.Strings)
local State = require(script.Parent.Parent.State)

local Hud = {}
Hud.buttons = {} :: { [string]: TextButton }

-- Elements that hide together with the HUD (while working at a bench): the HUD's own panels
-- plus anything other modules register (minimap, GPS, tutorial...).
local hideable: { GuiObject } = {}

function Hud.register(obj: GuiObject)
	table.insert(hideable, obj)
end

local gui: ScreenGui
local toastHolder: Frame
local moneyLabel: TextLabel
local levelLabel: TextLabel
local xpBar
local repLabel: TextLabel
local clockLabel: TextLabel
local billsButton: TextButton
local shown = 0

local function fmtClock(t: number): string
	local h = math.floor(t)
	local m = math.floor((t - h) * 60)
	return string.format("%02d:%02d", h, m)
end

-- Short message in the top centre.
function Hud.toast(text: string, kind: string?, seconds: number?)
	if not toastHolder then
		return
	end
	local color = if kind == "good" then Theme.good elseif kind == "bad" then Theme.bad elseif kind == "warn" then Theme.accent2 else Theme.accent
	shown += 1
	local f = Kit.panel(toastHolder, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.panel, BackgroundTransparency = 0.05, LayoutOrder = -shown })
	Kit.outline(f, color, 2, 0.1)
	Kit.padding(f, 7)
	Kit.label(f, text, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 15, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Center })
	f.BackgroundTransparency = 1
	Kit.tween(f, { BackgroundTransparency = 0.05 }, 0.2)
	task.delay(seconds or 4.5, function()
		if f.Parent then
			for _, d in f:GetDescendants() do
				if d:IsA("TextLabel") then
					Kit.tween(d, { TextTransparency = 1 }, 0.4)
				elseif d:IsA("UIStroke") then
					Kit.tween(d, { Transparency = 1 }, 0.4)
				end
			end
			Kit.tween(f, { BackgroundTransparency = 1 }, 0.4)
			task.wait(0.45)
			f:Destroy()
		end
	end)
	-- keep at most three (the important cards are not toasts and stay)
	local items = {}
	for _, c in toastHolder:GetChildren() do
		if c:IsA("Frame") and c.Name ~= "Alert" then
			table.insert(items, c)
		end
	end
	if #items > 3 then
		table.sort(items, function(a, b)
			return a.LayoutOrder > b.LayoutOrder
		end)
		items[1]:Destroy()
	end
end

-- An important message (a new bill, the power going, a thief at the till): a bigger card than a
-- toast, with an icon, a title and the message, a thick coloured edge and a ping, and it stays on
-- screen longer. kind: "bad" (red), "warn" (amber), "info", "good".
local PINGS = { bad = "rbxasset://sounds/electronicpingshort.wav", warn = "rbxasset://sounds/electronicpingshort.wav" }
function Hud.alert(icon: string, title: string, text: string, kind: string?, seconds: number?)
	if not toastHolder then
		return
	end
	local color = if kind == "good" then Theme.good elseif kind == "bad" then Theme.bad elseif kind == "warn" then Theme.accent2 else Theme.accent
	shown += 1
	local f = Kit.panel(toastHolder, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.panel, BackgroundTransparency = 0.02, LayoutOrder = -shown })
	f.Name = "Alert"
	Kit.outline(f, color, 3, 0)
	Kit.padding(f, 10)
	local row = Kit.frame(f, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1 })
	Kit.listLayout(row, 10, true)
	local badge = Kit.frame(row, { Size = UDim2.fromOffset(44, 44), BackgroundColor3 = color, LayoutOrder = 1 })
	Kit.corner(badge, UDim.new(1, 0))
	Kit.label(badge, icon, { Size = UDim2.fromScale(1, 1), TextSize = 26, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.new(1, 1, 1) })
	local body = Kit.frame(row, { Size = UDim2.new(1, -54, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 2 })
	Kit.listLayout(body, 2)
	Kit.label(body, title, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 18, FontFace = Theme.heavy, TextColor3 = color, LayoutOrder = 1 })
	Kit.label(body, text, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 15, FontFace = Theme.bold, LayoutOrder = 2 })
	-- it slides in with a ping
	f.BackgroundTransparency = 1
	Kit.tween(f, { BackgroundTransparency = 0.02 }, 0.25)
	local ping = PINGS[kind or ""]
	if ping then
		local snd = Instance.new("Sound")
		snd.SoundId = ping
		snd.Volume = 0.6
		snd.Parent = SoundService
		SoundService:PlayLocalSound(snd)
		task.delay(3, function()
			snd:Destroy()
		end)
	end
	task.delay(seconds or 9, function()
		if f.Parent then
			Kit.tween(f, { BackgroundTransparency = 1 }, 0.4)
			for _, d in f:GetDescendants() do
				if d:IsA("TextLabel") then
					Kit.tween(d, { TextTransparency = 1 }, 0.4)
				elseif d:IsA("UIStroke") then
					Kit.tween(d, { Transparency = 1 }, 0.4)
				elseif d:IsA("Frame") and d.BackgroundTransparency < 1 then
					Kit.tween(d, { BackgroundTransparency = 1 }, 0.4)
				end
			end
			task.wait(0.45)
			f:Destroy()
		end
	end)
	-- keep at most four of them
	local items = {}
	for _, c in toastHolder:GetChildren() do
		if c:IsA("Frame") and c.Name == "Alert" then
			table.insert(items, c)
		end
	end
	if #items > 4 then
		table.sort(items, function(a, b)
			return a.LayoutOrder > b.LayoutOrder
		end)
		items[1]:Destroy()
	end
end

-- "+$120" floating up from the money counter.
local function moneyPop(delta: number)
	if not moneyLabel or delta == 0 then
		return
	end
	local pop = Kit.label(moneyLabel.Parent, (if delta > 0 then "+" else "") .. S.money(delta), {
		Size = UDim2.fromOffset(160, 24),
		Position = UDim2.new(0, 40, 0, 40),
		TextColor3 = if delta > 0 then Theme.money else Theme.bad,
		FontFace = Theme.heavy,
		TextSize = 20,
		TextStrokeTransparency = 0.4,
		ZIndex = 5,
	})
	Kit.tween(pop, { Position = UDim2.new(0, 40, 0, 74), TextTransparency = 1, TextStrokeTransparency = 1 }, 1.4)
	task.delay(1.5, function()
		pop:Destroy()
	end)
end

local function refresh(d, prev)
	if not d then
		return
	end
	moneyLabel.Text = "💰 " .. S.money(d.money)
	levelLabel.Text = "⭐ " .. S.t("level") .. " " .. d.level
	xpBar:set(d.xp / math.max(1, d.xpNext or 100), prev ~= nil)
	local stars = math.floor(d.rep / 20 + 0.5)
	repLabel.Text = S.stars(stars) .. "  " .. math.floor(d.rep)
	-- unpaid bills (and a power cut) under the clock
	local b = d.bills
	local n = b and b.list and #b.list or 0
	billsButton.Visible = n > 0 or (b ~= nil and b.cut == true)
	if b and b.cut then
		billsButton.Text = S.t("bills_powercut")
		Kit.setColor(billsButton, Theme.bad)
	else
		billsButton.Text = "🧾 " .. S.t("hud_bills", { n = n })
		Kit.setColor(billsButton, Theme.card)
	end
	if prev then
		moneyPop(d.money - prev.money)
	end
end

function Hud.init(screen: ScreenGui, actions: { [string]: () -> () })
	gui = screen
	-- top centre, in the free middle of Roblox's top bar: money | level and XP | reputation
	-- (the corners belong to Roblox's menu, chat and player list, and on phones to the
	-- thumbstick and jump button)
	local card = Kit.panel(gui, { Name = "Stats", Size = UDim2.fromOffset(470, 50), Position = UDim2.new(0.5, 0, 0, 5), AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 0.12 })
	Hud.register(card)
	moneyLabel = Kit.label(card, S.money(0), { Name = "Money", Size = UDim2.fromOffset(185, 50), Position = UDim2.fromOffset(14, 0), TextSize = 24, FontFace = Theme.heavy, TextColor3 = Theme.money, TextWrapped = false })
	levelLabel = Kit.label(card, "", { Size = UDim2.fromOffset(150, 20), Position = UDim2.fromOffset(204, 6), TextSize = 15, FontFace = Theme.bold, TextWrapped = false })
	xpBar = Kit.progress(card, { Position = UDim2.fromOffset(204, 31), Size = UDim2.fromOffset(150, 9) }, Theme.accent)
	repLabel = Kit.label(card, "", { Size = UDim2.fromOffset(104, 50), Position = UDim2.fromOffset(358, 0), TextSize = 14, TextColor3 = Theme.warn, TextXAlignment = Enum.TextXAlignment.Center, TextWrapped = false })

	-- top-right, in the top bar: clock and weather
	local clock = Kit.panel(gui, { Name = "Clock", Size = UDim2.fromOffset(176, 40), Position = UDim2.new(1, -192, 0, 9), BackgroundTransparency = 0.12 })
	Hud.register(clock)
	clockLabel = Kit.label(clock, "", { Size = UDim2.fromScale(1, 1), TextXAlignment = Enum.TextXAlignment.Center, TextSize = 18, FontFace = Theme.bold })
	billsButton = Kit.button(gui, "", actions.bills, { Name = "Bills", Size = UDim2.fromOffset(176, 30), Position = UDim2.new(1, -192, 0, 54), TextSize = 13, Visible = false })
	Hud.register(billsButton)
	task.spawn(function()
		while gui.Parent do
			local t = Lighting.ClockTime
			local icon = if Workspace:GetAttribute("Raining") then (if Workspace:GetAttribute("Storm") then "⛈️" else "🌧️") elseif t >= 19.5 or t < 6 then "🌙" else "☀️"
			clockLabel.Text = string.format("%s %s • %s", icon, fmtClock(t), S.t("day", { d = Workspace:GetAttribute("Day") or 1 }))
			task.wait(0.5)
		end
	end)

	-- left edge, above the minimap: quick buttons (also the only way in on touch screens)
	local bar = Kit.frame(gui, { Name = "Quick", BackgroundTransparency = 1, Size = UDim2.fromOffset(60, 6 * 64), Position = UDim2.fromOffset(14, 96) })
	Hud.register(bar)
	Kit.listLayout(bar, 8)
	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	local defs = {
		{ id = "home", icon = "🏠", key = "H" },
		{ id = "jobs", icon = "📋", key = "J" },
		{ id = "inventory", icon = "🎒", key = "B" },
		{ id = "phone", icon = "📱", key = "P" },
		{ id = "map", icon = "🗺️", key = "M" },
		{ id = "settings", icon = "⚙️", key = "O" },
	}
	for i, d in defs do
		local b = Kit.button(bar, d.icon, actions[d.id], { Size = UDim2.fromOffset(56, 56), TextSize = 26, LayoutOrder = i, BackgroundTransparency = 0.1 })
		b.Name = d.id
		if not touch then
			Kit.label(b, d.key, { Size = UDim2.fromOffset(18, 16), Position = UDim2.new(1, -20, 1, -18), TextSize = 12, TextColor3 = Theme.dim, FontFace = Theme.bold })
		end
		Hud.buttons[d.id] = b
	end

	-- toasts: top centre, under the stats bar
	-- (above windows and the map, so purchases and alarms are always seen)
	toastHolder = Kit.frame(gui, { Name = "Toasts", BackgroundTransparency = 1, Size = UDim2.fromOffset(500, 300), Position = UDim2.new(0.5, 0, 0, 62), AnchorPoint = Vector2.new(0.5, 0), ZIndex = 50 })
	Kit.listLayout(toastHolder, 6, false, Enum.HorizontalAlignment.Center)
	-- while a window is open the toasts drop to the bottom of the screen, clear of its header
	local layout = toastHolder:FindFirstChildOfClass("UIListLayout")
	Kit.windowChanged.Event:Connect(function(win)
		if win then
			toastHolder.AnchorPoint = Vector2.new(0.5, 1)
			toastHolder.Position = UDim2.new(0.5, 0, 1, -8)
			if layout then
				layout.VerticalAlignment = Enum.VerticalAlignment.Bottom
			end
		else
			toastHolder.AnchorPoint = Vector2.new(0.5, 0)
			toastHolder.Position = UDim2.new(0.5, 0, 0, 62)
			if layout then
				layout.VerticalAlignment = Enum.VerticalAlignment.Top
			end
		end
	end)

	State.changed:Connect(refresh)
	if State.data then
		refresh(State.data, nil)
	end
	State.levelUp:Connect(function(level)
		Hud.toast(S.t("level_up", { n = level }), "good", 5)
		Hud.banner("⭐ " .. S.t("level") .. " " .. level .. " ⭐")
	end)
end

-- Big centred banner (level ups, big payouts).
function Hud.banner(text: string)
	local l = Kit.label(gui, text, { Size = UDim2.fromOffset(700, 70), Position = UDim2.new(0.5, 0, 0.32, 0), AnchorPoint = Vector2.new(0.5, 0.5), TextXAlignment = Enum.TextXAlignment.Center, TextSize = 46, FontFace = Theme.heavy, TextColor3 = Theme.warn, TextStrokeTransparency = 0.3, ZIndex = 50 })
	local sc = Instance.new("UIScale")
	sc.Scale = 0.4
	sc.Parent = l
	Kit.tween(sc, { Scale = 1 }, 0.35, Enum.EasingStyle.Back)
	task.delay(2.4, function()
		Kit.tween(l, { TextTransparency = 1, TextStrokeTransparency = 1 }, 0.5)
		task.wait(0.6)
		l:Destroy()
	end)
end

local shown: { [GuiObject]: boolean } = {}

function Hud.setVisible(on: boolean)
	for _, obj in hideable do
		if obj.Parent then
			if on then
				-- restore what was showing (the GPS panel may have been hidden on purpose)
				if shown[obj] ~= nil then
					obj.Visible = shown[obj]
				end
			else
				shown[obj] = obj.Visible
				obj.Visible = false
			end
		end
	end
	if on then
		table.clear(shown)
	end
end

return Hud
