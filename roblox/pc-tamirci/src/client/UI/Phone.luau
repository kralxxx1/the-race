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
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local Phone = {}

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

function Phone.open()
	Phone.lastOpened = os.clock()
	local w = Kit.window(App.screen :: ScreenGui, "📱 " .. S.t("phone"), Vector2.new(460, 620))
	win = w
	local c = w.content
	local t = Lighting.ClockTime
	Kit.label(c, string.format("🕒 %02d:%02d", math.floor(t), math.floor((t % 1) * 60)), { Size = UDim2.new(1, 0, 0, 24), TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Theme.dim })
	local grid = Kit.grid(c, UDim2.fromOffset(128, 112), { Size = UDim2.new(1, 0, 1, -30), Position = UDim2.fromOffset(0, 30) })
	local apps = {
		{ "🏪", S.t("phone_shop"), function()
			ShopPanel.open()
		end },
		{ "🧑‍🔧", S.t("phone_staff"), StaffPanel.team },
		{ "🚗", S.t("phone_garage"), Garage.open },
		{ "📋", S.t("jobs"), JobsPanel.open },
		{ "🎒", S.t("inventory"), function()
			Inventory.open()
		end },
		{ "🗺️", S.t("map"), function()
			w.close()
			if actions.map then
				actions.map()
			end
		end },
		{ "🎁", S.t("phone_daily"), claimDaily },
		{ "📜", S.t("phone_quests"), QuestsPanel.open },
		{ "🧾", S.t("phone_bills"), BillsPanel.open },
		{ "🛵", S.t("phone_courier"), Stores.courier },
		{ "🏭", S.t("phone_factory"), FactoryPanel.open },
		{ "🏆", S.t("phone_leaders"), LeadersPanel.open },
		{ "📊", S.t("phone_stats"), function()
			page(S.t("phone_stats"), statsPage)
		end },
		{ "⭐", S.t("phone_reviews"), function()
			page(S.t("phone_reviews"), reviewsPage)
		end },
		{ "⚙️", S.t("phone_settings"), function()
			SettingsPanel.open()
		end },
		{ "❓", S.t("phone_help"), function()
			page(S.t("phone_help"), helpPage)
		end },
		{ "🏠", S.t("home"), function()
			w.close()
			if actions.home then
				actions.home()
			end
		end },
	}
	for i, a in apps do
		local b = Kit.button(grid, "", a[3], { LayoutOrder = i, BackgroundColor3 = Theme.card })
		Kit.label(b, a[1], { Size = UDim2.new(1, 0, 0, 52), Position = UDim2.fromOffset(0, 10), TextSize = 40, TextXAlignment = Enum.TextXAlignment.Center })
		Kit.label(b, a[2], { Size = UDim2.new(1, -8, 0, 36), Position = UDim2.fromOffset(4, 66), TextSize = 14, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Center })
	end
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
