-- Runs the server and the real client in the headless engine, puts the UI into a scene and dumps
-- the player's ScreenGui as JSON for tools/render/ui.html (a small Roblox GUI layout renderer).
--   lune run tools/uidump.luau <scene>
-- scenes: hud, phone, jobs, inventory, parts, used, tools, shop, staff, dealer, dialog, bench,
--         map, map_out, contracts, board

local fs = require("@lune/fs")
local serde = require("@lune/serde")
local process = require("@lune/process")
local task = require("@lune/task")

local Engine = require("../tests/lib/Engine")

local scene = process.args[1] or "hud"

require("../tests/lib/Bootstrap").run("tools/uidump.luau")

local function deepCopy(v)
	if type(v) ~= "table" then
		return v
	end
	local c = {}
	for k, x in v do
		c[k] = deepCopy(x)
	end
	return c
end

local function waitFor(fn, timeout: number?, what: string?)
	local t0 = os.clock()
	while os.clock() - t0 < (timeout or 5) do
		local v = fn()
		if v then
			return v
		end
		task.wait(0.03)
	end
	error("timed out waiting for " .. (what or "condition"))
end

Engine.context = "server"
local game = Engine.load("build/PCTamirci.rbxlx")
local player
local queue = {}
Engine.onFireClient = function(re, p, channel, data)
	if p ~= player then
		return
	end
	local ev = re.OnClientEvent
	if #ev._h == 0 then
		table.insert(queue, { channel, deepCopy(data) })
		return
	end
	ev:Fire(channel, deepCopy(data))
end
local started = false
task.spawn(function()
	Engine.runScript(game:GetService("ServerScriptService").Server.Main)
	started = true
end)
waitFor(function()
	return started
end, 30, "server")
local Services = game:GetService("ServerScriptService").Server.Services
local DataService = Engine.require(Services.DataService)
local PlotService = Engine.require(Services.PlotService)
local CustomerService = Engine.require(Services.CustomerService)
local MarketService = Engine.require(Services.MarketService)
local pps = game:GetService("ProximityPromptService")
local CS = game:GetService("CollectionService")

player = Engine.addPlayer("Kaan")
Engine.spawnCharacter(player)
waitFor(function()
	return DataService.get(player) and PlotService.shopOf(player)
end, 8, "shop")
local prof = DataService.get(player)
prof.money = 48250
prof.level = 7
prof.xp = 400
prof.rep = 72
prof.tutorial = 2
prof.opened = true
for _, id in { "precision_kit", "multimeter", "soldering_station", "usb_boot", "post_card", "thermal_camera", "spudger_kit", "brush", "tweezers" } do
	prof.tools[id] = true
end
DataService.addPart(player, "gpu_rtx3060", 1, "new")
DataService.addPart(player, "ram_ddr4_8_3200", 0.82, "used")
DataService.addPart(player, "cpu_r5_5600x", 1, "new")

Engine.localPlayer = player
Engine.context = "client"
local client = game:GetService("StarterPlayer").StarterPlayerScripts.Client
local done = false
task.spawn(function()
	Engine.runScript(client.Main)
	done = true
end)
local push = game:GetService("ReplicatedStorage").Remotes.Push
waitFor(function()
	return #push.OnClientEvent._h > 0
end, 5, "client")
for _, q in queue do
	push.OnClientEvent:Fire(q[1], q[2])
end
DataService.touch(player)
waitFor(function()
	return done
end, 20, "client main")
local function cmod(path: string)
	local inst = client
	for name in string.gmatch(path, "[^%.]+") do
		inst = inst:FindFirstChild(name)
	end
	return Engine.require(inst, "client")
end
local Hud = cmod("UI.Hud")

local function service(name: string, poi: string?)
	for _, a in CS:GetTagged("ServicePoint") do
		if a:GetAttribute("Service") == name and (poi == nil or a:GetAttribute("Poi") == poi) then
			player.Character:PivotTo(a.CFrame)
			MarketService.open(player, name, a:GetAttribute("Poi"), a.Position)
			return
		end
	end
	error("no service " .. name)
end

local function customerJob()
	CustomerService.ofShop(player).next = 0
	local cust = waitFor(function()
		local s = CustomerService.ofShop(player)
		return s and s.counter and s.counter.prompt and s.counter
	end, 10, "customer")
	return cust
end

cmod("UI.LanguagePrompt").close() -- (the first-start question would cover every scene)
Hud.toast("🎉 Level up! Level 7", "good")
Hud.toast("🏢 Contract: machine 2/3 delivered (+$75)", "info")
if scene == "alerts" then
	-- the important messages as cards: a new bill, the day before it is due, the power, a thief
	local Net = Engine.mod("ReplicatedStorage.Shared.Net")
	Net.push(player, "toast", { key = "bill_new", important = true, vars = { kind = "rent", amount = 480 } })
	Net.push(player, "toast", { key = "bills_due_soon", important = true, vars = { n = 2, amount = 905 } })
	Net.push(player, "toast", { key = "power_cut_soon", important = true })
	Net.push(player, "toast", { key = "thief_escaped", important = true, vars = { cash = 120, part = "" } })
	task.wait(0.4)
elseif scene == "phone" then
	cmod("UI.Phone").open()
elseif scene == "marketing" then
	local p = DataService.get(player)
	p.level = 9
	p.brand = { fame = 34, sat = 82, ads = { radio = os.time() + 1500 } }
	DataService.touch(player)
	task.wait(0.3)
	cmod("UI.MarketingPanel").open()
elseif string.sub(scene, 1, 9) == "settings_" then
	cmod("UI.SettingsPanel").open(string.sub(scene, 10))
elseif scene == "bills" then
	-- a week of business and a late electricity bill
	local BillsService = Engine.require(game:GetService("ServerScriptService").Server.Services.BillsService)
	local p = DataService.get(player)
	DataService.money(player, 4200, "repair")
	DataService.money(player, -900, "parts")
	DataService.money(player, -600, "wages")
	for d = 1, 8 do
		BillsService.morning(player, p, 100 + d)
	end
	BillsService.pay(player, p.bills.list[#p.bills.list].id)
	game:GetService("Workspace"):SetAttribute("Day", 106)
	DataService.touch(player)
	task.wait(0.3)
	cmod("UI.BillsPanel").open()
elseif scene == "staff_full" or scene == "team" then
	-- a team at work and the listings site with one candidate interviewed
	local EmployeeService = Engine.require(game:GetService("ServerScriptService").Server.Services.EmployeeService)
	local p = DataService.get(player)
	p.shop.level = 4
	p.money = 250000
	local function rec(role, name, extra)
		local r = { uid = role .. "_d", role = role, name = name, gender = "m", skill = 3, wage = 120, trait = "calm", trait2 = "punctual", edu = "vocational", morale = 74, days = 9, xp = 30 }
		for k, v in extra or {} do
			r[k] = v
		end
		return r
	end
	p.staff = {
		rec("foreman", "Hasan Usta", { skill = 5, wage = 260, trait = "veteran", morale = 88, days = 40 }),
		rec("apprentice", "Emre Kaya", { skill = 1, wage = 55, trait = "quick_learner", morale = 66, days = 2, xp = 20 }),
		rec("tea_maker", "Ramazan Abi", { wage = 60, trait = "funny", morale = 92 }),
		rec("accountant", "Zeynep Arslan", { gender = "f", wage = 150, trait = "careful", morale = 58 }),
	}
	DataService.touch(player)
	task.wait(0.2)
	if scene == "team" then
		cmod("UI.StaffPanel").team()
	else
		-- interview the first applicant on the listings site, then open it
		local rf = game:GetService("ReplicatedStorage").Remotes.Request
		service("staff")
		task.wait(0.3)
		rf.OnServerInvoke(player, "staff.interview", { uid = EmployeeService.candidates(player, "listing")[2].uid })
		EmployeeService.openAgency(player, "listing")
		task.wait(0.3)
	end
elseif scene == "shop_items" then
	-- the items tab, on the safety & licences shelf
	DataService.get(player).shop.items.fire_extinguisher = true
	DataService.get(player).shop.items.license = true
	DataService.touch(player)
	task.wait(0.2)
	cmod("UI.ShopPanel").open()
	task.wait(0.2)
	local win = cmod("UI.Kit").currentWindow()
	local function press(text: string)
		for _, d in win.root:GetDescendants() do
			if d:IsA("TextButton") and string.find(d.Text, text, 1, true) then
				d.Activated:Fire()
				return
			end
		end
		error("no button " .. text)
	end
	press("Items")
	task.wait(0.1)
	press("Safety")
	task.wait(0.2)
elseif scene == "factory" then
	-- a level-2 factory: one line running, stock in the warehouse
	local p = DataService.get(player)
	p.level = 12
	p.money = 90000
	local now = os.time()
	p.factory = { level = 2, elec = 45, made = 60, stock = { ram_atl_ddr4_8 = 40, case_atl_mid = 10, per_atl_ms = 20 }, lines = {
		{ part = "st_atl_ssd1t", n = 15, started = now - 40, endsAt = now + 60, rep = true },
		false,
	} }
	DataService.touch(player)
	task.wait(0.2)
	cmod("UI.FactoryPanel").open()
	task.wait(0.3)
elseif scene == "leaders" then
	-- a few rivals on the server
	for i, name in { "Ayşe", "Burak", "Ceren" } do
		local rival = Engine.addPlayer(name)
		Engine.spawnCharacter(rival)
		waitFor(function()
			return DataService.get(rival)
		end, 8, "rival")
		local rp = DataService.get(rival)
		rp.money = 20000 * i + 3500
		rp.level = 4 + i * 3
		rp.stats.repairs = 30 * i
	end
	task.wait(0.2)
	cmod("UI.LeadersPanel").open()
	task.wait(0.3)
elseif scene == "jobs" then
	local cust = customerJob()
	pps.PromptTriggered:Fire(cust.prompt, player)
	task.wait(0.3)
	local Kit = cmod("UI.Kit")
	Kit.closeWindow()
	cmod("UI.JobsPanel").open()
elseif scene == "inventory" then
	cmod("UI.Inventory").open()
elseif scene == "shop" then
	cmod("UI.ShopPanel").open()
elseif scene == "dialog" then
	local cust = customerJob()
	pps.PromptTriggered:Fire(cust.prompt, player)
elseif scene == "bench" then
	local cust = customerJob()
	pps.PromptTriggered:Fire(cust.prompt, player)
	task.wait(0.2)
	local Kit = cmod("UI.Kit")
	local w = Kit.currentWindow()
	for _, d in w.root:GetDescendants() do
		if d:IsA("TextButton") and (string.find(d.Text, "Kabul", 1, true) or string.find(d.Text, "Satın", 1, true)) then
			d.Activated:Fire()
			break
		end
	end
	task.wait(0.2)
	local bench = PlotService.shopOf(player).benches[1]
	pps.PromptTriggered:Fire(bench.PromptAnchor:FindFirstChildOfClass("ProximityPrompt"), player)
	task.wait(0.2)
	local benchUi = player.PlayerGui.PCTamirci.Bench
	for _, d in benchUi:GetDescendants() do
		if d:IsA("TextButton") and string.find(d.Text, "Tezgâha Al", 1, true) then
			d.Activated:Fire()
			break
		end
	end
	task.wait(0.2)
	for _, d in benchUi:GetDescendants() do
		if d:IsA("TextButton") and d.Name == "power" then
			d.Activated:Fire()
		end
	end
	task.wait(0.2)
elseif scene == "map" then
	cmod("Controllers.MapController").open()
elseif scene == "map_out" then
	cmod("Controllers.MapController").open()
	cmod("Controllers.MapController").overview()
elseif scene == "contracts" then
	service("contracts", "internet_cafe")
elseif scene == "parts_gpu" then
	-- the parts store on its graphics card tab, filtered to one chip maker
	service("parts")
	task.wait(0.3)
	local gui = Engine.localPlayer:FindFirstChild("PlayerGui")
	local function press(text: string)
		for _, d in gui:GetDescendants() do
			if d:IsA("TextButton") and string.find(d.Text, text, 1, true) then
				d.Activated:Fire()
				task.wait(0.1)
				return
			end
		end
		error("no button " .. text)
	end
	press("Graphics Cards")
	press("NVIDIA")
elseif scene ~= "hud" and scene ~= "alerts" and scene ~= "marketing" and string.sub(scene, 1, 9) ~= "settings_" then
	service(if scene == "dealer" then "cars" elseif scene == "staff" then "staff" else scene)
end
task.wait(0.4)
Engine.step(3, 1 / 30)

----------------------------------------------------------------------------------------------------
-- Serialize the ScreenGui
----------------------------------------------------------------------------------------------------
local function u2(v)
	return { v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset }
end
local function c3(c)
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end
local function prop(inst, name)
	local ok, v = pcall(function()
		return (inst :: any)[name]
	end)
	return if ok then v else nil
end

local function node(inst)
	local n = { class = inst.ClassName, name = inst.Name, children = {} }
	if inst:IsA("GuiObject") then
		n.size = u2(inst.Size)
		n.pos = u2(inst.Position)
		n.anchor = { inst.AnchorPoint.X, inst.AnchorPoint.Y }
		n.visible = inst.Visible
		n.bg = c3(inst.BackgroundColor3)
		n.bgt = inst.BackgroundTransparency
		n.z = inst.ZIndex
		n.order = inst.LayoutOrder
		n.auto = inst.AutomaticSize.Name
		n.clip = inst.ClipsDescendants
		n.rot = inst.Rotation
		if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
			n.text = inst.Text
			n.textSize = inst.TextSize
			n.textColor = c3(inst.TextColor3)
			n.textT = inst.TextTransparency
			n.xa = inst.TextXAlignment.Name
			n.ya = inst.TextYAlignment.Name
			n.wrap = inst.TextWrapped
			n.scaled = inst.TextScaled
			n.weight = prop(inst, "FontFace") and inst.FontFace.Weight.Name or "Regular"
			n.stroke = inst.TextStrokeTransparency
			if inst:IsA("TextBox") then
				n.placeholder = inst.PlaceholderText
			end
		end
		if inst:IsA("ScrollingFrame") then
			n.scroll = true
		end
		if inst:IsA("ViewportFrame") then
			n.viewport = true
		end
	end
	for _, c in inst:GetChildren() do
		if c:IsA("UICorner") then
			n.corner = { c.CornerRadius.Scale, c.CornerRadius.Offset }
		elseif c:IsA("UIStroke") then
			n.ustroke = { color = c3(c.Color), th = c.Thickness, t = c.Transparency }
		elseif c:IsA("UIPadding") then
			n.pad = { c.PaddingLeft.Offset, c.PaddingRight.Offset, c.PaddingTop.Offset, c.PaddingBottom.Offset }
		elseif c:IsA("UIListLayout") then
			n.list = { dir = c.FillDirection.Name, pad = c.Padding.Offset, ha = c.HorizontalAlignment.Name, va = c.VerticalAlignment.Name }
		elseif c:IsA("UIGridLayout") then
			n.grid = { cell = u2(c.CellSize), pad = u2(c.CellPadding) }
		elseif c:IsA("UIScale") then
			n.scale = c.Scale
		elseif c:IsA("GuiObject") then
			table.insert(n.children, node(c))
		end
	end
	return n
end

local gui = player.PlayerGui:FindFirstChild("PCTamirci")
local out = node(gui)
out.ignoreInset = gui.IgnoreGuiInset
fs.writeDir("tools/render/out")
local path = "tools/render/out/ui_" .. scene .. ".json"
fs.writeFile(path, serde.encode("json", out))
print("wrote " .. path)
process.exit(0)
