-- Technician: an automated repair bot used by the tests. It only interacts with a device through
-- RepairRules.apply (exactly like a player), reacting to the reasons the rules give for refusing an
-- action ("remove the side panel first", "flip the laptop", ...). If it can fix every fault on many
-- random devices, the rule graph is complete and consistent.

local Technician = {}
Technician.__index = Technician

local ALL_TOOLS = {}

function Technician.new(Rules, Parts, Tools, dev, rng)
	for _, t in Tools.list do
		ALL_TOOLS[t.id] = true
	end
	local self = setmetatable({ Rules = Rules, Parts = Parts, Tools = Tools, dev = dev, rng = rng, log = {}, actions = 0 }, Technician)
	return self
end

function Technician:toolFor(action: string, target: string?)
	local Rules, Tools = self.Rules, self.Tools
	if action == "unscrew" or action == "screw" then
		local bit = Rules.screwBit(self.dev, target)
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
	local prefer = {
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
	return prefer[action] or "hand"
end

function Technician:ctx(action, target)
	return {
		tool = self:toolFor(action, target),
		owned = ALL_TOOLS,
		lang = "en",
		rng = nil, -- no ESD accidents in the bot
	}
end

function Technician:try(action: string, target: string?, args)
	self.actions += 1
	if self.actions > 3000 then
		error("technician exceeded action budget")
	end
	local res = self.Rules.apply(self.dev, action, target, args, self:ctx(action, target))
	table.insert(self.log, string.format("%s %s -> %s", action, tostring(target), if res.ok then "ok" else tostring(res.reason)))
	return res
end

-- Performs action, resolving prerequisites the rules complain about.
function Technician:ensure(action: string, target: string?, args, depth: number?)
	depth = depth or 0
	if depth > 30 then
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
		if not self:resolve(res.reason, res.vars or {}, action, target, depth + 1) then
			error(string.format("cannot resolve '%s' while doing %s %s\nlast steps:\n%s", tostring(res.reason), action, tostring(target), self:tail(25)))
		end
	end
	error("gave up on " .. action .. " " .. tostring(target))
end

function Technician:tail(n)
	local out = {}
	for i = math.max(1, #self.log - n), #self.log do
		table.insert(out, "  " .. self.log[i])
	end
	return table.concat(out, "\n")
end

function Technician:unscrewAll(owner: string, depth)
	local Rules = self.Rules
	local tn = Rules.tnode(self.dev, owner)
	for _, sid in tn.screws do
		if Rules.available(self.dev, sid) and self.dev.nodes[sid].st == "in" then
			self:ensure("unscrew", sid, nil, depth)
		end
	end
end

function Technician:resolve(reason: string, vars, action: string, target: string?, depth: number): boolean
	local dev = self.dev
	if reason == "remove_first" then
		local id = vars.id
		local tn = self.Rules.tnode(dev, id)
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
		local tn = self.Rules.tnode(dev, target)
		for _, e in tn.ends do
			if dev.nodes[e].st == "out" then
				self:ensure("install", e, { source = "self" }, depth)
			end
		end
		return true
	end
	return false
end

-- Picks a part from the catalogue that fits node `id` (optionally matching `filter`).
function Technician:partFor(id: string, filter)
	local Rules, Parts = self.Rules, self.Parts
	local tn = Rules.tnode(self.dev, id)
	local cands = {}
	for _, p in Parts.byCat[tn.cat] or {} do
		if Rules.compatible(self.dev, id, p, "en") and (not filter or filter(p)) then
			table.insert(cands, p)
		end
	end
	if #cands == 0 then
		error("no compatible part for " .. id)
	end
	table.sort(cands, function(a, b)
		return a.price < b.price
	end)
	return cands[math.min(#cands, 1 + (self.actions % #cands))]
end

function Technician:replace(id: string, filter)
	local dev = self.dev
	if dev.nodes[id].st == "in" or dev.nodes[id].st == "loose" then
		local tn = self.Rules.tnode(dev, id)
		if self.Rules.isSoldered(dev, id) and dev.nodes[id].st == "in" then
			self:ensure("desolder", id)
		end
		if tn.pry and dev.nodes[id].st == "in" then
			self:ensure("pry", id)
		end
		self:ensure("remove", id)
	end
	local p = self:partFor(id, filter)
	self:ensure("install", id, { source = "inv", part = p.id })
	return p
end

function Technician:repaste()
	local dev = self.dev
	local cpuNode = if dev.kind == "desktop" then "cpu" else "lboard"
	if dev.kind == "desktop" then
		if dev.nodes.cooler.st == "in" then
			self:ensure("remove", "cooler")
		end
	else
		if dev.nodes.lfan.st == "in" then
			self:ensure("remove", "lfan")
		end
	end
	if dev.paste.st == "dry" or dev.paste.st == "old" or dev.paste.st == "fresh" then
		self:ensure("clean_paste", cpuNode)
	end
	self:ensure("apply_paste", cpuNode, { amount = 0.5 })
end

function Technician:dustAll()
	local dev = self.dev
	for id, s in dev.nodes do
		if s.dust and s.dust > 0.02 and id ~= "lboard" and self.Rules.available(dev, id) and s.st ~= "empty" then
			for _ = 1, 6 do
				local r = self:ensure("blow_dust", id)
				if not r.ok or (s.dust or 0) <= 0.02 then
					break
				end
			end
		end
	end
end

-- Puts everything back together until RepairRules.assembled() is happy.
function Technician:reassemble()
	local Rules = self.Rules
	local dev = self.dev
	for _ = 1, 400 do
		local ok, missing = Rules.assembled(dev)
		if ok then
			return true
		end
		-- panels and feet go on last
		table.sort(missing, function(a, b)
			local pa = (a.why == "panel" or a.why == "feet") and 1 or 0
			local pb = (b.why == "panel" or b.why == "feet") and 1 or 0
			if pa ~= pb then
				return pa < pb
			end
			-- bottom cover before its feet, side panel before its screws is handled by the rules
			return false
		end)
		local m = missing[1]
		local id = m.id
		if m.why == "out" then
			if id == "cooler" and dev.paste.st ~= "fresh" then
				if dev.paste.st == "dry" or dev.paste.st == "old" then
					self:ensure("clean_paste", "cpu")
				end
				self:ensure("apply_paste", "cpu", { amount = 0.5 })
			end
			if id == "lfan" and dev.paste.st ~= "fresh" then
				if dev.paste.st == "dry" or dev.paste.st == "old" then
					self:ensure("clean_paste", "lboard")
				end
				self:ensure("apply_paste", "lboard", { amount = 0.5 })
			end
			self:ensure("install", id, { source = "self" })
		elseif m.why == "loose" then
			self:ensure("install", id, { source = "self" })
		elseif m.why == "solder" then
			self:ensure("solder", id)
		elseif m.why == "empty" then
			local p = self:partFor(id)
			self:ensure("install", id, { source = "inv", part = p.id })
		elseif m.why == "panel" then
			self:ensure("install", id)
		elseif m.why == "feet" then
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

return Technician
