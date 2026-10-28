-- Client: runs the real client scripts against the running server. The client gets its own
-- module instances (its own Net, in client mode) and server pushes are copied across like the
-- network would. Every window is opened, buttons are clicked, a customer is served through the
-- dialog, a bench session is driven, the stores/agency/dealer counters are used, the map routes
-- with GPS, the vehicle controller drives and the city lights up at night.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local task = require("@lune/task")

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

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local pps = game:GetService("ProximityPromptService")
	local CS = game:GetService("CollectionService")
	local player
	local queue = {}
	Engine.onFireClient = function(re, p, channel, data)
		if p ~= player then
			return
		end
		local ev = re.OnClientEvent
		if #ev._h == 0 then
			-- Roblox queues events until the client listens
			table.insert(queue, { channel, deepCopy(data) })
			return
		end
		ev:Fire(channel, deepCopy(data))
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

	-- server
	local started = false
	task.spawn(function()
		Engine.runScript(game:GetService("ServerScriptService").Server.Main)
		started = true
	end)
	waitFor(function()
		return started
	end, 30, "server start")
	local Services = game:GetService("ServerScriptService").Server.Services
	local DataService = Engine.require(Services.DataService)
	local PlotService = Engine.require(Services.PlotService)
	local RepairService = Engine.require(Services.RepairService)
	local CustomerService = Engine.require(Services.CustomerService)
	local VehicleService = Engine.require(Services.VehicleService)
	local rf = game:GetService("ReplicatedStorage").Remotes.Request
	local push = game:GetService("ReplicatedStorage").Remotes.Push

	player = Engine.addPlayer("Ayse")
	Engine.spawnCharacter(player)
	waitFor(function()
		return DataService.get(player) and PlotService.shopOf(player)
	end, 8, "shop")
	Engine.localPlayer = player
	local function request(action: string, payload)
		return rf.OnServerInvoke(player, action, payload)
	end

	-- client
	local clientFolder = game:GetService("StarterPlayer").StarterPlayerScripts.Client
	local function cmod(path: string)
		local inst = clientFolder
		for name in string.gmatch(path, "[^%.]+") do
			inst = inst:FindFirstChild(name)
		end
		return Engine.require(inst, "client")
	end
	local gui
	local S
	T.test("client: boots with HUD, minimap and the first save", function()
		Engine.context = "client"
		local done, err = false, nil
		local t0 = os.clock()
		task.spawn(function()
			local ok, e = pcall(Engine.runScript, clientFolder.Main)
			err = if ok then nil else e
			done = true
		end)
		waitFor(function()
			return #push.OnClientEvent._h > 0
		end, 5, "client listening")
		for _, q in queue do
			push.OnClientEvent:Fire(q[1], q[2])
		end
		table.clear(queue)
		DataService.touch(player)
		waitFor(function()
			return done
		end, 20, "client main")
		T.ok(err == nil, tostring(err))
		gui = player.PlayerGui:FindFirstChild("PCTamirci")
		T.ok(gui ~= nil, "screen gui")
		for _, name in { "Stats", "Quick", "Minimap", "Toasts", "Bench" } do
			T.ok(gui:FindFirstChild(name, true) ~= nil, "has " .. name)
		end
		S = cmod("Strings")
		local money = gui:FindFirstChild("Money", true)
		T.ok(money and string.find(money.Text, "%$"), "money shown: " .. tostring(money and money.Text))
		print(string.format("    client boot %.1fs", os.clock() - t0))
	end)
	if not gui then
		return
	end
	local Kit = cmod("UI.Kit")
	local State = cmod("State")

	local function window()
		return Kit.currentWindow()
	end
	local function click(root, text: string)
		local pattern = text
		for _, d in root:GetDescendants() do
			if d:IsA("TextButton") and string.find(d.Text, pattern, 1, true) and d.Active then
				d.Activated:Fire()
				return d
			end
		end
		error("no button matching '" .. pattern .. "'")
	end
	local function noErrors(what: string)
		local errs = Mock.errors or {}
		T.ok(#errs == 0, what .. ": " .. tostring(errs[1]))
	end

	T.test("client: every window and phone app opens", function()
		Mock.errors = {}
		cmod("UI.JobsPanel").open()
		T.ok(window() ~= nil, "jobs window")
		local Inventory = cmod("UI.Inventory")
		for _, tab in { "parts", "stock", "tools" } do
			Inventory.open(tab)
			T.ok(window() ~= nil, "inventory " .. tab)
		end
		local Phone = cmod("UI.Phone")
		Phone.open()
		local apps = {}
		for _, d in window().content:GetDescendants() do
			if d:IsA("TextButton") then
				table.insert(apps, d)
			end
		end
		T.ok(#apps >= 12, "phone apps: " .. #apps)
		for i = 1, #apps do
			Phone.open()
			local list = {}
			for _, d in window().content:GetDescendants() do
				if d:IsA("TextButton") then
					table.insert(list, d)
				end
			end
			list[i].Activated:Fire()
			task.wait(0.05)
		end
		cmod("Controllers.MapController").close()
		Kit.closeWindow()
		noErrors("windows")
	end)

	T.test("client: the map routes to a place and lays a GPS trail", function()
		local Map = cmod("Controllers.MapController")
		Map.open()
		local root = gui:FindFirstChild("Map")
		T.ok(root and root.Visible, "map visible")
		T.ok(#root:GetDescendants() > 300, "city drawn")
		local L = Engine.mod("ReplicatedStorage.Shared.World.CityLayout").get()
		local poi = L.poiById.megastore
		Map.navigate(poi.door, "Mega")
		local trail = Engine.workspace:FindFirstChild("GpsTrail")
		T.ok(trail and #trail:GetChildren() > 4, "trail on the road")
		local route = root:FindFirstChild("Route", true)
		T.ok(route and #route:GetChildren() >= 2, "route drawn on the map")
		Map.clearRoute()
		Map.close()
		T.ok(not root.Visible, "closed")
	end)

	T.test("client: a customer is served through the dialog", function()
		Mock.errors = {}
		CustomerService.ofShop(player).next = 0
		local cust = waitFor(function()
			local s = CustomerService.ofShop(player)
			return s and s.counter and s.counter.prompt and s.counter
		end, 10, "customer at the counter")
		pps.PromptTriggered:Fire(cust.prompt, player)
		local w = waitFor(window, 3, "dialog")
		local before = #State.jobs
		if cust.arch.special == "stolen_offer" then
			click(w.root, S.t("talk_reject"))
			return
		end
		click(w.root, (string.gsub(S.t("talk_accept", { price = "" }), "%(%)", "")))
		waitFor(function()
			return #State.jobs > before
		end, 3, "job in the client's list")
		noErrors("dialog")
	end)

	T.test("client: a bench session from the job picker to a power test", function()
		Mock.errors = {}
		local Bench = cmod("Controllers.BenchController")
		local Views = cmod("Controllers.BenchViews")
		local benchModel = PlotService.shopOf(player).benches[1]
		pps.PromptTriggered:Fire(benchModel.PromptAnchor:FindFirstChildOfClass("ProximityPrompt"), player)
		waitFor(Bench.active, 3, "bench open")
		local benchUi = gui:FindFirstChild("Bench")
		T.ok(benchUi.Visible, "bench UI")
		click(benchUi, S.t("bench_load"))
		local h = waitFor(function()
			return Views.handle(benchModel)
		end, 3, "device on the bench")
		T.ok(#h.model:GetDescendants() > 20, "device model")
		local v = Bench._view()
		T.ok(v and v.nodes, "view")
		-- the rules-driven hover hint for every node and owned tool
		local tested = 0
		for id in v.nodes do
			for _, tid in { "hand", "screwdriver_ph2", "air_can" } do
				Bench._resolve(v, id, tid)
				tested += 1
			end
		end
		T.ok(tested > 30, "resolved " .. tested)
		click(benchUi, S.t("bench_power"))
		task.wait(0.1)
		local first = if v.kind == "desktop" then "sp_s1" else nil
		if first then
			local c, ok = Bench._act(first, "hand")
			T.ok(c ~= nil and ok, "unscrew the side panel")
			waitFor(function()
				local nv = Bench._view()
				return nv.nodes[first].st ~= "in"
			end, 3, "screw out")
		end
		click(benchUi, S.t("bench_leave"))
		T.ok(not Bench.active(), "left the bench")
		noErrors("bench")
	end)

	local function openService(name: string)
		for _, a in CS:GetTagged("ServicePoint") do
			if a:GetAttribute("Service") == name then
				player.Character:PivotTo(a.CFrame)
				pps.PromptTriggered:Fire(a:FindFirstChildOfClass("ProximityPrompt"), player)
				return a
			end
		end
		error("no service " .. name)
	end

	T.test("client: stores, agency and dealers", function()
		Mock.errors = {}
		local p = DataService.get(player)
		p.money = 200000
		p.level = 12
		p.shop.level = 3
		DataService.touch(player)
		task.wait(0.05)
		for _, service in { "parts", "parts_bazaar", "used", "scrap", "tools", "realty", "board", "police", "staff", "bicycles", "bikes", "cars" } do
			Kit.closeWindow()
			openService(service)
			local w = waitFor(window, 3, service .. " window")
			T.ok(#w.content:GetDescendants() > 0, service .. " content")
		end
		-- buy a part from the depot
		Kit.closeWindow()
		openService("parts")
		local inv0 = #p.inv
		click(window().root, S.t("buy"))
		waitFor(function()
			return #p.inv > inv0
		end, 3, "bought a part")
		-- hire at the agency
		Kit.closeWindow()
		openService("staff")
		local staff0 = #p.staff
		click(window().root, (string.gsub(S.t("staff_hire", { price = "" }), "%(%)", "")))
		waitFor(function()
			return #p.staff > staff0
		end, 3, "hired")
		-- buy a bike at the bicycle shop
		Kit.closeWindow()
		openService("bicycles")
		click(window().root, S.t("buy"))
		waitFor(function()
			return next(p.vehicles) ~= nil
		end, 3, "bought a vehicle")
		Kit.closeWindow()
		noErrors("stores")
	end)

	T.test("client: driving a vehicle", function()
		local p = DataService.get(player)
		local id = next(p.vehicles)
		local r = request("vehicle.spawn", { id = id })
		T.ok(r.ok, "spawn: " .. tostring(r.err))
		local m = VehicleService.active(player)
		local seat = m:FindFirstChild("Driver")
		local Vehicle = cmod("Controllers.VehicleController")
		Vehicle._start(seat)
		T.ok(Vehicle.driving(), "driving")
		seat.ThrottleFloat = 1
		Engine.step(40, 1 / 30)
		local drive = m.PrimaryPart.Drive
		T.ok(drive.PlaneVelocity.Magnitude > 5, "speed " .. tostring(drive.PlaneVelocity.Magnitude))
		seat.SteerFloat = 1
		local yaw0 = m.PrimaryPart.Upright.CFrame.LookVector
		Engine.step(20, 1 / 30)
		T.ok(m.PrimaryPart.Upright.CFrame.LookVector:Dot(yaw0) < 0.999, "steering turns")
		seat.ThrottleFloat = 0
		seat.SteerFloat = 0
		local before = drive.PlaneVelocity.Magnitude
		Engine.step(20, 1 / 30)
		T.ok(drive.PlaneVelocity.Magnitude < before, "coasting slows down")
		request("vehicle.despawn")
		Engine.step(2)
		T.ok(not Vehicle.driving(), "stopped when the vehicle is gone")
	end)

	T.test("client: the city lights up at night", function()
		local Lighting = game:GetService("Lighting")
		Lighting.ClockTime = 22
		Engine.step(3)
		local lit = waitFor(function()
			for _, b in CS:GetTagged("LampBulb") do
				local l = b:FindFirstChildWhichIsA("Light")
				if l and l.Enabled then
					return true
				end
			end
			return nil
		end, 5, "street lamps on")
		T.ok(lit, "lamps")
		local windows = 0
		for _, w in CS:GetTagged("NightWindow") do
			if w.Transparency < 0.5 then
				windows += 1
			end
		end
		T.ok(windows > 50, "lit windows: " .. windows)
		Lighting.ClockTime = 12
		Engine.step(3)
	end)
	_ = RepairService
end
