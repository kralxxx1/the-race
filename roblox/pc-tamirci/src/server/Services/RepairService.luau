-- RepairService: jobs (customer devices and your own projects), workbenches and every repair action.
--
-- A job's device lives on the server with its hidden faults. When a job sits on a bench, the
-- bench model carries the client-safe view (RepairRules.view) as a JSON attribute so every
-- player sees the device; the technician at the bench sends actions through "repair.act", which
-- runs RepairRules.apply here with the player's real tools, parts and consumables.

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Faults = require(Shared.Data.Faults)
local Upgrades = require(Shared.Data.Upgrades)
local Rules = require(Shared.Repair.RepairRules)
local DeviceGen = require(Shared.Repair.DeviceGen)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)

local RepairService = {}
RepairService.jobFinished = Signal.new() -- (player, job) the device is ready for pickup
RepairService.jobRemoved = Signal.new() -- (player, jobId)

local V = Net.V
local jobs: { [Player]: { [string]: any } } = {}
local nextId = 0
local sessions: { [Player]: { [string]: any } } = {}
local benches: { [Player]: { [number]: { [string]: any } } } = {}
local rng = Random.new()

local MAX_JOBS = 12

----------------------------------------------------------------------------------------------------
-- Jobs
----------------------------------------------------------------------------------------------------
local function jobList(player: Player)
	local t = jobs[player]
	if not t then
		t = {}
		jobs[player] = t
	end
	return t
end

-- What the client may know about a job (no hidden faults, no device internals).
function RepairService.summary(job)
	local symptoms = {}
	local lang = job.lang or "tr"
	for _, fid in job.faults or {} do
		local f = Faults.get(fid)
		if f then
			table.insert(symptoms, { diag = f.diag, text = job.complaint and job.complaint[fid] or "" })
		end
	end
	return {
		id = job.id,
		kind = job.kind,
		own = job.own,
		name = job.name,
		customer = job.customer and { name = job.customer.name, arch = job.customer.arch } or nil,
		complaint = job.text,
		requestId = job.requestId,
		request = job.request,
		price = job.price,
		status = job.status,
		bench = job.bench,
		deadline = job.deadline,
		device = job.device.kind,
		model = job.device.model,
		tools = job.tools,
		lang = lang,
		symptoms = symptoms,
		blocked = job.blocked and { reason = job.blocked.reason, detail = job.blocked.detail, by = job.blocked.by } or nil,
		-- own projects: what the second-hand dealer would pay right now
		resale = if job.own and job.status ~= "bench" then RepairService.resale(job) else nil,
	}
end

function RepairService.jobs(player: Player)
	return jobList(player)
end

function RepairService.job(player: Player, id: string)
	return jobList(player)[id]
end

function RepairService.summaries(player: Player)
	local out = {}
	for _, job in jobList(player) do
		table.insert(out, RepairService.summary(job))
	end
	table.sort(out, function(a, b)
		return a.id < b.id
	end)
	return out
end

function RepairService.pushJobs(player: Player)
	Net.push(player, "jobs", RepairService.summaries(player))
end

-- data: { device, faults?, request?, requestId?, kind, price, customer?, text?, own?, deadline? }
function RepairService.createJob(player: Player, data): any?
	local list = jobList(player)
	local count = 0
	for _ in list do
		count += 1
	end
	if count >= MAX_JOBS then
		return nil
	end
	nextId += 1
	local job = data
	job.id = string.format("J%04d", nextId)
	job.status = "waiting"
	job.created = os.clock()
	job.lang = DataService.lang(player)
	job.name = DeviceGen.name(job.device)
	local tools = {}
	for _, fid in job.faults or {} do
		local f = Faults.get(fid)
		for _, t in f and f.tools or {} do
			tools[t] = true
		end
	end
	job.tools = {}
	for t in tools do
		table.insert(job.tools, t)
	end
	list[job.id] = job
	RepairService.pushJobs(player)
	return job
end

function RepairService.removeJob(player: Player, id: string)
	local job = jobList(player)[id]
	if not job then
		return
	end
	if job.bench then
		RepairService.clearBench(player, job.bench)
	end
	jobList(player)[id] = nil
	RepairService.jobRemoved:Fire(player, id)
	RepairService.pushJobs(player)
end

----------------------------------------------------------------------------------------------------
-- Benches
----------------------------------------------------------------------------------------------------
local function benchState(player: Player, i: number)
	local b = benches[player]
	if not b then
		b = {}
		benches[player] = b
	end
	if not b[i] then
		b[i] = { rev = 0 }
	end
	return b[i]
end

local function benchModel(player: Player, i: number): Model?
	local shop = PlotService.shopOf(player)
	return shop and shop.benches[i] or nil
end
RepairService.benchModel = benchModel

-- Writes the bench's device view where every client can see it.
function RepairService.publish(player: Player, i: number)
	local st = benchState(player, i)
	local m = benchModel(player, i)
	if not m then
		return
	end
	st.rev += 1
	local job = st.job and jobList(player)[st.job]
	if job then
		m:SetAttribute("DeviceView", HttpService:JSONEncode(Rules.view(job.device)))
		m:SetAttribute("JobId", job.id)
	else
		m:SetAttribute("DeviceView", nil)
		m:SetAttribute("JobId", nil)
	end
	m:SetAttribute("DeviceRev", st.rev)
end

function RepairService.clearBench(player: Player, i: number)
	local st = benchState(player, i)
	local job = st.job and jobList(player)[st.job]
	if job then
		job.bench = nil
		if job.status == "bench" then
			job.status = "waiting"
		end
	end
	st.job = nil
	st.worker = nil
	RepairService.publish(player, i)
end

function RepairService.benchJob(player: Player, i: number)
	local st = benchState(player, i)
	return st.job and jobList(player)[st.job] or nil
end

function RepairService.freeBench(player: Player): number?
	local shop = PlotService.shopOf(player)
	if not shop then
		return nil
	end
	for i = 1, #shop.benches do
		local st = benchState(player, i)
		if not st.job and not st.worker then
			return i
		end
	end
	return nil
end

-- Puts a waiting job onto bench i. worker: the player or an employee uid.
function RepairService.load(player: Player, i: number, jobId: string, worker: any?): (boolean, string?)
	local job = jobList(player)[jobId]
	if not job or not benchModel(player, i) then
		return false, "not_found"
	end
	if job.status ~= "waiting" then
		return false, "busy"
	end
	local st = benchState(player, i)
	if st.job and st.job ~= jobId then
		return false, "bench_busy"
	end
	st.job = jobId
	st.worker = worker
	job.status = "bench"
	job.bench = i
	if worker == player then
		job.blocked = nil -- the boss takes over
	end
	RepairService.publish(player, i)
	RepairService.pushJobs(player)
	return true
end

----------------------------------------------------------------------------------------------------
-- Actions
----------------------------------------------------------------------------------------------------
local function items(player: Player)
	local p = DataService.get(player)
	return p and p.shop.items or {}
end

-- RepairRules ctx for a player (or an employee working for that player)
function RepairService.ctx(player: Player, job, toolId: string, owned: { [string]: boolean }?)
	local mat = items(player).bench_mat
	local base = rng
	local rr = {
		NextNumber = function()
			local n = base:NextNumber()
			return if mat then math.min(1, n * 2) else n
		end,
		NextInteger = function(_, a, b)
			return base:NextInteger(a, b)
		end,
	}
	return {
		tool = toolId,
		owned = owned or DataService.owned(player),
		lang = DataService.lang(player),
		rng = rr,
		takePart = function(source: string, partId: string, uid: string?)
			if source == "inv" then
				local item = DataService.takePart(player, uid, partId)
				if not item then
					return nil
				end
				local dead = item.broken or item.hiddenBroken
				local cat = Parts.get(item.part) and (Parts.get(item.part) :: any).cat
				return { part = item.part, cond = item.cond, hidden = if dead then (if cat == "ram" then "faulty" else "dead") else nil, origin = item.origin }
			elseif source == "tray" then
				for k, t in job.device.tray do
					if t.uid == uid then
						table.remove(job.device.tray, k)
						return { part = t.part, cond = t.cond, hidden = t.hidden, origin = t.origin }
					end
				end
			end
			return nil
		end,
		usePaste = function()
			return DataService.usePaste(player)
		end,
		useSolder = function()
			return DataService.useStock(player, "solder_wire", 1)
		end,
		useTies = function(n)
			return DataService.useStock(player, "zip_ties", n)
		end,
	}
end

local TIMED = Config.HoldActionSeconds

-- Runs one repair action on bench i for `player`'s shop. Returns the client result.
function RepairService.act(player: Player, i: number, action: string, target: string?, args, toolId: string, worker: any?)
	local st = benchState(player, i)
	local job = st.job and jobList(player)[st.job]
	if not job then
		return { ok = false, err = "no_job" }
	end
	-- pacing: timed actions can't be spammed
	local now = os.clock()
	local tool = Tools.get(toolId)
	local need = (TIMED[action] or 0.08) * 0.75 / ((tool and tool.speed) or 1)
	if worker == nil and st.last and now - st.last < need then
		return { ok = false, err = "too_fast" }
	end
	st.last = now
	local res = Rules.apply(job.device, action, target, args or {}, RepairService.ctx(player, job, toolId))
	if res.ok then
		job.touched = true
		RepairService.publish(player, i)
		if res.eval then
			local m = benchModel(player, i)
			if m then
				m:SetAttribute("PowerFx", HttpService:JSONEncode({ stage = res.eval.stage, fans = res.eval.fans, rgb = res.eval.rgb, t = os.time(), n = st.rev }))
			end
		end
		if res.esd then
			Net.push(player, "toast", { key = "esd_zap", vars = { node = Rules.label(job.device, res.esd, DataService.lang(player)) } })
		end
	end
	res.view = Rules.view(job.device)
	res.rev = st.rev
	return res
end

----------------------------------------------------------------------------------------------------
-- Assessment
----------------------------------------------------------------------------------------------------
function RepairService.assess(job)
	local dev = job.device
	local assembled, missing = Rules.assembled(dev)
	local ev = Rules.evaluate(dev, "stress")
	local fixed = assembled and ev.stage == "ok" and #ev.issues == 0
	local unmet = {}
	if job.request then
		local ok, um = DeviceGen.meets(dev, job.request)
		if not ok then
			fixed = false
			unmet = um
		end
	end
	-- quality points for the review
	local stars = if fixed then 5 else 1
	local notes = {}
	if fixed then
		if (dev.esdEvents or 0) > 0 then
			stars -= 1
			table.insert(notes, "esd")
		end
		if dev.paste and dev.paste.st == "fresh" and (dev.paste.q or 0) < 0.55 then
			stars -= 1
			table.insert(notes, "paste")
		end
		if dev.kind == "desktop" and dev.ties then
			table.insert(notes, "tidy")
		end
	end
	return { fixed = fixed, assembled = assembled, missing = #missing, stage = ev.stage, issues = ev.issues, unmet = unmet, stars = math.max(1, stars), notes = notes }
end

-- Moves the job off its bench and marks it ready; its replaced parts go to the inventory.
function RepairService.finish(player: Player, jobId: string): (boolean, any)
	local job = jobList(player)[jobId]
	if not job then
		return false, "not_found"
	end
	local verdict = RepairService.assess(job)
	job.verdict = verdict
	-- parts that came out of the device stay with you
	local kept, scrapped = 0, 0
	for _, t in job.device.tray do
		local p = Parts.get(t.part)
		if p and p.cat ~= "misc" or (p and p.sub == "wifi") then
			local broken = t.hidden ~= nil or (t.cond or 1) < 0.25
			if DataService.addPart(player, t.part, t.cond, if t.origin == "device" then "removed" else t.origin, if broken then true else nil) then
				kept += 1
			else
				scrapped += 1
			end
		end
	end
	job.device.tray = {}
	if job.bench then
		RepairService.clearBench(player, job.bench)
	end
	job.status = "ready"
	RepairService.pushJobs(player)
	RepairService.jobFinished:Fire(player, job)
	return true, { verdict = verdict, kept = kept, scrapped = scrapped }
end

-- Value of a working own project when sold to the second-hand dealer.
function RepairService.resale(job): number
	local v = DeviceGen.value(job.device)
	local verdict = RepairService.assess(job)
	if not verdict.fixed then
		return math.floor(v * 0.12)
	end
	return math.floor(v * 0.62)
end

----------------------------------------------------------------------------------------------------
-- Sessions (a player sitting at a bench)
----------------------------------------------------------------------------------------------------
local function stopSession(player: Player, silent: boolean?)
	local s = sessions[player]
	if not s then
		return
	end
	sessions[player] = nil
	local st = benchState(player, s.bench)
	if st.worker == player then
		st.worker = nil
	end
	if s.conn then
		s.conn:Disconnect()
	end
	if not silent then
		Net.push(player, "bench.close", { bench = s.bench })
	end
end

local function startSession(player: Player, i: number)
	local shop = PlotService.shopOf(player)
	local m = benchModel(player, i)
	if not shop or not m then
		return
	end
	local st = benchState(player, i)
	if st.worker and st.worker ~= player then
		Net.push(player, "toast", { key = "bench_staff" })
		return
	end
	stopSession(player, true)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local stool = m:FindFirstChild("Stool") :: Seat?
	if hum and stool and not stool.Occupant then
		stool:Sit(hum)
	end
	st.worker = player
	local s = { bench = i, since = os.clock() }
	sessions[player] = s
	if hum then
		s.conn = hum:GetPropertyChangedSignal("SeatPart"):Connect(function()
			if hum.SeatPart ~= stool and sessions[player] == s then
				stopSession(player)
			end
		end)
	end
	local job = st.job and jobList(player)[st.job]
	Net.push(player, "bench.open", {
		bench = i,
		job = job and RepairService.summary(job) or nil,
		view = job and Rules.view(job.device) or nil,
		rev = st.rev,
		jobs = RepairService.summaries(player),
	})
end

function RepairService.session(player: Player)
	return sessions[player]
end

----------------------------------------------------------------------------------------------------
-- Network
----------------------------------------------------------------------------------------------------
local function sessionBench(player: Player): number?
	local s = sessions[player]
	return s and s.bench or nil
end

function RepairService.init() end

function RepairService.start()
	ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "BenchPrompt" then
			return
		end
		local i = prompt:GetAttribute("Bench")
		local shop = PlotService.shopOf(player)
		if not shop or typeof(i) ~= "number" or not prompt:IsDescendantOf(shop.model) then
			Net.push(player, "toast", { key = "not_your_bench" })
			return
		end
		startSession(player, i)
	end)

	Net.handle("bench.leave", function(player)
		local s = sessions[player]
		if s then
			local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
			stopSession(player)
			if hum then
				hum.Sit = false
				hum.Jump = true
			end
		end
		return { ok = true }
	end)

	Net.handle("bench.load", function(player, payload)
		local i = sessionBench(player)
		if not i or not V.tbl(payload) or not V.id(payload.job) then
			return { ok = false, err = "bad" }
		end
		local st = benchState(player, i)
		if st.job then
			RepairService.clearBench(player, i)
		end
		local ok, err = RepairService.load(player, i, payload.job, player)
		if not ok then
			return { ok = false, err = err }
		end
		st.worker = player
		local job = jobList(player)[payload.job]
		return { ok = true, job = RepairService.summary(job), view = Rules.view(job.device), rev = st.rev }
	end)

	Net.handle("bench.unload", function(player)
		local i = sessionBench(player)
		if not i then
			return { ok = false }
		end
		RepairService.clearBench(player, i)
		benchState(player, i).worker = player
		RepairService.pushJobs(player)
		return { ok = true }
	end)

	Net.handle("repair.act", function(player, payload)
		local i = sessionBench(player)
		if not i then
			return { ok = false, err = "no_session" }
		end
		if not V.tbl(payload) or not V.id(payload.action) or (payload.target ~= nil and not V.id(payload.target)) or not V.id(payload.tool or "hand") then
			return { ok = false, err = "bad" }
		end
		local args = payload.args
		if args ~= nil then
			if not V.tbl(args) then
				return { ok = false, err = "bad" }
			end
			local clean = {}
			if args.source ~= nil and V.id(args.source) then
				clean.source = args.source
			end
			if args.part ~= nil and V.id(args.part) then
				clean.part = args.part
			end
			if args.uid ~= nil and V.id(args.uid) then
				clean.uid = args.uid
			end
			if args.program ~= nil and V.id(args.program) then
				clean.program = args.program
			end
			if args.amount ~= nil and V.num(args.amount, 0, 1) then
				clean.amount = args.amount
			end
			if args.on ~= nil and V.bool(args.on) then
				clean.on = args.on
			end
			args = clean
		end
		return RepairService.act(player, i, payload.action, payload.target, args, payload.tool or "hand")
	end)

	Net.handle("repair.finish", function(player)
		local i = sessionBench(player)
		local job = i and RepairService.benchJob(player, i)
		if not job then
			return { ok = false, err = "no_job" }
		end
		local ok, info = RepairService.finish(player, job.id)
		if not ok then
			return { ok = false, err = info }
		end
		return { ok = true, verdict = info.verdict, kept = info.kept, scrapped = info.scrapped, own = job.own, resale = if job.own then RepairService.resale(job) else nil }
	end)

	Net.handle("repair.assess", function(player)
		local i = sessionBench(player)
		local job = i and RepairService.benchJob(player, i)
		if not job then
			return { ok = false }
		end
		return { ok = true, verdict = RepairService.assess(job) }
	end)

	Net.handle("jobs.list", function(player)
		return { ok = true, jobs = RepairService.summaries(player) }
	end)

	-- selling a finished own project to the used-PC dealer
	Net.handle("jobs.sell", function(player, payload)
		if not V.tbl(payload) or not V.id(payload.job) then
			return { ok = false }
		end
		local job = jobList(player)[payload.job]
		if not job or not job.own or job.status == "bench" then
			return { ok = false, err = "not_sellable" }
		end
		local price = RepairService.resale(job)
		RepairService.removeJob(player, job.id)
		DataService.money(player, price, "resale")
		if job.verdict and job.verdict.fixed then
			DataService.addXp(player, 25)
		end
		return { ok = true, price = price }
	end)

	Players.PlayerRemoving:Connect(function(player)
		stopSession(player, true)
		jobs[player] = nil
		benches[player] = nil
	end)

	-- benches are rebuilt with the shop: re-publish what's on them
	PlotService.built:Connect(function(player, shop)
		local b = benches[player]
		if not b then
			return
		end
		for i, st in b do
			if i > #shop.benches then
				if st.job then
					RepairService.clearBench(player, i)
				end
				b[i] = nil
			else
				RepairService.publish(player, i)
			end
		end
	end)
end

-- Shop items that speed up bench work (LED lamp, tool wall, test monitor, microscope).
function RepairService.workSpeed(player: Player): number
	local s = 1
	local owned = items(player)
	for _, item in Upgrades.items do
		if item.speed and owned[item.id] then
			s += item.speed
		end
	end
	return s
end

return RepairService
