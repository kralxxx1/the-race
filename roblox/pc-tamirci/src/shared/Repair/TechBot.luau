-- TechBot: a technician that repairs a device only through RepairRules.apply, the same way a
-- player does, resolving whatever the rules complain about ("remove the side panel first",
-- "flip the laptop"...). Hired technicians use it on the server (step by step, so their work
-- shows on the bench) and the tests use it to prove every fault can be fixed.
--
-- opts:
--   ctx(action, target)  -> RepairRules ctx (tool, owned, lang, rng, takePart, usePaste...)
--   pickPart(id, filter) -> part id to install into node `id` or nil (default: catalogue)
--   onStep(action, target, result)  called after every successful action (may yield)
--   budget               maximum number of actions (default 3000)

local Shared = script.Parent.Parent
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Rules = require(script.Parent.RepairRules)

local TechBot = {}
TechBot.__index = TechBot

local ALL_TOOLS = {}
for _, t in Tools.list do
	ALL_TOOLS[t.id] = true
end

local PREFER = {
	blow_dust = "air_can",
	brush = "brush",
	clean_paste = "isopropyl",
	clean_liquid = "isopropyl",
	apply_paste = "paste_syringe",
	desolder = "soldering_station",
	solder = "soldering_station",
	straighten_pins = "tweezers",
	pry = "spudger_kit",
	peel = "spudger_kit",
	software = "usb_boot",
	measure = "multimeter",
	inspect = "magnifier",
	psu_test = "psu_tester",
	post_code = "post_card",
	wear_strap = "esd_strap",
}

function TechBot.new(dev, opts: { [string]: any }?)
	local self = setmetatable({ dev = dev, opts = opts or {}, log = {}, actions = 0 }, TechBot)
	self.budget = self.opts.budget or 3000
	return self
end

function TechBot.toolFor(dev, action: string, target: string?): string
	if action == "unscrew" or action == "screw" then
		local bit = Rules.screwBit(dev, target :: string)
		if bit == "thumb" or bit == "toolless" then
			return "hand"
		end
		for _, id in { "screwdriver_ph2", "precision_kit", "electric_screwdriver" } do
			if Tools.canDo(id, "unscrew", bit) then
				return id
			end
		end
		return "precision_kit"
	end
	return PREFER[action] or "hand"
end

function TechBot:ctx(action: string, target: string?)
	if self.opts.ctx then
		return self.opts.ctx(action, target, TechBot.toolFor(self.dev, action, target))
	end
	return { tool = TechBot.toolFor(self.dev, action, target), owned = ALL_TOOLS, lang = "en" }
end

function TechBot:try(action: string, target: string?, args)
	self.actions += 1
	if self.actions > self.budget then
		error("technician exceeded action budget")
	end
	local res = Rules.apply(self.dev, action, target, args, self:ctx(action, target))
	table.insert(self.log, string.format("%s %s -> %s", action, tostring(target), if res.ok then "ok" else tostring(res.reason)))
	if res.ok and self.opts.onStep then
		self.opts.onStep(action, target, res)
	end
	return res
end

function TechBot:tail(n: number): string
	local out = {}
	for i = math.max(1, #self.log - n), #self.log do
		table.insert(out, "  " .. self.log[i])
	end
	return table.concat(out, "\n")
end

-- Performs action, resolving prerequisites the rules complain about.
function TechBot:ensure(action: string, target: string?, args, depth: number?)
	local d = depth or 0
	if d > 30 then
		error("prerequisite recursion too deep for " .. action .. " " .. tostring(target))
	end
	for _ = 1, 40 do
		local res = self:try(action, target, args)
		if res.ok then
			return res
		end
		if res.reason == "already" or res.reason == "no_dust" or res.reason == "pins_ok" then
			return res
		end
		if not self:resolve(res.reason, res.vars or {}, action, target, d + 1) then
			error(string.format("cannot resolve '%s' while doing %s %s\nlast steps:\n%s", tostring(res.reason), action, tostring(target), self:tail(25)))
		end
	end
	error("gave up on " .. action .. " " .. tostring(target))
end

function TechBot:unscrewAll(owner: string, depth: number?)
	local tn = Rules.tnode(self.dev, owner)
	for _, sid in tn.screws do
		if Rules.available(self.dev, sid) and self.dev.nodes[sid].st == "in" then
			self:ensure("unscrew", sid, nil, depth)
		end
	end
end

function TechBot:resolve(reason: string, vars, _action: string, target: string?, depth: number): boolean
	local dev = self.dev
	if reason == "remove_first" then
		local id = vars.id
		local tn = Rules.tnode(dev, id)
		if tn.pry and dev.nodes[id].st == "in" then
			self:ensure("pry", id, nil, depth)
			if dev.nodes[id].st == "out" then
				return true
			end
		end
		self:ensure("remove", id, nil, depth)
		return true
	elseif reason == "unscrew_first" then
		self:unscrewAll(vars.id or target, depth)
		return true
	elseif reason == "unplug_first" then
		self:ensure("unplug", vars.id, nil, depth)
		return true
	elseif reason == "open_latch_first" then
		self:ensure("open_latch", vars.id, nil, depth)
		return true
	elseif reason == "peel_first" then
		self:ensure("peel", "feet", nil, depth)
		return true
	elseif reason == "pry_first" then
		self:ensure("pry", target, nil, depth)
		return true
	elseif reason == "desolder_first" then
		self:ensure("desolder", target, nil, depth)
		return true
	elseif reason == "board_out_first" then
		self:ensure("remove", "mobo", nil, depth)
		return true
	elseif reason == "cooler_off_first" then
		self:ensure("remove", "cooler", nil, depth)
		return true
	elseif reason == "cpu_out_first" then
		self:ensure("remove", "cpu", nil, depth)
		return true
	elseif reason == "flip_bottom" or reason == "flip_top" then
		if dev.lid == "open" then
			self:ensure("lid", nil, nil, depth)
		end
		self:ensure("flip", nil, nil, depth)
		return true
	elseif reason == "lid_open" or reason == "lid_closed" then
		if reason == "lid_open" and dev.orient ~= "top" then
			self:ensure("flip", nil, nil, depth)
		end
		self:ensure("lid", nil, nil, depth)
		return true
	elseif reason == "clean_paste_first" then
		self:ensure("clean_paste", target, nil, depth)
		return true
	elseif reason == "children_attached" then
		self:ensure("remove", vars.id, nil, depth)
		return true
	elseif reason == "need_parent" then
		local id = vars.id
		if dev.nodes[id].st == "out" then
			self:ensure("install", id, { source = "self" }, depth)
			return true
		end
		return false
	elseif reason == "solder_first" then
		self:ensure("solder", target, nil, depth)
		return true
	elseif reason == "ends_missing" then
		local tn = Rules.tnode(dev, target :: string)
		for _, e in tn.ends do
			if dev.nodes[e].st == "out" then
				self:ensure("install", e, { source = "self" }, depth)
			end
		end
		return true
	end
	return false
end

-- Cheapest compatible catalogue part (rotating through the cheap ones for variety).
function TechBot:catalogPart(id: string, filter): string?
	local tn = Rules.tnode(self.dev, id)
	local cands = {}
	for _, p in Parts.byCat[tn.cat] or {} do
		if Rules.compatible(self.dev, id, p, "en") and (not filter or filter(p)) then
			table.insert(cands, p)
		end
	end
	if #cands == 0 then
		return nil
	end
	table.sort(cands, function(a, b)
		return a.price < b.price
	end)
	return cands[math.min(#cands, 1 + (self.actions % math.min(#cands, 3)))].id
end

function TechBot:partFor(id: string, filter): string
	local pid = if self.opts.pickPart then self.opts.pickPart(id, filter) else self:catalogPart(id, filter)
	if not pid then
		local tn = Rules.tnode(self.dev, id)
		error({ needPart = tn.cat, node = id })
	end
	return pid
end

function TechBot:replace(id: string, filter)
	local dev = self.dev
	local pid = self:partFor(id, filter)
	if dev.nodes[id].st == "in" or dev.nodes[id].st == "loose" then
		local tn = Rules.tnode(dev, id)
		if Rules.isSoldered(dev, id) and dev.nodes[id].st == "in" then
			self:ensure("desolder", id)
		end
		if tn.pry and dev.nodes[id].st == "in" then
			self:ensure("pry", id)
		end
		self:ensure("remove", id)
	end
	self:ensure("install", id, { source = "inv", part = pid })
	return pid
end

function TechBot:repaste()
	local dev = self.dev
	local cpuNode = if dev.kind == "desktop" then "cpu" else "lboard"
	if dev.kind == "desktop" then
		if dev.nodes.cooler.st == "in" then
			self:ensure("remove", "cooler")
		end
	elseif dev.nodes.lfan.st == "in" then
		self:ensure("remove", "lfan")
	end
	if dev.paste.st == "dry" or dev.paste.st == "old" or dev.paste.st == "fresh" then
		self:ensure("clean_paste", cpuNode)
	end
	self:ensure("apply_paste", cpuNode, { amount = 0.5 })
end

function TechBot:dustAll()
	local dev = self.dev
	for id, s in dev.nodes do
		if s.dust and s.dust > 0.02 and id ~= "lboard" and Rules.available(dev, id) and s.st ~= "empty" then
			for _ = 1, 8 do
				local r = self:ensure("blow_dust", id)
				if not r.ok or (s.dust or 0) <= 0.02 then
					break
				end
			end
		end
	end
end

-- Puts everything back together until RepairRules.assembled() is happy.
function TechBot:reassemble()
	local dev = self.dev
	for _ = 1, 400 do
		local ok, missing = Rules.assembled(dev)
		if ok then
			return true
		end
		table.sort(missing, function(a, b)
			local pa = (a.why == "panel" or a.why == "feet") and 1 or 0
			local pb = (b.why == "panel" or b.why == "feet") and 1 or 0
			return pa < pb
		end)
		local m = missing[1]
		local id = m.id
		if m.why == "out" then
			if (id == "cooler" or id == "lfan") and dev.paste.st ~= "fresh" then
				local cpuNode = if id == "cooler" then "cpu" else "lboard"
				if dev.paste.st == "dry" or dev.paste.st == "old" then
					self:ensure("clean_paste", cpuNode)
				end
				self:ensure("apply_paste", cpuNode, { amount = 0.5 })
			end
			self:ensure("install", id, { source = "self" })
		elseif m.why == "loose" then
			self:ensure("install", id, { source = "self" })
		elseif m.why == "solder" then
			self:ensure("solder", id)
		elseif m.why == "empty" then
			self:ensure("install", id, { source = "inv", part = self:partFor(id) })
		elseif m.why == "panel" or m.why == "feet" then
			self:ensure("install", id)
		elseif m.why == "screw" then
			self:ensure("screw", id)
		elseif m.why == "cable" then
			self:ensure("plug", id)
		elseif m.why == "latch" then
			self:ensure("close_latch", id)
		else
			error("unknown missing reason " .. tostring(m.why))
		end
	end
	error("reassembly did not converge:\n" .. self:tail(30))
end

local function hiddenNode(dev, prefixes: { string }): string?
	for id in dev.hidden or {} do
		for _, pre in prefixes do
			if string.sub(id, 1, #pre) == pre then
				return id
			end
		end
	end
	return nil
end

-- The repair procedure for each fault (uses the server-side hidden fault map).
function TechBot:fix(faultId: string)
	local dev = self.dev
	if faultId == "psu_dead" or faultId == "psu_weak" then
		local draw = Parts.systemDraw(Rules.part(dev, "cpu"), Rules.part(dev, "gpu"))
		self:replace("psu", function(p)
			return p.watt >= draw * 1.3 and p.quality >= 0.8
		end)
	elseif faultId == "gpu_dead" or faultId == "gpu_artifacts" then
		local old = Rules.part(dev, "gpu")
		self:replace("gpu", function(p)
			return not old or (p.perf >= old.perf * 0.8 and p.tdp <= old.tdp * 1.2)
		end)
	elseif faultId == "ram_faulty" then
		local id = hiddenNode(dev, { "ram", "lram" })
		if id then
			local old = Rules.part(dev, id)
			self:replace(id, function(p)
				return not old or p.size >= old.size
			end)
		end
	elseif faultId == "ram_unseated" then
		local id = hiddenNode(dev, { "ram" })
		if id then
			self:ensure("remove", id)
			self:ensure("install", id, { source = "self" })
		end
	elseif faultId == "cpu_paste" or faultId == "no_paste" or faultId == "lap_overheat" then
		self:repaste()
		if faultId == "lap_overheat" then
			self:dustAll()
		end
	elseif faultId == "dust" then
		self:dustAll()
	elseif faultId == "fan_dead" or faultId == "fan_noisy" then
		local id = hiddenNode(dev, { "fan_", "cooler" })
		if id == "cooler" then
			local cpu = Rules.part(dev, "cpu")
			self:replace("cooler", function(p)
				return p.rating >= (cpu and cpu.tdp or 65)
			end)
		elseif id then
			self:replace(id)
		end
	elseif faultId == "hdd_failing" or faultId == "ssd_dead" then
		local boot = dev.boot
		self:replace(boot, function(p)
			return p.kind == "ssd25" or p.kind == "nvme" or Rules.tnode(dev, boot).kinds[1] == p.kind
		end)
		self:reassemble()
		self:ensure("software", nil, { program = "os_install" })
	elseif faultId == "os_corrupt" then
		self:reassemble()
		self:ensure("software", nil, { program = "os_install" })
	elseif faultId == "virus" then
		self:reassemble()
		self:ensure("software", nil, { program = "antivirus" })
	elseif faultId == "cmos_low" then
		self:replace(if dev.kind == "desktop" then "cmos" else "lcmos")
	elseif faultId == "bios_outdated" then
		self:ensure("software", nil, { program = "bios_update" })
	elseif faultId == "cap_bulged" then
		local id = hiddenNode(dev, { "cap" })
		if id then
			self:replace(id)
			self:ensure("solder", id)
		end
	elseif faultId == "mobo_dead" then
		local cpu = Rules.part(dev, "cpu")
		local ram = Rules.part(dev, "ram1") or Rules.part(dev, "ram2")
		self:replace("mobo", function(p)
			return p.socket == cpu.socket and (not ram or p.mem == ram.mem) and p.memSlots >= 2
		end)
	elseif faultId == "cpu_dead" then
		local needsIgpu = dev.nodes.gpu.st ~= "in"
		local old = Rules.part(dev, "cpu")
		self:replace("cpu", function(p)
			return (p.igpu or not needsIgpu) and p.tdp <= old.tdp
		end)
	elseif faultId == "bent_pins" then
		self:ensure("straighten_pins", "socket")
	elseif faultId == "cable_loose" then
		if dev.nodes.cpcie1 and dev.nodes.cpcie1.st == "loose" then
			self:ensure("plug", "cpcie1")
		else
			self:ensure("plug", "ceps")
		end
	elseif faultId == "lap_battery_worn" or faultId == "lap_battery_swollen" then
		self:replace("battery")
	elseif faultId == "lap_screen" then
		self:replace("screen")
	elseif faultId == "lap_keyboard" then
		self:ensure("clean_liquid", "lboard")
		self:replace("keyboard")
	elseif faultId == "lap_fan_noisy" then
		self:replace("lfan")
	elseif faultId == "lap_dcjack" then
		self:replace("dcjack")
		if Rules.isSoldered(dev, "dcjack") then
			self:ensure("solder", "dcjack")
		end
	elseif faultId == "lap_hinge" then
		self:replace("hinges")
	elseif faultId == "lap_liquid" then
		for _ = 1, 4 do
			if (dev.liquid or 0) <= 0.02 then
				break
			end
			self:ensure("clean_liquid", "lboard")
		end
	elseif faultId == "lap_wifi" then
		self:replace("lwifi")
	else
		error("bot doesn't know how to fix " .. faultId)
	end
end

-- Completes a customer request (upgrade/maintenance/build).
function TechBot:fulfil(reqId: string, req)
	local dev = self.dev
	if reqId == "upgrade_ram" then
		local ids = if dev.kind == "desktop" then { "ram1", "ram2", "ram3", "ram4" } else { "lram1", "lram2" }
		local need = req and req.ramMin or 16
		local slots = {}
		for _, id in ids do
			if Rules.available(dev, id) then
				table.insert(slots, id)
			end
		end
		local soldered = 0
		if dev.kind == "laptop" then
			local m = Rules.laptopModel(dev)
			soldered = m and m.soldered or 0
		end
		local per = math.max(4, math.ceil((need - soldered) / math.max(1, #slots)))
		for _, id in slots do
			self:replace(id, function(p)
				return p.size >= per
			end)
		end
	elseif reqId == "upgrade_ssd" then
		local slot = if dev.kind == "desktop" then (if Rules.available(dev, "nvme1") then "nvme1" else "ssd1") else "lnvme"
		if dev.nodes[slot].st == "in" then
			slot = if dev.kind == "desktop" then "ssd1" else "lnvme"
		end
		self:replace(slot, function(p)
			return p.kind == "nvme" or p.kind == "ssd25"
		end)
		self:reassemble()
		self:ensure("software", nil, { program = "os_install" })
	elseif reqId == "upgrade_gpu" then
		self:replace("gpu", function(p)
			return p.perf >= (req and req.gpuMin or 0) and not p.workstation
		end)
		local cpu, gpu = Rules.part(dev, "cpu"), Rules.part(dev, "gpu")
		local psu = Rules.part(dev, "psu")
		if psu and psu.watt < Parts.systemDraw(cpu, gpu) * 1.1 then
			self:replace("psu", function(p)
				return p.watt >= Parts.systemDraw(cpu, gpu) * 1.3
			end)
		end
	elseif reqId == "maintenance" then
		self:dustAll()
		self:repaste()
	else
		error("bot can't do request " .. reqId)
	end
end

return TechBot
