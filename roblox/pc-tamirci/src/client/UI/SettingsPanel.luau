-- SettingsPanel (O, or the gear on the left, or Phone > Settings): audio, graphics, gameplay and
-- a list of the controls. Every change is applied the moment it is made (Prefs → Display) and
-- saved with the player.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local Prefs = require(UI.Parent.Prefs)

local SettingsPanel = {}

local win = nil
local lastTab = "audio"
local actions: { [string]: () -> () } = {}

local TABS = { "audio", "graphics", "game", "keys" }

-- connections made by the current page (slider drags, the "custom" tag), dropped with the page
local conns: { any } = {}
local function track(c: any)
	table.insert(conns, c)
end
local function dropConnections()
	for _, c in conns do
		c:Disconnect()
	end
	table.clear(conns)
end

----------------------------------------------------------------------------------------------------
-- Building blocks
----------------------------------------------------------------------------------------------------
local order = 0
local function nextOrder(): number
	order += 1
	return order
end

local function card(list: Instance, height: number): Frame
	local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, height), BackgroundColor3 = Theme.card, LayoutOrder = nextOrder() })
	return f
end

local function heading(list: Instance, text: string)
	Kit.label(list, text, { Size = UDim2.new(1, 0, 0, 26), FontFace = Theme.heavy, TextSize = 18, TextColor3 = Theme.accent, LayoutOrder = nextOrder() })
end

local function titleOf(f: Frame, title: string, sub: string?)
	Kit.label(f, title, { Name = "Title", Size = UDim2.new(1, -150, 0, 22), Position = UDim2.fromOffset(14, 8), FontFace = Theme.bold, TextSize = 16, TextWrapped = false })
	if sub then
		Kit.label(f, sub, { Name = "Sub", Size = UDim2.new(1, -150, 0, 18), Position = UDim2.fromOffset(14, 30), TextSize = 13, TextColor3 = Theme.dim, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	end
end

-- An ON/OFF switch at the right of a card.
local function switch(parent: Instance, key: string): TextButton
	local b
	local function paint()
		local on = Prefs.get(key) == true
		b.Text = if on then S.t("set_on") else S.t("set_off")
		Kit.setColor(b, if on then Theme.good else Theme.line)
	end
	b = Kit.button(parent, "", function()
		Prefs.set(key, not Prefs.get(key))
		paint()
	end, { Name = "Switch_" .. key, Size = UDim2.fromOffset(84, 32), Position = UDim2.new(1, -98, 0, 10), TextSize = 14 })
	paint()
	return b
end

-- A draggable slider along the bottom of a card. fmt turns the value into the readout text.
local function slider(parent: Instance, key: string, lo: number, hi: number, fmt: (number) -> string, y: number?): Frame
	local bar = Kit.frame(parent, { Name = "Slider_" .. key, BackgroundColor3 = Theme.bg, Size = UDim2.new(1, -118, 0, 10), Position = UDim2.new(0, 14, 0, y or 52) })
	Kit.corner(bar, UDim.new(0.5, 0))
	local fill = Kit.frame(bar, { BackgroundColor3 = Theme.accent, Size = UDim2.fromScale(0, 1) })
	Kit.corner(fill, UDim.new(0.5, 0))
	local knob = Kit.frame(bar, { BackgroundColor3 = Color3.new(1, 1, 1), Size = UDim2.fromOffset(20, 20), AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0, 0.5), ZIndex = 3 })
	Kit.corner(knob, UDim.new(0.5, 0))
	local readout = Kit.label(parent, "", { Name = "Readout", Size = UDim2.fromOffset(80, 20), Position = UDim2.new(1, -94, 0, (y or 52) - 5), TextXAlignment = Enum.TextXAlignment.Right, TextSize = 15, FontFace = Theme.bold })
	-- a taller invisible strip makes the slider easy to grab
	local hit = Kit.frame(parent, { Name = "Hit", BackgroundTransparency = 1, Size = UDim2.new(1, -98, 0, 30), Position = UDim2.new(0, 4, 0, (y or 52) - 10), ZIndex = 4, Active = true })

	local function frac(): number
		local v = Prefs.get(key)
		return math.clamp((v - lo) / (hi - lo), 0, 1)
	end
	local function paint()
		local f = frac()
		fill.Size = UDim2.fromScale(f, 1)
		knob.Position = UDim2.fromScale(f, 0.5)
		readout.Text = fmt(Prefs.get(key))
	end
	local function setFromX(x: number)
		local w, left = bar.AbsoluteSize.X, bar.AbsolutePosition.X
		if w ~= w or w < 1 then
			w = 1 -- (not laid out yet)
		end
		if left ~= left then
			left = 0
		end
		local f = math.clamp((x - left) / w, 0, 1)
		Prefs.set(key, lo + (hi - lo) * f)
		paint()
	end
	local dragging = false
	hit.InputBegan:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			dragging = true
			setFromX(input.Position.X)
		end
	end)
	track(UserInputService.InputChanged:Connect(function(input)
		if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
			setFromX(input.Position.X)
		end
	end))
	track(UserInputService.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if dragging and (t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch) then
			dragging = false
		end
	end))
	paint()
	return bar
end

local function percent(v: number): string
	return string.format("%d%%", math.floor(v * 100 + 0.5))
end

-- Segmented choice ("Low | Medium | High") along the bottom of a card.
local function choice(parent: Instance, key: string, options: { { string } }, y: number?, onPick: ((string) -> ())?)
	local row = Kit.frame(parent, { Name = "Choice_" .. key, BackgroundTransparency = 1, Size = UDim2.new(1, -28, 0, 34), Position = UDim2.fromOffset(14, y or 52) })
	Kit.listLayout(row, 6, true)
	local buttons = {}
	local function paint()
		for value, b in buttons do
			local on = Prefs.get(key) == value
			Kit.setColor(b, if on then Theme.accent else Theme.bg)
			b.TextColor3 = if on then Color3.new(1, 1, 1) else Theme.dim
		end
	end
	for i, o in options do
		local b = Kit.button(row, o[2], function()
			if onPick then
				onPick(o[1])
			else
				Prefs.set(key, o[1])
			end
			if row.Parent then -- (a preset rebuilds the whole page)
				paint()
			end
		end, { Name = "Opt_" .. o[1], Size = UDim2.new(1 / #options, -6 * (#options - 1) / #options, 1, 0), LayoutOrder = i, TextSize = 14 })
		buttons[o[1]] = b
	end
	paint()
	return paint
end

local function toggleCard(list: Instance, key: string, title: string, sub: string?)
	local f = card(list, 56)
	titleOf(f, title, sub)
	switch(f, key)
	return f
end

local function sliderCard(list: Instance, key: string, title: string, sub: string?, lo: number, hi: number, fmt: (number) -> string, switchKey: string?)
	local f = card(list, 76)
	titleOf(f, title, sub)
	if switchKey then
		switch(f, switchKey)
	end
	slider(f, key, lo, hi, fmt, 58)
	return f
end

local function choiceCard(list: Instance, key: string, title: string, sub: string?, options: { { string } }, onPick: ((string) -> ())?)
	local f = card(list, 94)
	titleOf(f, title, sub)
	local paint = choice(f, key, options, 52, onPick)
	return f, paint
end

----------------------------------------------------------------------------------------------------
-- Tabs
----------------------------------------------------------------------------------------------------
local function audioTab(list: Instance)
	sliderCard(list, "master", S.t("set_master"), S.t("set_master_sub"), 0, 1, percent)
	sliderCard(list, "music", S.t("set_music"), S.t("set_music_sub"), 0, 1, percent, "musicOn")
	sliderCard(list, "sfx", S.t("set_sfx"), S.t("set_sfx_sub"), 0, 1, percent, "sfxOn")
	sliderCard(list, "ambience", S.t("set_ambience"), S.t("set_ambience_sub"), 0, 1, percent, "ambienceOn")
end

local function graphicsTab(list: Instance, refresh: () -> ())
	local qcard = choiceCard(list, "quality", S.t("set_quality"), S.t("set_quality_sub"), {
		{ "low", S.t("set_q_low") },
		{ "medium", S.t("set_q_medium") },
		{ "high", S.t("set_q_high") },
		{ "ultra", S.t("set_q_ultra") },
	}, function(q)
		Prefs.preset(q)
		refresh()
	end)
	-- "custom" shows when a switch no longer matches the preset
	local custom = Kit.pill(qcard, S.t("set_q_custom"), Theme.accent2, { Name = "Custom", Position = UDim2.new(1, -110, 0, 10), Size = UDim2.fromOffset(96, 24), Visible = not Prefs.matchesPreset() })
	local function sync()
		custom.Visible = not Prefs.matchesPreset()
	end
	track(Prefs.changed:Connect(sync))

	heading(list, "✨ " .. S.t("set_effects"))
	toggleCard(list, "shadows", S.t("set_shadows"), S.t("set_shadows_sub"))
	toggleCard(list, "bloom", S.t("set_bloom"), S.t("set_bloom_sub"))
	toggleCard(list, "sunrays", S.t("set_sunrays"), S.t("set_sunrays_sub"))
	toggleCard(list, "dof", S.t("set_dof"), S.t("set_dof_sub"))
	toggleCard(list, "clouds", S.t("set_clouds"), S.t("set_clouds_sub"))
	sliderCard(list, "brightness", S.t("set_brightness"), nil, -1, 1, function(v)
		return string.format("%+d%%", math.floor(v * 100 + (if v >= 0 then 0.5 else -0.5)))
	end)
	sliderCard(list, "fov", S.t("set_fov"), nil, 55, 100, function(v)
		return string.format("%d°", math.floor(v + 0.5))
	end)
	sliderCard(list, "uiscale", S.t("set_uiscale"), nil, 0.7, 1.4, percent)
	choiceCard(list, "traffic", S.t("set_traffic"), S.t("set_traffic_sub"), {
		{ "off", S.t("set_t_off") },
		{ "low", S.t("set_t_low") },
		{ "normal", S.t("set_t_normal") },
		{ "high", S.t("set_t_high") },
	})
	toggleCard(list, "names", S.t("set_names"), S.t("set_names_sub"))
	toggleCard(list, "shake", S.t("set_shake"), S.t("set_shake_sub"))
end

local function gameTab(list: Instance)
	choiceCard(list, "help", S.t("set_help"), S.t("set_help_sub"), {
		{ "guided", S.t("set_h_guided") },
		{ "hints", S.t("set_h_hints") },
		{ "off", S.t("set_h_off") },
	})
	choiceCard(list, "difficulty", S.t("set_difficulty"), S.t("set_difficulty_sub"), {
		{ "relaxed", S.t("set_d_relaxed") },
		{ "normal", S.t("set_d_normal") },
		{ "hard", S.t("set_d_hard") },
	})
	local f = card(list, 94)
	titleOf(f, S.t("set_language"), S.t("set_language_sub"))
	local row = Kit.frame(f, { Name = "Choice_lang", BackgroundTransparency = 1, Size = UDim2.new(1, -28, 0, 34), Position = UDim2.fromOffset(14, 52) })
	Kit.listLayout(row, 6, true)
	for i, l in { { "en", "English" }, { "tr", "Türkçe" } } do
		local on = S.lang() == l[1]
		local b = Kit.button(row, l[2], function()
			if S.lang() == l[1] then
				return
			end
			S.setLang(l[1])
			Net.request("settings.set", { lang = l[1] })
			if actions.relabel then
				actions.relabel()
			end
			SettingsPanel.open("game")
		end, { Name = "Lang_" .. l[1], Size = UDim2.new(0.5, -3, 1, 0), LayoutOrder = i, TextSize = 14 })
		Kit.setColor(b, if on then Theme.accent else Theme.bg)
		b.TextColor3 = if on then Color3.new(1, 1, 1) else Theme.dim
	end
	local reset = Kit.button(list, S.t("set_reset"), function()
		Prefs.setMany(Prefs.DEFAULTS)
		App.report({ ok = true }, S.t("set_reset_done"))
		SettingsPanel.open("game")
	end, { Name = "Reset", Size = UDim2.new(1, 0, 0, 38), LayoutOrder = nextOrder() }, "ghost")
	reset.TextColor3 = Theme.dim
end

local function keysTab(list: Instance)
	local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = nextOrder() })
	Kit.padding(f, 14)
	Kit.label(f, S.t("set_keys"), { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 16, LineHeight = 1.3 })
end

local BUILDERS = {
	audio = function(list)
		audioTab(list)
	end,
	graphics = function(list, refresh)
		graphicsTab(list, refresh)
	end,
	game = function(list)
		gameTab(list)
	end,
	keys = function(list)
		keysTab(list)
	end,
}

----------------------------------------------------------------------------------------------------
function SettingsPanel.open(tab: string?)
	local w = Kit.window(App.screen :: ScreenGui, "⚙️ " .. S.t("set_title"), Vector2.new(660, 580), dropConnections)
	win = w
	w.root.Name = "SettingsWindow"
	local c = w.content
	local pane = Kit.frame(c, { Name = "Pane", BackgroundTransparency = 1, Size = UDim2.new(1, -176, 1, 0), Position = UDim2.fromOffset(176, 0) })
	local list
	local current = tab or lastTab
	local function show(id: string)
		current = id
		lastTab = id
		if list then
			list:Destroy()
		end
		dropConnections()
		order = 0
		list = Kit.list(pane, nil, 8)
		list.Name = "Page_" .. id
		BUILDERS[id](list, function()
			show(id)
		end)
	end
	local items = {}
	for _, id in TABS do
		table.insert(items, { id = id, text = S.t("set_tab_" .. id) })
	end
	local side = Kit.sidebar(c, items, show, { Size = UDim2.new(0, 164, 1, 0) })
	w.sidebar = side
	side.select(current)
	return w
end

function SettingsPanel.toggle()
	if win and win.isOpen() then
		win.close()
	else
		SettingsPanel.open()
	end
end

function SettingsPanel.isOpen(): boolean
	return win ~= nil and win.isOpen()
end

-- actions: relabel (rebuild text after a language change)
function SettingsPanel.init(a: { [string]: () -> () })
	actions = a
end

return SettingsPanel
