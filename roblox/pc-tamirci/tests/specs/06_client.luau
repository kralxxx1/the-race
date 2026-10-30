-- Client: runs the real client scripts against the running server. The client gets its own
-- module instances (its own Net, in client mode) and server pushes are copied across like the
-- network would. Every window is opened, buttons are clicked, a customer is served through the
-- dialog, a bench session is driven, the stores/agency/dealer counters are used, the map routes
-- with GPS, the vehicle controller drives and the city lights up at night.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local roblox = require("@lune/roblox")
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

	T.test("client: the tutorial walks a new player through the opening with an arrow", function()
		local Tutorial = cmod("Controllers.Tutorial")
		local Guide = cmod("Controllers.Guide")
		T.eq(Tutorial.step(), 1, "a new player starts at the opening")
		local card = gui:FindFirstChild("Tutorial", true)
		T.ok(card and card.Visible, "tutorial card")
		-- the arrow points at the ribbon across the shop door
		local ribbon = waitFor(function()
			local t = Guide.current()
			return typeof(t) == "Instance" and t.Name == "Ribbon" and t
		end, 3, "arrow on the ribbon")
		Engine.step(1, 1 / 30)
		local folder = Engine.workspace:FindFirstChild("Guide")
		T.ok(folder and folder:FindFirstChild("GuideArrow"), "3D arrow in the world")
		-- far from the shop: an arrow on the screen edge and the home tag
		local char = player.Character
		local root = char.HumanoidRootPart
		local home = root.CFrame
		root.CFrame = roblox.CFrame.new(ribbon.Position + roblox.Vector3.new(400, 0, 400))
		-- looking away from the shop, so it is behind the camera
		Engine.workspace.CurrentCamera.CFrame = roblox.CFrame.lookAt(root.Position + roblox.Vector3.new(0, 10, 0), root.Position + roblox.Vector3.new(50, 10, 400))
		Engine.step(3, 1 / 30)
		local edge = gui:FindFirstChild("GuideEdge", true)
		T.ok(edge and edge.Visible, "edge pointer while the target is off screen")
		local tag = folder:FindFirstChild("MyShopTag")
		T.ok(tag and tag.Enabled, "your-shop tag over the shop when far away")
		root.CFrame = home
		-- cut the ribbon: the next step points at the counter (then the customer)
		local prompt = ribbon:FindFirstChild("OpenPrompt")
		game:GetService("ProximityPromptService").PromptTriggered:Fire(prompt, player)
		waitFor(function()
			return Tutorial.step() == 2
		end, 4, "tutorial moves on after the opening")
		local t = waitFor(function()
			local c = Guide.current()
			return typeof(c) == "Instance" and (c.Name == "Register" or c.Name == "Head") and c
		end, 3, "arrow on the counter or the customer")
		T.ok(t ~= nil, "talk step target")
		T.ok(string.find(gui:FindFirstChild("Tutorial", true):FindFirstChildWhichIsA("TextLabel").Text, "2", 1, true) ~= nil, "step counter")
	end)

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

	T.test("client: the Settings window changes sound, graphics and help and saves them", function()
		Mock.errors = {}
		local Prefs = cmod("Prefs")
		local Hud = cmod("UI.Hud")
		local Ambience = cmod("Controllers.Ambience")
		local Lighting = game:GetService("Lighting")
		local Traffic = cmod("Controllers.Traffic")

		-- the gear on the left opens it, with all four tabs
		T.ok(Hud.buttons.settings ~= nil, "gear button")
		Hud.buttons.settings.Activated:Fire()
		local w = window()
		T.ok(w ~= nil and w.root.Name == "SettingsWindow", "settings window")
		for _, tab in { "Audio", "Graphics", "Gameplay", "Controls" } do
			click(w.content, tab)
			T.ok(w.content:FindFirstChildWhichIsA("ScrollingFrame", true) ~= nil, tab .. " page")
		end

		-- audio: a switch silences a channel, a slider sets a level
		click(w.content, "Audio")
		local musicSwitch = w.content:FindFirstChild("Switch_musicOn", true)
		T.ok(musicSwitch ~= nil, "music switch")
		T.ok(Prefs.volume("music") > 0, "music plays by default")
		musicSwitch.Activated:Fire()
		T.eq(Prefs.get("musicOn"), false, "music switched off")
		T.eq(Prefs.volume("music"), 0, "silent")
		musicSwitch.Activated:Fire()
		T.ok(Prefs.volume("music") > 0, "and back on")
		local hit = w.content:FindFirstChild("Slider_master", true).Parent:FindFirstChild("Hit")
		hit.InputBegan:Fire({ UserInputType = roblox.Enum.UserInputType.MouseButton1, Position = roblox.Vector3.new(-50, 0, 0) })
		T.eq(Prefs.get("master"), 0, "master slider dragged to the left end")
		T.eq(Prefs.volume("sfx"), 0, "everything is quiet at master 0")
		Prefs.set("master", 0.5)
		T.near(Prefs.volume("sfx"), 0.4, 1e-6, "master × channel")

		-- graphics: a preset flips the switches, a single switch makes it "custom"
		click(w.content, "Graphics")
		local custom = w.content:FindFirstChild("Custom", true)
		T.ok(custom ~= nil and not custom.Visible, "high preset is not custom")
		click(w.content, "Low")
		T.eq(Prefs.get("quality"), "low", "low preset")
		T.eq(Lighting.GlobalShadows, false, "shadows off")
		T.eq(Lighting:FindFirstChild("AmbBloom").Enabled, false, "bloom off")
		T.eq(Prefs.get("traffic"), "low", "fewer cars")
		click(w.content, "Ultra")
		T.eq(Lighting.GlobalShadows, true, "shadows on")
		T.eq(Lighting:FindFirstChild("AmbDof").Enabled, true, "depth of field on")
		w.content:FindFirstChild("Switch_bloom", true).Activated:Fire()
		T.eq(Lighting:FindFirstChild("AmbBloom").Enabled, false, "bloom switch")
		T.ok(w.content:FindFirstChild("Custom", true).Visible, "preset no longer matches: custom")
		Prefs.set("brightness", 0.5)
		Prefs.set("uiscale", 1.2)
		T.near(gui:GetAttribute("UserScale"), 1.2, 1e-6, "UI size follows the setting")

		-- name tags follow the switch, also for tags that appear later
		local head = roblox.Instance.new("Part")
		head.Parent = game:GetService("Workspace")
		local tag = roblox.Instance.new("BillboardGui")
		tag.Parent = head
		tag:AddTag("NameTag")
		Prefs.set("names", false)
		T.eq(tag.Enabled, false, "name tag hidden")
		local later = roblox.Instance.new("BillboardGui")
		later.Parent = head
		later:AddTag("NameTag")
		CS:GetInstanceAddedSignal("NameTag"):Fire(later) -- (the headless engine does not raise it itself)
		T.eq(later.Enabled, false, "a new tag starts hidden")
		Prefs.set("names", true)
		T.eq(tag.Enabled, true, "name tag back")
		head:Destroy()

		-- street life scales with the setting
		Prefs.set("traffic", "off")
		local cars, peds = Traffic.counts()
		T.eq(cars + peds, 0, "no street life")
		Prefs.set("traffic", "normal")

		-- gameplay: the help level and the difficulty reach the server's save
		click(w.content, "Gameplay")
		click(w.content, "Hints only")
		click(w.content, "Hard")
		T.eq(State.data.settings.help, "hints", "mirrored in the client state")
		local saved = DataService.get(player).settings
		waitFor(function()
			return saved.help == "hints" and saved.difficulty == "hard" and saved.quality == "ultra"
		end, 3, "settings saved on the server")
		T.eq(saved.fov, 70, "untouched settings keep their defaults")
		T.near(saved.brightness, 0.5, 1e-6, "brightness saved")
		T.eq(saved.bloom, false, "bloom saved")

		-- a snapshot from the server does not undo what was just chosen
		Prefs.set("fov", 88)
		DataService.touch(player)
		task.wait(0.1)
		T.eq(Prefs.get("fov"), 88, "snapshot during a change")

		-- reset
		click(w.content, "Reset")
		T.eq(Prefs.get("quality"), "high", "defaults are back")
		T.eq(Prefs.get("help"), "guided", "help back to guided")
		T.eq(Lighting:FindFirstChild("AmbBloom").Enabled, true, "bloom back")
		Kit.closeWindow()
		-- music still plays after all of it
		T.ok(Ambience._music.decks[Ambience._music.cur].IsPlaying, "music keeps playing")
		noErrors("settings")
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
		-- every part carries a name tag, and your own avatar stays out of the picture
		local tags = game:GetService("Workspace"):FindFirstChild("BenchLabels")
		T.ok(tags ~= nil and #tags:GetChildren() >= 6, "name tags on the parts")
		Bench.setLabels(false)
		T.eq(#tags:GetChildren(), 0, "tags off")
		Bench.setLabels(true)
		T.ok(#tags:GetChildren() >= 6, "tags back on")
		for _, part in player.Character:GetDescendants() do
			if part:IsA("BasePart") then
				T.eq(part.LocalTransparencyModifier, 1, "avatar hidden at the bench: " .. part.Name)
			end
		end
		-- the rules-driven hover hint for every node and owned tool
		local tested = 0
		for id in v.nodes do
			for _, tid in { "hand", "screwdriver_ph2", "air_can" } do
				Bench._resolve(v, id, tid)
				tested += 1
			end
		end
		T.ok(tested > 30, "resolved " .. tested)
		local BenchSounds = Engine.mod("ReplicatedStorage.Shared.Config").Sounds.Bench
		table.clear(Engine.played)
		click(benchUi, S.t("bench_power"))
		task.wait(0.1)
		local function sid(e)
			return if type(e) == "table" then e.id else e
		end
		T.ok(table.find(Engine.played, sid(BenchSounds.press_power)) ~= nil, "the power button clicks")
		-- the coach: step 1 was "test it"; now it has seen the symptom, and the next-step hint points at a part
		local Coach = cmod("Controllers.BenchCoach")
		T.ok(Coach._card().Visible, "the coach card is up")
		T.ok(Coach._state().powered and Coach._state().stage ~= nil, "the coach saw the power test")
		if v.kind == "desktop" then
			local nextBtn = Coach._card():FindFirstChild("CoachNext", true)
			T.ok(nextBtn ~= nil and nextBtn.Visible, "a next-step button")
			nextBtn.Activated:Fire()
			waitFor(function()
				return Coach._state().hint ~= nil
			end, 3, "hint")
			T.ok(Coach._state().hint.next ~= nil, "the hint names the next click")
			-- (a software fix or the wrist strap has no part to point at: its button glows instead)
			local nx = Coach._state().hint.next
			local pointers = game:GetService("Workspace"):FindFirstChild("BenchCoach")
			if nx.target then
				T.ok(pointers ~= nil and #pointers:GetChildren() >= 1, "an arrow over the part")
			else
				T.ok(nx.action == "software" or nx.action == "wear_strap", "only software steps and the wrist strap have no part: " .. nx.action)
			end
		end
		local first = if v.kind == "desktop" then "sp_s1" else nil
		if first then
			-- the screw whirs while it's held, and stops with it (the engine's hold loop doesn't
			-- yield, so listen through App.loop)
			local App = cmod("UI.App")
			local loop = App.loop
			local heard, stopped = {}, 0
			App.loop = function(id, volume)
				table.insert(heard, id)
				local stop = loop(id, volume)
				return function()
					stopped += 1
					stop()
				end
			end
			local c, ok = Bench._act(first, "hand")
			App.loop = loop
			T.ok(c ~= nil and ok, "unscrew the side panel")
			T.eq(heard[1], sid(BenchSounds[c.action]), "tool sound while working")
			T.eq(stopped, 1, "tool sound stops")
			T.ok(game:GetService("SoundService"):FindFirstChild("SfxLoop") == nil, "no sound left behind")
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
		for _, service in { "parts", "parts_bazaar", "used", "scrap", "tools", "realty", "board", "police", "staff", "factory", "bicycles", "bikes", "cars" } do
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

	T.test("client: traffic and pedestrians around the player", function()
		Mock.errors = {}
		local Traffic = cmod("Controllers.Traffic")
		local cam = Engine.workspace.CurrentCamera
		local L = Engine.mod("ReplicatedStorage.Shared.World.CityLayout").get()
		cam.CFrame = roblox.CFrame.new(L.poiById.plaza.pos + roblox.Vector3.new(0, 40, 0))
		for _ = 1, 120 do
			Engine.step(1, 1 / 30)
			task.wait()
		end
		local carsN, pedsN = Traffic.counts()
		T.ok(carsN >= 5, "cars: " .. carsN)
		T.ok(pedsN >= 5, "pedestrians: " .. pedsN)
		-- let them drive through junctions for a while (simulated time)
		for _ = 1, 300 do
			Engine.step(1, 1 / 10)
		end
		local folder = Engine.workspace:FindFirstChild("ClientTraffic")
		T.ok(folder and #folder:GetChildren() > 20, "traffic models")
		-- pedestrians and drivers are copies of the server's catalog avatars
		local walkers, drivers = 0, 0
		for _, m in folder:GetChildren() do
			if m:FindFirstChildOfClass("Humanoid") and m:GetAttribute("Avatar") then
				walkers += 1
				T.ok(m.HumanoidRootPart.Anchored, "posed by code, no physics")
			elseif m:FindFirstChild("DriverAvatar") then
				drivers += 1
			end
		end
		T.ok(walkers >= 5, "avatar pedestrians: " .. walkers)
		T.ok(drivers >= 3, "avatar drivers: " .. drivers)
		local sky = Engine.workspace:FindFirstChild("Sky")
		T.ok(sky and #sky:GetChildren() > 40, "birds and balloons")
		noErrors("traffic")
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

	T.test("client: ambience loops and a never-ending music playlist", function()
		local SoundService = game:GetService("SoundService")
		local Sounds = Engine.mod("ReplicatedStorage.Shared.Config").Sounds
		for _, name in { "day", "night", "rain", "rainIn", "sea" } do
			local loop = SoundService:FindFirstChild("Amb_" .. name)
			T.ok(loop ~= nil and loop.Looped and loop.IsPlaying, name .. " loop")
		end
		local Ambience = cmod("Controllers.Ambience")
		local music = Ambience._music
		local seen = {}
		for _ = 1, #Sounds.Music do
			local deck = music.decks[music.cur]
			T.ok(deck.IsPlaying and table.find(Sounds.Music, deck.SoundId) ~= nil, "a playlist track is playing")
			seen[deck.SoundId] = true
			-- the track ends: the watchdog hands over to the other deck
			deck:Stop()
			music.started -= 10
			Engine.step(4, 1 / 10)
		end
		local n = 0
		for _ in seen do
			n += 1
		end
		T.eq(n, #Sounds.Music, "every track once per round")
		T.ok(music.decks[music.cur].IsPlaying, "still playing after a full round")
	end)

	T.test("client: rain falls outside and drums on the roof inside", function()
		local SoundService = game:GetService("SoundService")
		local ws = game:GetService("Workspace")
		local cam = ws.CurrentCamera
		local rain = ws:FindFirstChild("RainBox"):FindFirstChild("Rain")
		Engine.context = "client"
		Engine.setAttribute(ws, "Raining", true)
		-- out in the open, far above everything
		cam.CFrame = roblox.CFrame.new(0, 400, 0)
		task.wait(0.35)
		Engine.step(30, 1 / 10)
		T.ok(rain.Rate > 0, "rain falls outside")
		T.ok(SoundService.Amb_rain.Volume > SoundService.Amb_rainIn.Volume, "outdoor rain sound")
		-- under a roof
		local roof = roblox.Instance.new("Part")
		roof.Anchored = true
		roof.Size = roblox.Vector3.new(40, 1, 40)
		roof.CFrame = roblox.CFrame.new(0, 420, 0)
		roof.Parent = ws
		Engine.invalidateRaycasts()
		task.wait(0.35)
		Engine.step(60, 1 / 10)
		T.eq(rain.Rate, 0, "no rain indoors")
		T.ok(SoundService.Amb_rainIn.Volume > SoundService.Amb_rain.Volume, "rain on the roof instead")
		roof:Destroy()
		Engine.setAttribute(ws, "Raining", false)
	end)
	_ = RepairService
end
