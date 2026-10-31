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
	-- (the people of the city walk ten times as fast: a test should not wait for a stroll)
	Engine.mod("ReplicatedStorage.Shared.Config").NpcSpeedScale = 10
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
	local Employees = Engine.mod("ReplicatedStorage.Shared.Data.Employees")
	local rf = game:GetService("ReplicatedStorage"):FindFirstChild("Remotes"):FindFirstChild("Request")
	local pps = game:GetService("ProximityPromptService")

	local player
	local function request(action: string, payload)
		return rf.OnServerInvoke(player, action, payload)
	end

	T.test("server: somebody stands behind every counter where the player shops, types at the till and says hello", function()
		local MarketService = Engine.require(game:GetService("ServerScriptService").Server.Services.MarketService)
		local CS = game:GetService("CollectionService")
		local clerks = MarketService.clerks()
		local counters, services = 0, {}
		for _, anchor in CS:GetTagged("ServicePoint") do
			if anchor:GetAttribute("ClerkCF") ~= nil then
				counters += 1
				local clerk = clerks[anchor]
				T.ok(clerk ~= nil and clerk.Parent ~= nil, "no clerk at " .. tostring(anchor:GetAttribute("Poi")) .. " / " .. tostring(anchor:GetAttribute("Service")))
				if clerk then
					services[anchor:GetAttribute("Service")] = true
					local at = anchor:GetAttribute("ClerkCF").Position
					local root = clerk.PrimaryPart
					local flat = root.Position - roblox.Vector3.new(at.X, root.Position.Y, at.Z)
					T.ok(flat.Magnitude < 1, "the clerk stands at the counter: " .. string.format("%.1f", flat.Magnitude))
					-- on the floor behind the counter, not in the air or sunk in it
					local hum = clerk:FindFirstChildOfClass("Humanoid")
					local standing = hum.HipHeight + root.Size.Y / 2
					T.ok(math.abs(root.Position.Y - (at.Y + standing)) < 0.3, "the clerk stands on the floor, not on the counter or in the air: " .. string.format("%.2f vs %.2f", root.Position.Y - at.Y, standing))
					-- facing the customers on the other side of the counter
					T.ok(root.CFrame.LookVector:Dot(anchor:GetAttribute("ClerkCF").LookVector) > 0.9, "facing the customers")
					T.eq(clerk:GetAttribute("Doing"), "register", "typing at the till")
				end
			end
		end
		T.ok(counters >= 12, "counters: " .. counters)
		for _, need in { "parts", "parts_bazaar", "used", "tools", "scrap", "cars", "bikes", "bicycles", "contracts", "factory", "staff", "realty" } do
			T.ok(services[need], "a clerk for the " .. need .. " counter")
		end
	end)

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

	T.test("server: the shops and the lots for rent stay off the road", function()
		local Geometry = require("../lib/Geometry")
		local CityLayout = Engine.mod("ReplicatedStorage.Shared.World.CityLayout")
		local hits, checked = Geometry.solidsInRoad(Engine.workspace.Plots, Geometry.carriageways(CityLayout.get()), CityLayout.ROAD_Y)
		for k = 1, math.min(#hits, 8) do
			print("      in the road:", hits[k])
		end
		T.ok(checked > 500, "solid parts of the plots checked: " .. checked)
		T.ok(#hits == 0, #hits .. " solid parts of the plots stand in a carriageway")
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
		-- a newcomer's first customer brings a simple desktop with a well-known fault
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		T.eq(job.device.kind, "desktop", "the first job is a desktop")
		T.eq(job.kind, "repair", "the first job is a plain repair")
		for _, fid in job.faults do
			T.ok(table.find(Config.EasyFaults, fid) ~= nil, "an easy first fault: " .. fid)
		end
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

	T.test("server: hiring or firing somebody does not strand the job another technician is working on", function()
		local p = DataService.get(player)
		p.money = 100000
		p.tools.usb_boot = true
		p.shop.level = 4
		p.staff = {}
		PlotService.build(player)
		-- (a little time per step, so the first technician is in the middle of the repair when the next arrives)
		EmployeeService.stepScale = 0.12
		pushes = {}
		EmployeeService.openAgency(player, "agency")
		local people = {}
		for _, c in lastPush("staff.open").candidates do
			local role = Employees.roles[c.role]
			if role and role.bench and (role.minShop or 1) <= 4 and not role.maxDifficulty and #people < 2 then
				table.insert(people, c)
			end
		end
		T.eq(#people, 2, "two bench workers to hire")
		T.ok(request("staff.hire", { uid = people[1].uid }).ok, "the first hire")
		-- what the people at work look like to everybody: the step they are on drives the hands, a tool
		-- is in the hand and a line under the name says what they are doing
		local CollectionService = game:GetService("CollectionService")
		local doing, tools, lines = {}, {}, {}
		local function watch()
			for _, m in CollectionService:GetTagged("Staff") do
				local d = m:GetAttribute("Doing")
				if d then
					doing[d] = true
				end
				local held = m:FindFirstChild("HeldTool")
				if held then
					tools[held:GetAttribute("Tool")] = true
					T.ok(held:FindFirstChildWhichIsA("WeldConstraint", true) ~= nil, "the tool is attached to the hand")
				end
				local head = m:FindFirstChild("Head")
				local tag = head and head:FindFirstChild("StatusTag")
				local label = tag and tag:FindFirstChild("Label")
				if label and label.Text ~= "" then
					lines[label.Text] = true
				end
			end
		end
		local dev = DeviceGen.desktop(Mock.Random.new(11), "mid")
		DeviceGen.applyFault(dev, "virus", Mock.Random.new(12))
		local j = RepairService.createJob(player, { device = dev, faults = { "virus" }, kind = "repair", price = 80, customer = nil })
		waitFor(function()
			watch()
			return j.status == "bench"
		end, 20, "the first technician starts")
		-- somebody else joins the team in the middle of it
		T.ok(request("staff.hire", { uid = people[2].uid }).ok, "the second hire")
		waitFor(function()
			watch()
			return j.status == "ready"
		end, 40, "the job is finished by somebody")
		T.ok(j.verdict and j.verdict.fixed, "fixed")
		local n = 0
		for _ in doing do
			n += 1
		end
		T.ok(n >= 2, "the hands were given different steps to do: " .. n)
		T.ok(next(tools) ~= nil, "a tool was in the hand")
		T.ok(next(lines) ~= nil, "a line told what they were doing")
		local known = {}
		for _, phrase in EmployeeService.PHRASES do
			known[phrase] = true
		end
		for line in lines do
			T.ok(known[line], "an unknown line: " .. line)
		end
		-- afterwards the hands rest, the tool is down and the line is gone
		task.wait(0.3)
		for _, m in CollectionService:GetTagged("Staff") do
			T.eq(m:GetAttribute("Doing"), nil, "nothing left to do")
			T.ok(m:FindFirstChild("HeldTool") == nil, "the tool is put down")
		end
		-- both benches are free again, nobody is stuck at a bench with no one to work it
		waitFor(function()
			return RepairService.freeBench(player) == 1
		end, 5, "the first bench is free")
		EmployeeService.stepScale = 0
		p.staff = {}
		PlotService.build(player)
	end)

	T.test("server: one technician works through a whole queue of mixed jobs, one after the other, and never gets stuck", function()
		local Tools = Engine.mod("ReplicatedStorage.Shared.Data.Tools")
		local p = DataService.get(player)
		p.money = 100000
		p.shop.level = 4
		for _, t in Tools.list do
			p.tools[t.id] = true
		end
		local function rec(role: string, uid: string)
			return { uid = uid, role = role, name = role, gender = "m", skill = 4, wage = 100, trait = "calm", trait2 = "punctual", edu = "highschool", morale = 80, days = 0, xp = 0, look = 3 }
		end
		-- (a manager keeps the parts coming, as a real shop would)
		p.staff = { rec("technician", "q_tech"), rec("manager", "q_boss") }
		PlotService.build(player)
		EmployeeService.stepScale = 0.02
		local rng = Mock.Random.new(21)
		local jobs = {}
		local function add(dev, faults, requestId, request)
			local j = RepairService.createJob(player, { device = dev, faults = faults, requestId = requestId, request = request, kind = if requestId then "request" else "repair", price = 120, customer = nil })
			T.ok(j ~= nil, "a job was created")
			table.insert(jobs, j)
		end
		for _, fid in { "dust", "ram_unseated", "virus" } do
			local dev = DeviceGen.desktop(rng, "mid")
			DeviceGen.applyFault(dev, fid, rng)
			add(dev, { fid })
		end
		do
			local dev = DeviceGen.desktop(rng, "office")
			local req = DeviceGen.applyRequest(dev, "upgrade_ram", rng, 600)
			add(dev, {}, "upgrade_ram", req)
			local dev2 = DeviceGen.desktop(rng, "mid")
			local req2 = DeviceGen.applyRequest(dev2, "maintenance", rng, 600)
			add(dev2, {}, "maintenance", req2)
		end
		local t0 = os.clock()
		local last = 0
		-- whoever is repairing sits on the stool of their bench, right at the desk
		local CollectionService = game:GetService("CollectionService")
		local working, seated = 0, 0
		local shop = PlotService.shopOf(player)
		waitFor(function()
			for _, m in CollectionService:GetTagged("Staff") do
				if m:GetAttribute("Doing") and m:GetAttribute("Staff") == "technician" and m.PrimaryPart then
					working += 1
					for _, bench in shop.benches do
						local stool = bench:FindFirstChild("Stool")
						if stool and (m.PrimaryPart.Position - stool.Position).Magnitude < 3 and m.PrimaryPart.Position.Y > stool.Position.Y then
							seated += 1
							break
						end
					end
				end
			end
			local ready = 0
			for _, j in jobs do
				if j.status == "ready" then
					ready += 1
				end
			end
			if ready ~= last then
				last = ready
				print(string.format("    %d of %d jobs done after %.0f s", ready, #jobs, os.clock() - t0))
			end
			return ready == #jobs
		end, 90, "the technician to finish all " .. #jobs .. " jobs")
		for _, j in jobs do
			T.ok(j.verdict ~= nil, "judged")
		end
		T.ok(working >= 3, "the technician was seen at work: " .. working)
		T.ok(seated >= working * 0.9, "at work he sits on the stool at the bench: " .. seated .. " of " .. working)
		T.ok(RepairService.freeBench(player) == 1, "the bench is free again")
		EmployeeService.stepScale = 0
		p.staff = {}
		PlotService.build(player)
	end)

	T.test("server: front staff and free technicians come to the counter, face the customer and type while they serve", function()
		local CollectionService = game:GetService("CollectionService")
		local p = DataService.get(player)
		p.shop.level = 4
		local function rec(role: string, uid: string)
			return { uid = uid, role = role, name = role, gender = "f", skill = 3, wage = 100, trait = "calm", trait2 = "punctual", edu = "highschool", morale = 70, days = 0, xp = 0, look = 7 }
		end
		local function staffModel(role: string)
			for _, m in CollectionService:GetTagged("Staff") do
				if m:GetAttribute("Staff") == role then
					return m
				end
			end
			return nil
		end
		local old = EmployeeService.counterDelay
		EmployeeService.counterDelay = 2.5
		for _, role in { "receptionist", "technician" } do
			p.staff = { rec(role, role .. "_1") }
			PlotService.build(player)
			local who = waitFor(function()
				return staffModel(role)
			end, 5, role .. " in the shop")
			local counterBack = PlotService.shopOf(player).points:FindFirstChild("CounterBack")
			local customer = { state = "queue", arch = {}, model = nil }
			CustomerService.atCounter:Fire(player, customer)
			waitFor(function()
				return who:GetAttribute("Doing") == "register"
			end, 3, role .. " takes the counter")
			local head = who:FindFirstChild("Head")
			local label = head and head:FindFirstChild("StatusTag") and head.StatusTag:FindFirstChild("Label")
			T.ok(label ~= nil and label.Text == "Serving a customer", role .. " says what they are doing")
			-- (while serving they take no job from the queue)
			T.ok(EmployeeService.counterStaff(player) == false, "the counter is taken")
			-- after the customer is dealt with the hands rest and the person goes back
			waitFor(function()
				return who:GetAttribute("Doing") == nil
			end, 8, role .. " is done at the counter")
			T.ok(EmployeeService.counterStaff(player), role .. " is free again")
			T.ok(counterBack ~= nil, "a counter to stand behind")
		end
		EmployeeService.counterDelay = old
		p.staff = {}
		PlotService.build(player)
	end)

	T.test("server: settings are checked and the difficulty changes the numbers", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local p = DataService.get(player)
		T.eq(CustomerService.difficultyOf(player).pay, 1, "normal by default")
		T.ok(request("settings.set", { difficulty = "hard", music = 0.2, fov = 80, help = "off", shadows = false }).ok, "settings.set")
		T.eq(p.settings.difficulty, "hard", "hard")
		T.eq(CustomerService.difficultyOf(player).pay, Config.Difficulty.hard.pay, "hard pays more")
		T.ok(CustomerService.difficultyOf(player).spawn < 1, "hard brings customers faster")
		T.eq(p.settings.music, 0.2, "volume")
		T.eq(p.settings.fov, 80, "fov")
		T.eq(p.settings.help, "off", "help")
		T.eq(p.settings.shadows, false, "a switch")
		-- nonsense is ignored
		request("settings.set", { difficulty = "impossible", fov = 5000, music = "loud", help = {}, quality = 7 })
		T.eq(p.settings.difficulty, "hard", "unknown difficulty ignored")
		T.eq(p.settings.fov, 80, "fov out of range ignored")
		T.eq(p.settings.music, 0.2, "bad volume ignored")
		T.eq(p.settings.quality, "high", "bad quality ignored")
		request("settings.set", { difficulty = "normal", help = "guided" })
		request("settings.set", { help = "bogus" })
		T.eq(p.settings.help, "guided", "help back")
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

	T.test("server: with a receptionist and a technician on duty a whole visit runs without the owner: counter, repair, pickup, payment", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local p = DataService.get(player)
		p.money = 5000
		p.level = 5
		p.shop.level = 4
		p.opened = true
		p.stats.repairs = math.max(p.stats.repairs or 0, Config.LearningRepairs)
		local function rec(role: string, uid: string)
			return { uid = uid, role = role, name = role, gender = "f", skill = 4, wage = 100, trait = "calm", trait2 = "punctual", edu = "highschool", morale = 80, days = 0, xp = 0, look = 9 }
		end
		p.staff = { rec("receptionist", "e2e_r"), rec("technician", "e2e_t") }
		PlotService.build(player)
		local old, oldDelay = EmployeeService.stepScale, EmployeeService.counterDelay
		EmployeeService.stepScale = 0
		EmployeeService.counterDelay = 0.5
		-- the owner is nowhere near the counter
		player.Character:PivotTo(roblox.CFrame.new(5000, 20, 5000))
		local repairs0, money0 = p.stats.repairs, p.money
		local s = CustomerService.ofShop(player)
		s.next = 0
		-- whoever comes (the odd seller of stolen goods is sent away), somebody ends up served and the
		-- device repaired and paid for without the owner touching a thing
		waitFor(function()
			if p.stats.repairs > repairs0 then
				return true
			end
			if (s.next or 0) > os.clock() + 20 then
				s.next = 0
			end
			return false
		end, 60, "a customer served, repaired and paid with nobody but the staff")
		T.ok(p.money > money0 or p.stats.repairs > repairs0, "paid")
		EmployeeService.stepScale, EmployeeService.counterDelay = old, oldDelay
		p.staff = {}
		PlotService.build(player)
		player.Character:PivotTo(PlotService.shopOf(player).points.Outside.CFrame)
	end)

	T.test("server: a shoplifter wears a mask, creeps in round the end of the counter, rummages in the till quietly and runs with a sack", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local p = DataService.get(player)
		p.money = 3000
		p.level = 3
		local old = Config.ThiefStealSeconds
		Config.ThiefStealSeconds = 0.8
		local shop = PlotService.shopOf(player)
		local floorY = shop.points.CounterFront.Position.Y
		local robbed0, money0 = p.stats.robbed, p.money
		-- (the last test's thief is still being led away)
		local before = {}
		for _, d in Engine.workspace.NPCs:GetChildren() do
			before[d] = true
		end
		task.spawn(ThiefService.visit, player)
		local thief = waitFor(function()
			for _, d in Engine.workspace.NPCs:GetChildren() do
				if d:GetAttribute("Thief") and not before[d] then
					return d
				end
			end
			return nil
		end, 10, "a thief to turn up")
		-- the face is behind a ski mask with a slit for the eyes
		local knit = 0
		for _, d in thief:GetDescendants() do
			if d.Name == "Balaclava" then
				knit += 1
			end
		end
		T.ok(knit >= 5, "a balaclava on the head: " .. knit)
		-- no name tag while creeping: nobody announces themselves
		T.ok(thief.Head:FindFirstChild("NameTag") == nil, "no name above a thief")
		local sneaked, rummaged, sack, tallest, spoke, crouched = false, false, false, 0, false, false
		waitFor(function()
			if not thief.Parent then
				return true
			end
			if thief:GetAttribute("Sneaking") then
				sneaked = true
				-- (creeping low: the hips are down, the client bends the knees by as much)
				if (thief:GetAttribute("Crouch") or 0) > 0.3 then
					crouched = true
				end
			end
			if thief:GetAttribute("Doing") == "rummage" then
				rummaged = true
				T.ok(thief.PrimaryPart:FindFirstChild("CatchPrompt") ~= nil, "can be caught while at the till")
			end
			if thief:FindFirstChild("Carried") then
				sack = true
			end
			if thief.Head:FindFirstChild("Bubble") then
				spoke = true
			end
			if thief.PrimaryPart then
				tallest = math.max(tallest, thief.PrimaryPart.Position.Y - floorY)
			end
			return false
		end, 40, "the thief to be off")
		Config.ThiefStealSeconds = old
		T.ok(sneaked, "he crept in")
		T.ok(crouched, "crouched, not standing up straight")
		T.ok(rummaged, "he went through the till")
		T.ok(sack, "he ran off with a sack")
		T.ok(not spoke, "not a word while sneaking")
		-- standing on the floor all the way: never up on the counter top
		T.ok(tallest < 6, "he stayed off the counter: highest " .. string.format("%.1f", tallest))
		T.ok(p.money < money0 and p.stats.robbed > robbed0, "he got away with some of the till")
	end)

	T.test("server: night security — the bat, floodlights, alarm, the dog, police footage, insurance", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local CS = game:GetService("CollectionService")
		local p = DataService.get(player)
		p.money = 100000
		p.level = 5
		-- (something worth taking in the stockroom: the earlier tests may have used everything up)
		DataService.addPart(player, "gpu_rtx3060", 1, "new")
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

		-- a shoplifter runs out of the door into Buddy
		pushes = {}
		roll = 0
		ThiefService.visit(player)
		local dog = waitFor(function()
			return toast("thief_caught")
		end, 8, "the dog catches him")
		T.ok(string.find(dog.vars.by, "Buddy", 1, true) ~= nil, "caught by Buddy")

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

	T.test("server: people are built from parts, every one different, and match their roles", function()
		local Config = Engine.mod("ReplicatedStorage.Shared.Config")
		local Avatars = Engine.mod("ReplicatedStorage.Shared.Data.Avatars")
		local Customers = Engine.mod("ReplicatedStorage.Shared.Data.Customers")
		local NpcService = Engine.require(Services.NpcService)
		T.eq(Config.RealisticNpcs, false, "the catalog's pale bodies stay off")
		local street = game:GetService("ReplicatedStorage"):FindFirstChild("Avatars")
		waitFor(function()
			return street and #street:GetChildren() >= Config.StreetPeople
		end, 30, "street people")
		T.ok(#street:GetChildren() == Config.StreetPeople, "street people for the clients: " .. #street:GetChildren())
		for _, m in street:GetChildren() do
			T.ok(m:FindFirstChildOfClass("Humanoid") and m:FindFirstChild("HumanoidRootPart"), "street person rig " .. m.Name)
			T.ok(type(m:GetAttribute("Hip")) == "number" and m:GetAttribute("Plain") == true, "hip height and parts for " .. m.Name)
		end
		-- a spawned customer is dressed for the role and the gender asked for
		local npc = NpcService.spawn({ look = "aunt", gender = "f", name = "Ayşe Teyze", cf = roblox.CFrame.new(0, 10, 0) })
		T.ok(npc:GetAttribute("Look") == "aunt" and npc:GetAttribute("Gender") == "f", "aunt look")
		local parts = 0
		for _, d in npc:GetDescendants() do
			if d:IsA("BasePart") then
				parts += 1
			end
		end
		T.ok(parts > 18, "wears hair, clothes and accessories: " .. parts .. " parts")
		-- gestures: a wave and a dance play once and the person goes back to standing around
		T.eq(#NpcService.Emotes.dance, 9, "nine dance takes")
		for _, name in { "wave", "point", "cheer", "laugh", "shrug", "tilt", "salute", "hello" } do
			T.ok(NpcService.Emotes[name] ~= nil and #NpcService.Emotes[name] >= 1, "emote " .. name)
		end
		NpcService.emote(npc, "wave", 0.3)
		T.eq(npc:GetAttribute("Anim"), "emote:wave", "waving")
		NpcService.emote(npc, "dance", 0.3)
		T.eq(npc:GetAttribute("Anim"), "emote:wave", "one gesture at a time")
		task.wait(0.6)
		T.eq(npc:GetAttribute("Anim"), "idle", "back to idling")
		NpcService.emote(npc, "dance", 0.3)
		T.eq(npc:GetAttribute("Anim"), "emote:dance", "dancing")
		task.wait(0.6)
		T.eq(npc:GetAttribute("Anim"), "idle", "and back again")
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
