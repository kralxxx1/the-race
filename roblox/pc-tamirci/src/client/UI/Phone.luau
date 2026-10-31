-- Phone (P): apps for everything you can do from anywhere — your shop, team, garage, jobs,
-- inventory, the map, the daily reward, stats, reviews, settings and help.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local ShopPanel = require(UI.ShopPanel)
local StaffPanel = require(UI.StaffPanel)
local Garage = require(UI.Garage)
local JobsPanel = require(UI.JobsPanel)
local Inventory = require(UI.Inventory)
local QuestsPanel = require(UI.QuestsPanel)
local BillsPanel = require(UI.BillsPanel)
local Stores = require(UI.Stores)
local FactoryPanel = require(UI.FactoryPanel)
local LeadersPanel = require(UI.LeadersPanel)
local SettingsPanel = require(UI.SettingsPanel)
local MarketingPanel = require(UI.MarketingPanel)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)
local Market = require(Shared.Economy.Market)
local Workspace = game:GetService("Workspace")

local Phone = {}

local function workspaceDay(): number
	return Workspace:GetAttribute("Day") or 1
end

local win = nil
local actions: { [string]: () -> () } = {}

local function page(title: string, build: (Frame) -> ())
	local w = Kit.window(App.screen :: ScreenGui, "📱 " .. title, Vector2.new(460, 620))
	Kit.button(w.header, "←", function()
		Phone.open()
	end, { Size = UDim2.fromOffset(36, 36), Position = UDim2.new(1, -86, 0, 6), TextSize = 18 })
	local body = Kit.frame(w.content, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
	build(body)
	win = w
end

local function statsPage(body: Frame)
	local d = State.data
	if not d then
		return
	end
	local list = Kit.list(body)
	local st = d.stats
	local lines = {
		"⭐ " .. S.t("level") .. " " .. d.level .. "   •   ★ " .. math.floor(d.rep),
		"🔧 " .. S.t("stat_repairs", { n = st.repairs }),
		"💎 " .. S.t("stat_perfect", { n = st.perfect }),
		"❌ " .. S.t("stat_failed", { n = st.failed }),
		"👥 " .. S.t("stat_customers", { n = st.customers }),
		"💰 " .. S.t("stat_earned", { n = S.money(st.earned) }),
		"🚨 " .. S.t("stat_caught", { n = st.caught }),
	}
	for i, l in lines do
		local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 44), BackgroundColor3 = Theme.card, LayoutOrder = i })
		Kit.label(f, l, { Size = UDim2.new(1, -20, 1, 0), Position = UDim2.fromOffset(12, 0), TextSize = 17 })
	end
end

local function reviewsPage(body: Frame)
	local list = Kit.list(body, nil, 8)
	local reviews = State.data and State.data.reviews or {}
	for i, r in reviews do
		local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = i })
		Kit.padding(f, 10)
		Kit.listLayout(f, 2)
		Kit.label(f, "<b>" .. (r.w or "?") .. "</b>  " .. S.stars(r.s or 0), { TextColor3 = Theme.warn, LayoutOrder = 1 })
		Kit.label(f, r.t or "", { TextSize = 14, LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	if #reviews == 0 then
		Kit.label(list, S.t("reviews_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

local function helpPage(body: Frame)
	local list = Kit.list(body)
	Kit.label(list, S.t("help_text"), { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 16 })
end

local function claimDaily()
	local r = Net.request("daily.claim")
	if r.ok then
		Hud.toast(S.t("daily_claimed", { amount = S.money(r.reward), streak = r.streak }), "good", 6)
		Hud.banner("🎁 " .. S.money(r.reward))
	else
		App.report(r)
	end
end

-- The phone: a real-looking handset (bezel, notch, status bar, clock widget, app icons, dock and a
-- home bar). The apps open as their own windows; the phone closes behind them.
local ICON_COLORS = {
	{ Color3.fromRGB(255, 160, 60), Color3.fromRGB(240, 90, 60) },
	{ Color3.fromRGB(80, 200, 255), Color3.fromRGB(40, 110, 230) },
	{ Color3.fromRGB(120, 230, 140), Color3.fromRGB(30, 160, 90) },
	{ Color3.fromRGB(255, 120, 190), Color3.fromRGB(200, 50, 140) },
	{ Color3.fromRGB(190, 150, 255), Color3.fromRGB(100, 70, 220) },
	{ Color3.fromRGB(255, 220, 90), Color3.fromRGB(240, 160, 30) },
	{ Color3.fromRGB(110, 220, 220), Color3.fromRGB(30, 140, 160) },
	{ Color3.fromRGB(255, 130, 110), Color3.fromRGB(210, 60, 70) },
}

local function appIcon(parent: Instance, emoji: string, label: string, color: { Color3 }, onClick: () -> (), badge: number?, size: number?): TextButton
	local sz = size or 54
	local cell = Kit.button(parent, "", onClick, { Name = "App_" .. label, Size = UDim2.fromOffset(sz + 14, sz + 30), BackgroundTransparency = 1, AutoButtonColor = false })
	cell:SetAttribute("BaseColor", Color3.new(0, 0, 0))
	local tile = Kit.frame(cell, { Name = "Tile", Size = UDim2.fromOffset(sz, sz), Position = UDim2.fromOffset(7, 0), BackgroundColor3 = color[1], Active = false })
	Kit.corner(tile, UDim.new(0, math.floor(sz * 0.26)))
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(color[1], color[2])
	g.Parent = tile
	local shine = Kit.frame(tile, { Size = UDim2.new(1, 0, 0.5, 0), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 0.88, Active = false })
	Kit.corner(shine, UDim.new(0, math.floor(sz * 0.26)))
	Kit.label(tile, emoji, { Size = UDim2.fromScale(1, 1), TextSize = math.floor(sz * 0.55), TextXAlignment = Enum.TextXAlignment.Center, TextYAlignment = Enum.TextYAlignment.Center, TextWrapped = false })
	if label ~= "" then
		Kit.label(cell, label, { Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, sz + 3), TextSize = 11, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.new(1, 1, 1), TextStrokeTransparency = 0.7, TextWrapped = true })
	end
	if badge and badge > 0 then
		local dot = Kit.frame(cell, { Name = "Badge", Size = UDim2.fromOffset(22, 22), Position = UDim2.fromOffset(sz - 8, -6), BackgroundColor3 = Color3.fromRGB(236, 54, 60), ZIndex = 3, Active = false })
		Kit.corner(dot, UDim.new(0.5, 0))
		Kit.label(dot, tostring(math.min(badge, 9)), { Size = UDim2.fromScale(1, 1), TextSize = 13, FontFace = Theme.heavy, TextXAlignment = Enum.TextXAlignment.Center, TextWrapped = false, ZIndex = 4 })
	end
	return cell
end

function Phone.open()
	Phone.lastOpened = os.clock()
	local PW, PH = 340, 700
	local w = Kit.window(App.screen :: ScreenGui, "📱 " .. S.t("phone"), Vector2.new(PW, PH))
	win = w
	w.root.Name = "PhoneWindow"
	w.header.Visible = false
	-- the handset itself: a dark metal body with a rounded screen set into it
	w.root.BackgroundColor3 = Color3.fromRGB(14, 16, 20)
	for _, d in w.root:GetChildren() do
		if d:IsA("UICorner") then
			d.CornerRadius = UDim.new(0, 54)
		elseif d:IsA("UIStroke") then
			d.Color = Color3.fromRGB(88, 94, 106)
			d.Thickness = 3
			d.Transparency = 0
		end
	end
	for _, side in { { -4, 150, 4, 56 }, { -4, 230, 4, 56 }, { PW, 190, 4, 84 } } do
		local btn = Kit.frame(w.root, { Size = UDim2.fromOffset(side[3], side[4]), Position = UDim2.fromOffset(side[1], side[2]), BackgroundColor3 = Color3.fromRGB(70, 75, 86) })
		Kit.corner(btn, UDim.new(0, 2))
	end
	local c = w.content
	c.Position = UDim2.fromOffset(0, 0)
	c.Size = UDim2.fromScale(1, 1)
	local screen = Kit.frame(c, { Name = "Screen", Size = UDim2.new(1, -20, 1, -20), Position = UDim2.fromOffset(10, 10), BackgroundColor3 = Color3.fromRGB(30, 60, 120), ClipsDescendants = true })
	Kit.corner(screen, UDim.new(0, 44))
	local wall = Instance.new("UIGradient")
	wall.Rotation = 70
	wall.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(18, 38, 92)),
		ColorSequenceKeypoint.new(0.55, Color3.fromRGB(88, 56, 150)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(236, 112, 96)),
	})
	wall.Parent = screen
	-- status bar and the notch
	local t = Lighting.ClockTime
	local clockText = string.format("%02d:%02d", math.floor(t), math.floor((t % 1) * 60))
	Kit.label(screen, clockText, { Name = "StatusTime", Size = UDim2.fromOffset(70, 24), Position = UDim2.fromOffset(28, 14), TextSize = 14, FontFace = Theme.bold, TextWrapped = false })
	Kit.label(screen, "5G  📶  🔋", { Name = "StatusIcons", Size = UDim2.fromOffset(110, 24), Position = UDim2.new(1, -136, 0, 14), TextSize = 12, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right, TextWrapped = false })
	local notch = Kit.frame(screen, { Name = "Notch", Size = UDim2.fromOffset(96, 28), Position = UDim2.new(0.5, -48, 0, 10), BackgroundColor3 = Color3.fromRGB(8, 8, 10) })
	Kit.corner(notch, UDim.new(0.5, 0))
	-- clock widget
	Kit.label(screen, clockText, { Name = "BigClock", Size = UDim2.new(1, 0, 0, 62), Position = UDim2.fromOffset(0, 50), TextSize = 56, FontFace = Theme.heavy, TextXAlignment = Enum.TextXAlignment.Center, TextWrapped = false, TextColor3 = Color3.new(1, 1, 1) })
	local d = State.data
	local sub = S.t("phone_day", { d = workspaceDay() }) .. (if d then "  •  " .. S.money(d.money) else "")
	Kit.label(screen, sub, { Name = "DateLine", Size = UDim2.new(1, 0, 0, 20), Position = UDim2.fromOffset(0, 112), TextSize = 14, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.fromRGB(230, 232, 245) })

	local unpaid = if d and d.bills and d.bills.list then #d.bills.list else 0
	local dailyReady = d ~= nil and d.daily ~= nil and d.daily.day ~= Market.day()
	local apps = {
		{ "🏪", S.t("phone_shop"), function()
			ShopPanel.open()
		end, 0 },
		{ "🧑‍🔧", S.t("phone_staff"), StaffPanel.team, 0 },
		{ "🚗", S.t("phone_garage"), Garage.open, 0 },
		{ "📋", S.t("jobs"), JobsPanel.open, #(State.jobs or {}) },
		{ "🎒", S.t("inventory"), function()
			Inventory.open()
		end, 0 },
		{ "🗺️", S.t("map"), function()
			w.close()
			if actions.map then
				actions.map()
			end
		end, 0 },
		{ "🎁", S.t("phone_daily"), claimDaily, if dailyReady then 1 else 0 },
		{ "📜", S.t("phone_quests"), QuestsPanel.open, 0 },
		{ "🧾", S.t("phone_bills"), BillsPanel.open, unpaid },
		{ "📣", S.t("phone_marketing"), MarketingPanel.open, 0 },
		{ "🛵", S.t("phone_courier"), Stores.courier, 0 },
		{ "🏭", S.t("phone_factory"), FactoryPanel.open, 0 },
		{ "🏆", S.t("phone_leaders"), LeadersPanel.open, 0 },
		{ "📊", S.t("phone_stats"), function()
			page(S.t("phone_stats"), statsPage)
		end, 0 },
		{ "⭐", S.t("phone_reviews"), function()
			page(S.t("phone_reviews"), reviewsPage)
		end, 0 },
		{ "⚙️", S.t("phone_settings"), function()
			SettingsPanel.open()
		end, 0 },
		{ "❓", S.t("phone_help"), function()
			page(S.t("phone_help"), helpPage)
		end, 0 },
		{ "🏠", S.t("home"), function()
			w.close()
			if actions.home then
				actions.home()
			end
		end, 0 },
	}
	-- the grid of app icons, four to a row (a scroll when there are more than fit)
	local grid = Kit.grid(screen, UDim2.fromOffset(68, 84), { Name = "Apps", Size = UDim2.new(1, -16, 1, -250), Position = UDim2.fromOffset(8, 142), ScrollBarThickness = 0 })
	for i, a in apps do
		local cell = appIcon(grid, a[1], a[2], ICON_COLORS[(i - 1) % #ICON_COLORS + 1], a[3], a[4])
		cell.LayoutOrder = i
	end
	-- the dock (the four apps used most) and the home bar
	local dock = Kit.frame(screen, { Name = "Dock", Size = UDim2.new(1, -24, 0, 84), Position = UDim2.new(0, 12, 1, -112), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 0.82 })
	Kit.corner(dock, UDim.new(0, 30))
	Kit.listLayout(dock, 6, true, Enum.HorizontalAlignment.Center)
	local dockLayout = dock:FindFirstChildOfClass("UIListLayout")
	if dockLayout then
		dockLayout.VerticalAlignment = Enum.VerticalAlignment.Center
	end
	for i, a in { apps[1], apps[4], apps[6], apps[16] } do
		local cell = appIcon(dock, a[1], "", ICON_COLORS[(i * 2) % #ICON_COLORS + 1], a[3], a[4], 56)
		cell.Size = UDim2.fromOffset(70, 70)
		cell.LayoutOrder = i
		cell.Name = "Dock_" .. a[2]
	end
	local bar = Kit.frame(screen, { Name = "HomeBar", Size = UDim2.fromOffset(120, 5), Position = UDim2.new(0.5, -60, 1, -16), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 0.25 })
	Kit.corner(bar, UDim.new(0.5, 0))
	local close = Kit.button(w.root, "×", function()
		w.close()
	end, { Name = "Close", Size = UDim2.fromOffset(30, 30), Position = UDim2.new(1, -4, 0, -14), AnchorPoint = Vector2.new(0.5, 0), TextSize = 14, ZIndex = 10 })
	Kit.corner(close, UDim.new(0.5, 0))
end

function Phone.toggle()
	if win and win.isOpen() then
		win.close()
	else
		Phone.open()
	end
end

-- actions: map, home, relabel (rebuild text after a language change)
function Phone.init(a: { [string]: () -> () })
	actions = a
end

return Phone
