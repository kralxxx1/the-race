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
