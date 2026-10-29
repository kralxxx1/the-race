-- Server integration: a player joins, gets a shop, serves a customer at the counter, repairs the
-- device at a bench, gets paid, shops for parts, buys and calls a car, hires a technician who
-- fixes the next job by himself, and catches a thief.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local roblox = require("@lune/roblox")
local task = require("@lune/task")

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local pushes = {}
	Engine.onFireClient = function(_, player, channel, data)
		table.insert(pushes, { player = player, channel = channel, data = data })
	end
	local function lastPush(channel: string)
		for i = #pushes, 1, -1 do
			if pushes[i].channel == channel then
				return pushes[i].data
			end
		end
		return nil
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

	local mainScript = game:GetService("ServerScriptService"):FindFirstChild("Server"):FindFirstChild("Main")
	local started = false
	T.test("server: boots and builds the city", function()
		local t0 = os.clock()
		task.spawn(function()
			Engine.runScript(mainScript)
			started = true
		end)
		waitFor(function()
			return started
		end, 20, "server start")
		T.ok(Engine.workspace:FindFirstChild("City") ~= nil, "city")
		T.ok(Engine.workspace:FindFirstChild("Plots") ~= nil, "plots folder")
		print(string.format("    server boot %.1fs", os.clock() - t0))
	end)
	if not started then
		return
	end

	local Services = game:GetService("ServerScriptService").Server.Services
	local DataService = Engine.require(Services.DataService)
	local PlotService = Engine.require(Services.PlotService)
	local RepairService = Engine.require(Services.RepairService)
	local CustomerService = Engine.require(Services.CustomerService)
	local EmployeeService = Engine.require(Services.EmployeeService)
	local ThiefService = Engine.require(Services.ThiefService)
	local VehicleService = Engine.require(Services.VehicleService)
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local TechBot = Engine.mod("ReplicatedStorage.Shared.Repair.TechBot")
	local rf = game:GetService("ReplicatedStorage"):FindFirstChild("Remotes"):FindFirstChild("Request")
	local pps = game:GetService("ProximityPromptService")

	local player
	local function request(action: string, payload)
		return rf.OnServerInvoke(player, action, payload)
	end

	T.test("server: a joining player gets a save and a shop", function()
		player = Engine.addPlayer("Kaan")
		Engine.spawnCharacter(player)
		waitFor(function()
			return DataService.get(player) and PlotService.shopOf(player)
		end, 8, "shop")
		local shop = PlotService.shopOf(player)
		T.ok(shop.model:IsDescendantOf(Engine.workspace), "shop in the world")
		T.ok(#shop.benches >= 1, "benches")
		waitFor(function()
			return lastPush("data")
		end, 2, "data snapshot")
		T.ok(player:FindFirstChild("leaderstats") ~= nil, "leaderstats")
	end)

	T.test("server: a new shop opens by cutting the ribbon, then customers come", function()
		local shop = PlotService.shopOf(player)
		local p = DataService.get(player)
		T.ok(p.opened == false, "a new save starts closed")
		local ceremony = shop.model:FindFirstChild("GrandOpening")
		T.ok(ceremony ~= nil, "ribbon across the door")
		-- no customers before the opening
		CustomerService.ofShop(player).next = 0
		task.wait(1.5)
		T.eq(#CustomerService.ofShop(player).list, 0, "nobody comes to a closed shop")
		local prompt = ceremony:FindFirstChild("OpenPrompt", true)
		T.ok(prompt and prompt:GetAttribute("Owner") == player.UserId, "owner's prompt")
		-- someone else can't open it
		local other = Engine.addPlayer("Nosy")
		pps.PromptTriggered:Fire(prompt, other)
		T.ok(p.opened == false, "a stranger can't cut the ribbon")
		pps.PromptTriggered:Fire(prompt, player)
		T.ok(p.opened == true, "opened")
		waitFor(function()
			return lastPush("opened")
		end, 2, "opening pushed to the owner")
		T.ok(CustomerService.ofShop(player).next - os.clock() < 6, "first customer soon")
		other.Parent = nil
		game:GetService("Players").PlayerRemoving:Fire(other)
		-- saves from before the opening existed count as open
		local migrated = DataService._migrate({ v = 1, tutorial = 4, stats = { repairs = 3 } })
		T.ok(migrated.opened == true, "old saves are open")
		T.eq(migrated.tutorial, 5, "tutorial step renumbered")
		T.eq(DataService._migrate({ v = 1, tutorial = 6 }).tutorial, 99, "a finished tutorial stays finished")
		local fresh = DataService._migrate({ v = 1, tutorial = 1, stats = { repairs = 0 } })
		T.ok(fresh.opened == false and fresh.tutorial == 1, "a save that never started begins at the opening")
	end)

	local job
	T.test("server: a customer is served, the job repaired at the bench and paid", function()
		local p = DataService.get(player)
		local money0 = p.money
		-- let a customer in now
		CustomerService.ofShop(player).next = 0
		local cust = waitFor(function()
			local s = CustomerService.ofShop(player)
			return s and s.counter and s.counter.prompt and s.counter
		end, 10, "customer at the counter")
		pps.PromptTriggered:Fire(cust.prompt, player)
		local talk = waitFor(function()
			return lastPush("customer.talk")
		end, 3, "talk push")
		T.ok(type(talk.offer) == "number" and talk.offer > 0, "offer")
		if talk.kind == "sell" then
			T.ok(request("customer.reply", { id = talk.id, action = "reject" }).ok, "reject the shady deal")
			return
		end
		local r = request("customer.reply", { id = talk.id, action = "accept" })
		T.ok(r.ok, "accept: " .. tostring(r.err))
		job = waitFor(function()
			for _, j in RepairService.jobs(player) do
				return j
			end
			return nil
		end, 3, "job")
		-- sit at bench 1 and load the job
		local bench = PlotService.shopOf(player).benches[1]
		local prompt = bench:FindFirstChild("PromptAnchor"):FindFirstChildOfClass("ProximityPrompt")
		pps.PromptTriggered:Fire(prompt, player)
		waitFor(function()
			return RepairService.session(player)
		end, 3, "bench session")
		local loaded = request("bench.load", { job = job.id })
		T.ok(loaded.ok and loaded.view ~= nil, "bench.load")
		T.ok(bench:GetAttribute("DeviceView") ~= nil, "bench shows the device")
		-- a real action through the network handler
		local first = if job.device.kind == "desktop" then { "unscrew", "sp_s1", "hand" } else { "flip", nil, "hand" }
		local act = request("repair.act", { action = first[1], target = first[2], tool = first[3] })
		T.ok(act.ok, "repair.act: " .. tostring(act.reason or act.err))
		-- finish the repair with the bot (parts appear in the inventory as needed)
		local bot = TechBot.new(job.device, {
			ctx = function(_, _, tool)
				local c = RepairService.ctx(player, job, tool, nil)
				c.owned = setmetatable({}, { __index = function()
					return true
				end })
				c.usePaste = function()
					return 0.85
				end
				c.useSolder = function()
					return true
				end
				c.useTies = function()
					return true
				end
				local take = c.takePart
				c.takePart = function(source, partId, uid)
					if source == "inv" then
						DataService.addPart(player, partId, 1, "new")
					end
					return take(source, partId, uid)
				end
				return c
			end,
		})
		for _, fid in job.faults or {} do
			bot:fix(fid)
		end
		if job.requestId then
			if job.requestId == "build" then
				return -- build jobs are covered by the rules spec
			end
			bot:fulfil(job.requestId, job.request)
		end
		bot:reassemble()
		local fin = request("repair.finish")
		T.ok(fin.ok and fin.verdict.fixed, "fixed verdict: " .. tostring(fin.verdict and fin.verdict.stage))
		-- the customer comes back and pays
		waitFor(function()
			return lastPush("paid")
		end, 8, "payment")
		local paid = lastPush("paid")
		T.ok(not paid.failed, "customer happy")
		T.ok(p.money > money0, string.format("money went up (%d -> %d)", money0, p.money))
		T.ok(#p.reviews >= 1, "review written")
		request("bench.leave")
	end)

	T.test("server: parts depot, tools, used market", function()
		local p = DataService.get(player)
		p.money = 5000
		p.level = 3
		local CS = game:GetService("CollectionService")
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
		openService("parts")
		local open = lastPush("service.open")
		T.ok(open and #open.data.catalog > 100, "catalogue")
		local inv0 = #p.inv
		T.ok(request("market.buy", { id = "gpu_rtx3060" }).ok, "buy a GPU")
		T.eq(#p.inv, inv0 + 1, "inventory")
		T.ok(request("market.buy", { id = "paste_arctic_mx6" }).ok, "buy paste")
		T.ok((p.stock.paste_arctic_mx6 or 0) >= 5, "paste stock")
		openService("tools")
		T.ok(request("tools.buy", { id = "precision_kit" }).ok, "buy a tool")
		T.ok(p.tools.precision_kit, "tool owned")
		openService("used")
		local item = p.inv[1]
		local sold = request("market.sell", { uid = item.uid })
		T.ok(sold.ok and sold.price > 0, "sell to the used market")
	end)

	T.test("server: buy a car and call it", function()
		local p = DataService.get(player)
		p.money = 100000
		p.level = 5
		T.ok(request("vehicle.buy", { id = "sahin", color = 2 }).ok, "buy Şahin")
		local r = request("vehicle.spawn", { id = "sahin" })
		T.ok(r.ok, "spawn: " .. tostring(r.err))
		local v = VehicleService.active(player)
		T.ok(v and v.PrimaryPart and v.PrimaryPart:FindFirstChild("Drive"), "drivable vehicle")
		request("vehicle.despawn")
	end)

	T.test("server: a hired technician repairs a job on his own", function()
		local p = DataService.get(player)
		p.money = 100000
		p.tools.usb_boot = true
		p.shop.level = 2
		PlotService.build(player)
		EmployeeService.stepScale = 0
		pushes = {}
		T.ok(EmployeeService ~= nil, "service")
		-- hire the first technician candidate
		local agency
		for _, s in pairs(game:GetService("CollectionService"):GetTagged("ServicePoint")) do
			if s:GetAttribute("Service") == "staff" then
				agency = s
			end
		end
		player.Character:PivotTo(agency.CFrame)
		pps.PromptTriggered:Fire(agency:FindFirstChildOfClass("ProximityPrompt"), player)
		local list = waitFor(function()
			return lastPush("staff.open")
		end, 3, "agency")
		local tech
		for _, c in list.candidates do
			if c.role == "technician" then
				tech = c
				break
			end
		end
		T.ok(tech ~= nil, "a technician candidate")
		local h = request("staff.hire", { uid = tech.uid })
		T.ok(h.ok, "hire: " .. tostring(h.err))
		-- give him a simple job and stock the parts he might need
		local dev = DeviceGen.desktop(Mock.Random.new(3), "mid")
		DeviceGen.applyFault(dev, "virus", Mock.Random.new(4))
		local j = RepairService.createJob(player, { device = dev, faults = { "virus" }, kind = "repair", price = 80, customer = nil })
		T.ok(j ~= nil, "job")
		waitFor(function()
			return j.status == "ready"
		end, 20, "technician finished")
		T.ok(j.verdict and j.verdict.fixed, "fixed by the technician")
	end)

	T.test("server: thieves can be caught", function()
		local p = DataService.get(player)
		p.money = 3000
		p.level = 3
		task.spawn(ThiefService.visit, player)
		local thief = waitFor(function()
			for _, d in Engine.workspace.NPCs:GetChildren() do
				if d:GetAttribute("Thief") and d.PrimaryPart and d.PrimaryPart:FindFirstChild("CatchPrompt") then
					return d
				end
			end
			return nil
		end, 10, "thief stealing")
		pps.PromptTriggered:Fire(thief.PrimaryPart.CatchPrompt, player)
		T.ok(p.stats.caught >= 1, "caught counted")
		T.ok(p.money >= 3000, "nothing lost")
	end)

	T.test("server: night security — the bat, floodlights, alarm, the dog, police footage, insurance", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local CS = game:GetService("CollectionService")
		local p = DataService.get(player)
		p.money = 100000
		p.level = 5
		-- the bat from the hardware store lands in the backpack
		for _, a in CS:GetTagged("ServicePoint") do
			if a:GetAttribute("Service") == "tools" then
				player.Character:PivotTo(a.CFrame)
				pps.PromptTriggered:Fire(a:FindFirstChildOfClass("ProximityPrompt"), player)
				break
			end
		end
		T.ok(request("gear.buy", { id = "bat" }).ok, "buy the bat")
		local bat = waitFor(function()
			for _, t in player:FindFirstChildOfClass("Backpack"):GetChildren() do
				if t:IsA("Tool") and t:GetAttribute("Gear") == "bat" then
					return t
				end
			end
			return nil
		end, 3, "the bat in the backpack")
		T.ok(bat:FindFirstChild("Handle") ~= nil, "bat handle")
		-- every countermeasure, each one visible in the shop
		for _, id in { "motion_lights", "alarm", "steel_door", "cctv_hd", "guard_dog", "panic_button", "insurance" } do
			T.ok(request("shop.buyItem", { id = id }).ok, "buy " .. id)
		end
		local found = {}
		for _, d in PlotService.shopOf(player).model:GetDescendants() do
			for _, tag in { "Floodlight", "AlarmLight", "GuardDog" } do
				if d:HasTag(tag) then
					found[tag] = d
				end
			end
			if d.Name == "CCTVMonitor" or d.Name == "PanicButton" then
				found[d.Name] = d
			end
		end
		for _, what in { "Floodlight", "AlarmLight", "GuardDog", "CCTVMonitor", "PanicButton" } do
			T.ok(found[what] ~= nil, what .. " in the shop")
		end
		-- loaded dice: `roll` is every chance the thieves and the owner get
		local roll = 0
		ThiefService._setRng({
			NextNumber = function()
				return roll
			end,
			NextInteger = function(_, a)
				return a
			end,
		})
		local steal, brk, delay = Config.ThiefStealSeconds, ThiefService.breakSeconds, ThiefService.policeDelay
		Config.ThiefStealSeconds = 0.2
		ThiefService.policeDelay = 0.2
		local function toast(key: string)
			for i = #pushes, 1, -1 do
				local d = pushes[i]
				if d.channel == "toast" and d.data.key == key then
					return d.data
				end
			end
			return nil
		end

		-- a burglar walks up in the night: the floodlights blaze and he thinks again
		pushes = {}
		roll = 0
		ThiefService.burgle(player)
		waitFor(function()
			return toast("burglar_scared")
		end, 6, "the floodlights scare him off")
		T.ok(found.Floodlight:GetAttribute("Flash") ~= nil, "the floodlights flash")

		-- one who isn't scared forces the steel door; the alarm goes off; a swing of the bat ends it
		pushes = {}
		roll = 0.99
		ThiefService.breakSeconds = 3
		local before = {}
		for _, d in Engine.workspace.NPCs:GetChildren() do
			before[d] = true
		end
		ThiefService.burgle(player)
		local burglar = waitFor(function()
			for _, d in Engine.workspace.NPCs:GetChildren() do
				if not before[d] and d:GetAttribute("Burglar") and d.PrimaryPart and d.PrimaryPart:FindFirstChild("CatchPrompt") then
					return d
				end
			end
			return nil
		end, 5, "the burglar at the door")
		T.ok(toast("burglar_camera") ~= nil, "the cameras see him")
		waitFor(function()
			return toast("alarm")
		end, 4, "the alarm goes off")
		T.ok(found.AlarmLight:GetAttribute("Alarm") ~= nil, "the alarm lights flash")
		T.ok(found.AlarmLight:FindFirstChild("Security_alarm") ~= nil, "the siren sounds")
		local caught0 = p.stats.caught
		bat.Parent = player.Character
		player.Character:PivotTo(burglar.PrimaryPart.CFrame * roblox.CFrame.new(0, 0, 3))
		bat.Activated:Fire()
		T.ok(toast("bat_hit") ~= nil, "hit with the bat")
		T.eq(p.stats.caught, caught0 + 1, "caught")
		bat.Parent = player:FindFirstChildOfClass("Backpack")

		-- one gets away with the till: the insurance pays 70 % of it
		pushes = {}
		ThiefService.breakSeconds = 0.2
		ThiefService.burgle(player)
		local paid = waitFor(function()
			return toast("insurance_paid")
		end, 8, "the insurance pays")
		local gone = toast("thief_escaped")
		T.ok(gone and gone.vars.cash > 0, "the till was emptied")
		T.eq(paid.vars.amount, math.floor(gone.vars.cash * 0.7), "70 % back")

		-- a shoplifter runs out of the door into Karabaş
		pushes = {}
		roll = 0
		ThiefService.visit(player)
		local dog = waitFor(function()
			return toast("thief_caught")
		end, 8, "the dog catches him")
		T.ok(string.find(dog.vars.by, "Karabaş", 1, true) ~= nil, "caught by Karabaş")

		-- another slips past the dog and the police at the door, but the police find him on the
		-- HD footage and bring the cash back
		pushes = {}
		roll = 0.7
		ThiefService.visit(player)
		local back = waitFor(function()
			return toast("police_recovered")
		end, 8, "the police bring it back")
		local ran = toast("thief_escaped")
		T.ok(ran and ran.vars.cash > 0, "cash taken")
		T.eq(back.vars.amount, ran.vars.cash, "all of it back")

		ThiefService._setRng(nil)
		Config.ThiefStealSeconds, ThiefService.breakSeconds, ThiefService.policeDelay = steal, brk, delay
	end)

	T.test("server: people wear real catalog avatars that match their names", function()
		local Avatars = Engine.mod("ReplicatedStorage.Shared.Data.Avatars")
		local Customers = Engine.mod("ReplicatedStorage.Shared.Data.Customers")
		local NpcService = Engine.require(Services.NpcService)
		local templates = game:GetService("ServerStorage"):FindFirstChild("NpcTemplates")
		waitFor(function()
			return templates and templates:GetAttribute("Ready")
		end, 30, "avatar templates")
		-- every look has an avatar for each gender it can have
		for look, def in Avatars.OUTFITS do
			for _, g in { "m", "f" } do
				local share = if g == "f" then def.female else 1 - def.female
				if share > 0 then
					T.ok(templates:FindFirstChild(look .. "_" .. g) ~= nil, "template " .. look .. "_" .. g)
				end
			end
		end
		local street = game:GetService("ReplicatedStorage"):FindFirstChild("Avatars")
		T.ok(street and #street:GetChildren() == 24, "street avatars for the clients")
		for _, m in street:GetChildren() do
			T.ok(m:FindFirstChildOfClass("Humanoid") and m:FindFirstChild("HumanoidRootPart"), "street avatar rig " .. m.Name)
			T.ok(type(m:GetAttribute("Hip")) == "number", "hip height for posing " .. m.Name)
		end
		-- every description only uses the curated catalog items, with a sensible layer order
		local known = {}
		for _, id in Avatars.allIds() do
			known[id] = true
		end
		known[Avatars.MOOD] = true
		local dressed = {}
		for _, d in Engine.descriptions do
			if #d:GetAccessories(true) > 0 then -- (the plain stand-in rigs have none)
				table.insert(dressed, d)
			end
		end
		T.ok(#dressed >= 80, "avatars built: " .. #dressed)
		for _, d in dressed do
			for _, prop in { "Torso", "LeftArm", "RightArm", "LeftLeg", "RightLeg", "Head" } do
				T.ok(known[d[prop]], prop .. " " .. tostring(d[prop]))
			end
			local shoes, top = 0, 0
			for _, a in d:GetAccessories(true) do
				T.ok(known[a.AssetId], "item " .. a.AssetId)
				local t = a.AccessoryType.Name
				if t == "LeftShoe" or t == "RightShoe" then
					shoes += 1
				elseif t == "TShirt" or t == "Shirt" or t == "Sweater" or t == "Jacket" then
					top += 1
				end
			end
			T.ok(shoes == 2 and top >= 1, "dressed: shoes " .. shoes .. ", tops " .. top)
		end
		-- a spawned customer is a copy of a real avatar of the right gender
		local npc = NpcService.spawn({ look = "aunt", gender = "f", name = "Ayşe Teyze", cf = roblox.CFrame.new(0, 10, 0) })
		T.ok(npc:GetAttribute("Look") == "aunt" and npc:GetAttribute("Gender") == "f", "aunt avatar")
		T.ok(npc:FindFirstChildWhichIsA("Accessory") ~= nil, "wears catalog items")
		NpcService.despawn(npc)
		-- names follow the archetype's gender (an auntie is a woman, an uncle a man)
		local rng = Mock.Random.new(5)
		local women = {}
		for _, n in Customers.firstNames.f do
			women[n] = true
		end
		for _ = 1, 40 do
			local name, g = Customers.randomName(rng, false, Customers.byId.aunt.gender)
			T.ok(g == "f" and women[string.match(name, "^(%S+)")], "aunt name " .. name)
			local fname, fg = Customers.randomName(rng, true, "m")
			T.ok(fg == "m" and table.find(Customers.foreignNames.first.m, string.match(fname, "^(%S+)")) ~= nil, "foreign man " .. fname)
		end
		T.ok(Customers.byId.uncle.gender == "m" and Customers.byId.grandpa.gender == "m", "uncle and grandpa are men")
		-- outfits are reproducible from a seed
		local a1 = Avatars.outfit("business", Mock.Random.new(9))
		local a2 = Avatars.outfit("business", Mock.Random.new(9))
		T.ok(a1.head == a2.head and a1.hair == a2.hair and #a1.items == #a2.items, "seeded outfit")
	end)

	T.test("server: leaving frees the plot", function()
		local id = PlotService.shopOf(player).plotId
		player.Parent = nil
		game:GetService("Players").PlayerRemoving:Fire(player)
		task.wait(0.1)
		T.ok(PlotService.ownerOf(id) == nil, "plot free")
		T.ok(Engine.workspace.Plots:FindFirstChild("Plot_" .. id):FindFirstChildWhichIsA("Model") ~= nil, "empty lot rebuilt")
	end)
	_ = roblox
end
