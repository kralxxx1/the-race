-- PC Tamircisi Simülatörü — client entry point: language, HUD, windows and controllers.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Tools = require(Shared.Data.Tools)
local Market = require(Shared.Economy.Market)

local Client = script.Parent
local S = require(Client.Strings)
local State = require(Client.State)
local Prefs = require(Client.Prefs)
local UI = Client.UI
local Kit = require(UI.Kit)
local Hud = require(UI.Hud)
local App = require(UI.App)
local CustomerDialog = require(UI.CustomerDialog)
local Stores = require(UI.Stores)
local StaffPanel = require(UI.StaffPanel)
local FactoryPanel = require(UI.FactoryPanel)
local Garage = require(UI.Garage)
local JobsPanel = require(UI.JobsPanel)
local Inventory = require(UI.Inventory)
local Phone = require(UI.Phone)
local SettingsPanel = require(UI.SettingsPanel)
local LanguagePrompt = require(UI.LanguagePrompt)
local BillsPanel = require(UI.BillsPanel)
local ContractsPanel = require(UI.ContractsPanel)
local Controllers = Client.Controllers
local BenchViews = require(Controllers.BenchViews)
local BenchController = require(Controllers.BenchController)
local MapController = require(Controllers.MapController)
local VehicleController = require(Controllers.VehicleController)
local Ambience = require(Controllers.Ambience)
local Guide = require(Controllers.Guide)
local Tutorial = require(Controllers.Tutorial)
local Traffic = require(Controllers.Traffic)
local Sky = require(Controllers.Sky)
local Display = require(Controllers.Display)
local WorldText = require(Controllers.WorldText)
local NpcPoses = require(Controllers.NpcPoses)
local Lots = require(Controllers.Lots)

S.detect()
State.init()
-- wait for the first save snapshot so the language and the numbers are right from the start
local t0 = os.clock()
while not State.ready() and os.clock() - t0 < 15 do
	task.wait(0.1)
end
if State.data and (State.data.lang == "tr" or State.data.lang == "en") then
	S.setLang(State.data.lang)
end

local screen = Kit.screen("PCTamirci", 5)
App.screen = screen
Kit.clickSound = function()
	App.sound("Click", 0.35)
end

local function home()
	Kit.closeWindow()
	MapController.close()
	local r = Net.request("travel.home")
	if r.ok then
		Hud.toast(S.t("travel_home"), "info", 2)
	else
		Hud.toast(S.err(r.err, { wait = r.wait }), "bad")
	end
end

----------------------------------------------------------------------------------------------------
-- Messages from the server
----------------------------------------------------------------------------------------------------
local MONEY_VARS = { amount = true, fine = true, bounty = true, cash = true, price = true, bonus = true, reward = true }
local BILL_KINDS = { utilities = true, rent = true, sgk = true, tax = true, fine = true, insurance = true, inspection = true }
local GOOD = { bills_autopaid = true, factory_done = true, inspection_ok = true, staff_promoted = true, qa_caught = true, staff_levelup = true, support_income = true, staff_restock = true, power_back = true, burglar_scared = true, police_recovered = true, insurance_paid = true, bat_hit = true, quest_done = true, offline_income = true, tech_done = true, caught_scammer = true, thief_caught = true, bounty = true, moved = true, manager_bought = true, contract_machine = true, contract_done = true, showcase_put = true, showcase_setup = true, showcase_sold = true }
local BAD = { bills_autofail = true, factory_stopped = true, inspection_fail = true, staff_quit_morale = true, staff_sticky = true, power_cut = true, police_fine = true, customer_left = true, scammer_escaped = true, thief_escaped = true, alarm = true, staff_quit = true, esd_zap = true, jobs_full = true, contract_machine_bad = true }

-- messages that get a card of their own (Hud.alert) instead of a toast, which group they belong to
-- (the title) and the icon for the group
local IMPORTANT = { bill_new = true, bills_autopaid = true, bills_autofail = true, bills_due_soon = true, bills_overdue = true, power_cut = true, power_cut_soon = true, inspection_fail = true, alarm = true, camera_alert = true, burglar_camera = true, thief_escaped = true, scammer_running = true, staff_quit = true, staff_quit_morale = true, factory_stopped = true }
local WARN = { camera_alert = true, scammer_running = true, burglar_camera = true, bill_new = true, bills_due_soon = true, power_cut_soon = true }
local ALERT_GROUP = { bill_new = "bill", bills_autopaid = "bill", bills_autofail = "bill", bills_due_soon = "bill", bills_overdue = "bill", power_cut = "power", power_cut_soon = "power", inspection_fail = "inspection", alarm = "theft", camera_alert = "theft", burglar_camera = "theft", thief_escaped = "theft", scammer_running = "theft", staff_quit = "staff", staff_quit_morale = "staff", factory_stopped = "factory" }
local ALERT_ICON = { bill = "🧾", power = "⚡", inspection = "📋", theft = "🚨", staff = "👋", factory = "🏭" }

-- "🧾 New bill: ..." -> "New bill: ...", "🧾" (the leading symbol and the space after it)
local function stripIcon(text: string): (string, string?)
	local ok, cp = pcall(utf8.codepoint, text, 1)
	if ok and cp and cp >= 0x2190 then
		local gap = string.find(text, " ", 1, true)
		if gap and gap <= 12 then
			return string.sub(text, gap + 1), string.sub(text, 1, gap - 1)
		end
	end
	return text, nil
end

Net.on("toast", function(t)
	if type(t) ~= "table" or type(t.key) ~= "string" then
		return
	end
	local vars = table.clone(t.vars or {})
	for k, v in vars do
		if MONEY_VARS[k] and type(v) == "number" then
			vars[k] = S.money(v)
		end
	end
	if t.key == "bill_new" and BILL_KINDS[vars.kind] then
		vars.kind = S.t("bill_" .. vars.kind)
	end
	if t.key == "tech_blocked" then
		local detail = tostring(vars.detail or "")
		if vars.reason == "need_part" and S.has("cat_" .. detail) then
			detail = S.t("cat_" .. detail)
		elseif vars.reason == "need_tool" then
			local tool = Tools.get(detail)
			detail = if tool then tool.icon .. " " .. S.pick(tool.name) else detail
		end
		vars.reason = S.t("reason_" .. tostring(vars.reason))
		vars.detail = detail
	elseif t.key == "tech_done" then
		vars.job = tostring(vars.job or "") .. (if vars.fixed then " ✅" else " ⚠️")
	elseif t.key == "thief_escaped" then
		if t.vars and (t.vars.cash or 0) <= 0 then
			vars.cash = ""
		end
	end
	local kind = if GOOD[t.key] then "good" elseif BAD[t.key] then "bad" elseif WARN[t.key] then "warn" else "info"
	local text = S.t("t_" .. t.key, vars)
	if t.important == true or IMPORTANT[t.key] then
		-- the things that must not be missed get a card of their own, with a ping
		local body, icon = stripIcon(text)
		local group = ALERT_GROUP[t.key]
		Hud.alert(icon or ALERT_ICON[group or ""] or "❗", S.t(if group then "alert_" .. group else "alert_" .. kind), body, kind, if kind == "bad" then 11 else 9)
	else
		Hud.toast(text, kind, if kind == "bad" or kind == "warn" then 6 else 4.5)
	end
	if t.key == "alarm" or t.key == "camera_alert" or t.key == "scammer_running" or t.key == "burglar_camera" then
		Hud.banner("🚨")
	end
end)

Net.on("paid", function(p)
	if p.failed then
		Hud.toast(S.t("paid_fail", { name = p.name }), "bad", 6)
		return
	end
	Hud.toast(S.t("paid", { name = p.name, price = S.money(p.price), tip = S.money(p.tip or 0), stars = S.stars(p.stars or 0) }), "good", 6)
	if p.text and #p.text > 0 then
		Hud.toast("💬 “" .. p.text .. "”", "info", 6)
	end
	App.sound("Cash", 0.6)
end)

State.changed:Connect(function(d, prev)
	if prev and d.money > prev.money then
		App.sound("Cash", 0.35)
	end
end)

----------------------------------------------------------------------------------------------------
-- UI and controllers
----------------------------------------------------------------------------------------------------
Hud.init(screen, {
	home = home,
	jobs = JobsPanel.toggle,
	inventory = Inventory.toggle,
	phone = Phone.toggle,
	map = MapController.toggle,
	settings = SettingsPanel.toggle,
	bills = function()
		BillsPanel.open()
	end,
})
CustomerDialog.init()
Stores.init()
StaffPanel.init()
FactoryPanel.init()
Garage.init()
ContractsPanel.init()
local function relabel()
	MapController.relabel()
	Guide.relabel()
	Tutorial.relabel()
	WorldText.setLanguage(S.lang())
end
Phone.init({
	map = MapController.open,
	home = home,
	relabel = relabel,
})
BenchViews.init()
BenchController.init(screen, Hud)
MapController.init()
VehicleController.init()
Ambience.init()
Traffic.init()
NpcPoses.init()
Lots.init()
Sky.init()
Guide.init()
Tutorial.init()
Prefs.init()
Prefs.languageChanged:Connect(relabel)
Display.init()
WorldText.init()
-- the first start asks for the language (it can be changed at the top of Settings later)
if not Prefs.languageChosen() then
	LanguagePrompt.show()
end
if State.data then
	if State.data.daily and State.data.daily.day ~= Market.day() then
		task.delay(6, function()
			Hud.toast(S.t("daily_ready"), "good", 6)
		end)
	end
end

-- keyboard shortcuts (M is the map controller's)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or BenchController.active() then
		return
	end
	local k = input.KeyCode
	if k == Enum.KeyCode.J then
		JobsPanel.toggle()
	elseif k == Enum.KeyCode.B then
		Inventory.toggle()
	elseif k == Enum.KeyCode.P then
		Phone.toggle()
	elseif k == Enum.KeyCode.H then
		home()
	elseif k == Enum.KeyCode.O then
		SettingsPanel.toggle()
	end
end)

-- If the city did not build completely, say so (the server lists what failed on the City folder).
task.spawn(function()
	local city = workspace:WaitForChild("City", 120)
	if not city then
		Hud.toast("⚠ The city has not been built (see the Output window)", "bad", 12)
		return
	end
	local errors = city:GetAttribute("Errors")
	if type(errors) == "string" and errors ~= "" then
		warn("[PC Repair Tycoon] the city built with errors: " .. errors)
		Hud.toast("⚠ Part of the city failed to build: " .. string.sub(errors, 1, 160), "bad", 14)
	end
end)
