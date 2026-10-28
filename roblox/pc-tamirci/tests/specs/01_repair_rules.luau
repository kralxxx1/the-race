-- Catalogue integrity and the repair rule graph, exercised by an automated technician.

local Engine = require("../lib/Engine")
local Technician = require("../lib/Technician")
local Mock = require("../lib/Mock")

return function(T)
	Engine.context = "server"
	Engine.load("build/PCTamirci.rbxlx")
	local Parts = Engine.mod("ReplicatedStorage.Shared.Data.Parts")
	local Tools = Engine.mod("ReplicatedStorage.Shared.Data.Tools")
	local Faults = Engine.mod("ReplicatedStorage.Shared.Data.Faults")
	local Devices = Engine.mod("ReplicatedStorage.Shared.Data.Devices")
	local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local Templates = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceTemplates")

	T.test("parts catalogue is consistent", function()
		local n = 0
		for _, p in Parts.list do
			n += 1
			T.ok(type(p.name) == "string" and #p.name > 0, "name " .. p.id)
			T.ok(type(p.price) == "number" and p.price > 0, "price " .. p.id)
			if p.cat == "cpu" then
				local boards = 0
				for _, m in Parts.byCat.mobo do
					if m.socket == p.socket then
						boards += 1
					end
				end
				T.ok(boards > 0, "no motherboard for socket " .. p.socket .. " (" .. p.id .. ")")
			elseif p.cat == "mobo" then
				local rams = 0
				for _, r in Parts.byCat.ram do
					if r.mem == p.mem and r.form == "DIMM" then
						rams += 1
					end
				end
				T.ok(rams > 0, "no RAM for " .. p.id)
			end
		end
		T.ok(n > 300, "expected 300+ parts, got " .. n)
		T.ok(#Parts.byCat.gpu >= 80, "gpu count")
		T.ok(#Parts.byCat.cpu >= 70, "cpu count")
		T.ok(#Parts.byCat.mobo >= 50, "mobo count")
	end)

	T.test("tools and faults reference real things", function()
		for _, f in Faults.list do
			for _, tid in f.tools do
				T.ok(Tools.get(tid) ~= nil, "fault " .. f.id .. " needs unknown tool " .. tid)
			end
			T.ok(#f.symptoms.tr > 0 and #f.symptoms.tr == #f.symptoms.en, "symptoms tr/en mismatch " .. f.id)
		end
		for _, l in Devices.laptops do
			for _, sub in { "battery", "screen", "keyboard", "fan", "hinge", "dcjack" } do
				T.ok(Parts.get("lp_" .. sub .. "_" .. l.class) ~= nil, "missing laptop part " .. sub .. " for " .. l.class)
			end
		end
	end)

	T.test("templates: every relation points at a real node", function()
		for kind, t in { desktop = Templates.desktop, laptop = Templates.laptop } do
			for id, n in t.nodes do
				for _, field in { "blockers", "needsUnplugged", "screws", "cables", "latches" } do
					for _, ref in n[field] do
						T.ok(t.nodes[ref] ~= nil, kind .. "." .. id .. "." .. field .. " -> " .. ref)
					end
				end
				if n.owner then
					T.ok(t.nodes[n.owner] ~= nil, kind .. "." .. id .. ".owner")
				end
				if n.ends then
					for _, e in n.ends do
						T.ok(t.nodes[e] ~= nil, kind .. "." .. id .. ".ends")
					end
				end
				if n.parent then
					T.ok(t.nodes[n.parent] ~= nil, kind .. "." .. id .. ".parent")
				end
			end
		end
	end)

	T.test("generated devices boot and are fully assembled", function()
		local rng = Mock.Random.new(7)
		for _, tier in { "retro", "office", "budget", "mid", "high", "enthusiast", "workstation" } do
			for i = 1, 25 do
				local dev = DeviceGen.desktop(rng, tier)
				local ok, missing = Rules.assembled(dev)
				T.ok(ok, tier .. " not assembled: " .. (missing[1] and (missing[1].id .. "/" .. missing[1].why) or "?"))
				local r = Rules.evaluate(dev, "stress")
				T.ok(r.stage == "ok", string.format("%s #%d stage %s (cpu %s temp %s, %s)", tier, i, r.stage, tostring(dev.nodes.cpu.part), tostring(r.temps.cpu), tostring(dev.nodes.cooler.part)))
				T.ok(#r.issues == 0, tier .. " issues: " .. table.concat(r.issues, ","))
			end
		end
		for i = 1, 60 do
			local dev = DeviceGen.laptop(rng)
			local ok, missing = Rules.assembled(dev)
			T.ok(ok, "laptop not assembled: " .. (missing[1] and (missing[1].id .. "/" .. missing[1].why) or "?"))
			local r = Rules.evaluate(dev, "stress")
			T.ok(r.stage == "ok", "laptop " .. dev.model .. " stage " .. r.stage)
			T.ok(#r.issues == 0, "laptop " .. dev.model .. " issues: " .. table.concat(r.issues, ","))
		end
	end)

	-- How the bot fixes each fault.
	local function fix(tech, dev, faultId)
		local H = dev.hidden
		local function hiddenNode(prefixes)
			for id, f in H do
				for _, pre in prefixes do
					if string.sub(id, 1, #pre) == pre then
						return id, f
					end
				end
			end
			return nil
		end
		if faultId == "psu_dead" or faultId == "psu_weak" then
			local cpu = Rules.part(dev, "cpu")
			local gpu = Rules.part(dev, "gpu")
			local draw = Parts.systemDraw(cpu, gpu)
			tech:replace("psu", function(p)
				return p.watt >= draw * 1.3 and p.quality >= 0.8
			end)
		elseif faultId == "gpu_dead" or faultId == "gpu_artifacts" then
			tech:replace("gpu")
		elseif faultId == "ram_faulty" then
			local id = hiddenNode({ "ram", "lram" })
			tech:replace(id)
		elseif faultId == "ram_unseated" then
			local id = hiddenNode({ "ram" })
			tech:ensure("remove", id)
			tech:ensure("install", id, { source = "self" })
		elseif faultId == "cpu_paste" or faultId == "no_paste" or faultId == "lap_overheat" then
			tech:repaste()
			if faultId == "lap_overheat" then
				tech:dustAll()
			end
		elseif faultId == "dust" then
			tech:dustAll()
		elseif faultId == "fan_dead" or faultId == "fan_noisy" then
			local id = hiddenNode({ "fan_", "cooler" })
			if id == "cooler" then
				local cpu = Rules.part(dev, "cpu")
				tech:replace("cooler", function(p)
					return p.rating >= cpu.tdp
				end)
			else
				tech:replace(id)
			end
		elseif faultId == "hdd_failing" or faultId == "ssd_dead" then
			local boot = dev.boot
			tech:replace(boot, function(p)
				return p.kind == "ssd25" or p.kind == "nvme" or Rules.tnode(dev, boot).kinds[1] == p.kind
			end)
			tech:reassemble()
			tech:ensure("software", nil, { program = "os_install" })
		elseif faultId == "os_corrupt" then
			tech:ensure("software", nil, { program = "os_install" })
		elseif faultId == "virus" then
			tech:ensure("software", nil, { program = "antivirus" })
		elseif faultId == "cmos_low" then
			tech:replace(if dev.kind == "desktop" then "cmos" else "lcmos")
		elseif faultId == "bios_outdated" then
			tech:ensure("software", nil, { program = "bios_update" })
		elseif faultId == "cap_bulged" then
			local id = hiddenNode({ "cap" })
			tech:replace(id)
			tech:ensure("solder", id)
		elseif faultId == "mobo_dead" then
			local cpu = Rules.part(dev, "cpu")
			local ram = Rules.part(dev, "ram1") or Rules.part(dev, "ram2")
			tech:replace("mobo", function(p)
				return p.socket == cpu.socket and (not ram or p.mem == ram.mem) and p.memSlots >= 2
			end)
		elseif faultId == "cpu_dead" then
			local needsIgpu = dev.nodes.gpu.st ~= "in"
			local old = Rules.part(dev, "cpu")
			tech:replace("cpu", function(p)
				return (p.igpu or not needsIgpu) and p.tdp <= old.tdp
			end)
		elseif faultId == "bent_pins" then
			tech:ensure("straighten_pins", "socket")
		elseif faultId == "cable_loose" then
			if dev.nodes.cpcie1 and dev.nodes.cpcie1.st == "loose" then
				tech:ensure("plug", "cpcie1")
			else
				tech:ensure("plug", "ceps")
			end
		elseif faultId == "lap_battery_worn" or faultId == "lap_battery_swollen" then
			tech:replace("battery")
		elseif faultId == "lap_screen" then
			tech:replace("screen")
		elseif faultId == "lap_keyboard" then
			tech:ensure("clean_liquid", "lboard")
			tech:replace("keyboard")
		elseif faultId == "lap_fan_noisy" then
			tech:replace("lfan")
		elseif faultId == "lap_dcjack" then
			tech:replace("dcjack")
			if Rules.isSoldered(dev, "dcjack") then
				tech:ensure("solder", "dcjack")
			end
		elseif faultId == "lap_hinge" then
			tech:replace("hinges")
		elseif faultId == "lap_liquid" then
			for _ = 1, 4 do
				if (dev.liquid or 0) <= 0.02 then
					break
				end
				tech:ensure("clean_liquid", "lboard")
			end
		elseif faultId == "lap_wifi" then
			tech:replace("lwifi")
		else
			error("bot doesn't know how to fix " .. faultId)
		end
	end

	T.test("every fault manifests and the technician can fix it", function()
		local rng = Mock.Random.new(42)
		local tested = {}
		for _, f in Faults.list do
			local done = 0
			local attempts = 0
			while done < 12 and attempts < 200 do
				attempts += 1
				local dev
				if f.device == "laptop" or (f.device == "any" and attempts % 2 == 0) then
					dev = DeviceGen.laptop(rng)
				else
					dev = DeviceGen.desktop(rng, Rules.FanOrder and ({ "budget", "mid", "high", "office", "retro", "enthusiast" })[attempts % 6 + 1])
				end
				if DeviceGen.applyFault(dev, f.id, rng) then
					local before = Rules.evaluate(dev, "stress")
					local manifests = before.stage ~= "ok" or #before.issues > 0
					if not manifests and f.id == "cap_bulged" then
						manifests = Rules.evaluate(dev, "post").stage ~= "ok"
					end
					T.ok(manifests, f.id .. " does not manifest on " .. dev.kind .. " " .. tostring(dev.model))
					local tech = Technician.new(Rules, Parts, Tools, dev, rng)
					local ok, err = pcall(function()
						fix(tech, dev, f.id)
						tech:reassemble()
					end)
					if not ok then
						error(string.format("fixing %s on %s %s failed: %s", f.id, dev.kind, tostring(dev.model), tostring(err)))
					end
					local after = Rules.evaluate(dev, "stress")
					T.ok(after.stage == "ok", string.format("%s still failing after fix: %s (%s)\n%s", f.id, after.stage, tostring(dev.model), tech:tail(20)))
					T.ok(#after.issues == 0, string.format("%s leaves issues: %s\n%s", f.id, table.concat(after.issues, ","), tech:tail(20)))
					done += 1
				end
			end
			T.ok(done > 0, "could not generate any device for fault " .. f.id)
			tested[f.id] = done
		end
	end)

	T.test("requests: upgrades, maintenance and builds can be completed", function()
		local rng = Mock.Random.new(99)
		for _, reqId in { "upgrade_ram", "upgrade_ssd", "upgrade_gpu", "maintenance", "build" } do
			local done, attempts = 0, 0
			while done < 8 and attempts < 300 do
				attempts += 1
				local dev
				if reqId == "build" then
					dev = DeviceGen.emptyCase(({ "case_4000d", "case_o11evo", "case_north", "case_popair" })[attempts % 4 + 1])
				elseif reqId == "upgrade_gpu" then
					dev = DeviceGen.desktop(rng, ({ "budget", "mid", "retro" })[attempts % 3 + 1])
				elseif attempts % 2 == 0 then
					dev = DeviceGen.laptop(rng)
				else
					dev = DeviceGen.desktop(rng, ({ "budget", "office", "retro", "mid" })[attempts % 4 + 1])
				end
				local req = DeviceGen.applyRequest(dev, reqId, rng, if reqId == "build" then 1500 else 600)
				if req then
					local tech = Technician.new(Rules, Parts, Tools, dev, rng)
					if reqId == "upgrade_ram" then
						-- fill every slot with the biggest compatible stick
						local ids = if dev.kind == "desktop" then { "ram1", "ram2", "ram3", "ram4" } else { "lram1", "lram2" }
						local biggest = 0
						for _, id in ids do
							if Rules.available(dev, id) then
								for _, p in Parts.byCat.ram do
									if Rules.compatible(dev, id, p, "en") then
										biggest = math.max(biggest, p.size)
									end
								end
							end
						end
						for _, id in ids do
							if Rules.available(dev, id) then
								tech:replace(id, function(p)
									return p.size >= biggest
								end)
							end
						end
					elseif reqId == "upgrade_ssd" then
						local slot = if dev.kind == "desktop" then (if Rules.available(dev, "nvme1") then "nvme1" else "ssd1") else "lnvme"
						if dev.nodes[slot].st == "in" then
							slot = if dev.kind == "desktop" then "ssd1" else "lnvme"
						end
						tech:replace(slot, function(p)
							return p.kind == "nvme" or p.kind == "ssd25"
						end)
						tech:reassemble()
						tech:ensure("software", nil, { program = "os_install" })
					elseif reqId == "upgrade_gpu" then
						tech:replace("gpu", function(p)
							return p.perf >= req.gpuMin and not p.workstation
						end)
						-- a bigger card may need a bigger PSU
						local cpu, gpu = Rules.part(dev, "cpu"), Rules.part(dev, "gpu")
						local psu = Rules.part(dev, "psu")
						if psu.watt < Parts.systemDraw(cpu, gpu) * 1.1 then
							tech:replace("psu", function(p)
								return p.watt >= Parts.systemDraw(cpu, gpu) * 1.3
							end)
						end
					elseif reqId == "maintenance" then
						tech:dustAll()
						tech:repaste()
					elseif reqId == "build" then
						tech:ensure("remove", "side_panel")
						local psuPart = tech:partFor("psu", function(p)
							return p.watt >= 850 and p.form == "ATX"
						end)
						tech:ensure("install", "psu", { source = "inv", part = psuPart.id })
						local cpuPart = Parts.get("cpu_r7_7800x3d")
						local moboPart = tech:partFor("mobo", function(p)
							return p.socket == cpuPart.socket and p.form == "ATX"
						end)
						tech:ensure("install", "mobo", { source = "inv", part = moboPart.id })
						tech:ensure("open_latch", "cpu_arm")
						tech:ensure("install", "cpu", { source = "inv", part = cpuPart.id })
						tech:ensure("close_latch", "cpu_arm")
						tech:ensure("apply_paste", "cpu", { amount = 0.5 })
						tech:ensure("install", "cooler", { source = "inv", part = "cool_ak620d" })
						for _, slot in { "ram2", "ram4" } do
							tech:ensure("open_latch", slot .. "_clip")
							tech:ensure("install", slot, { source = "inv", part = "ram_ddr5_16_6000rgb" })
						end
						tech:ensure("install", "gpu", { source = "inv", part = "gpu_rtx4070s" })
						tech:ensure("install", "nvme1", { source = "inv", part = "st_nv1t990" })
						tech:reassemble()
						tech:ensure("software", nil, { program = "os_install" })
					end
					tech:reassemble()
					local ev = Rules.evaluate(dev, "stress")
					T.ok(ev.stage == "ok", reqId .. " stage " .. ev.stage .. "\n" .. tech:tail(15))
					local ok, unmet = DeviceGen.meets(dev, req)
					T.ok(ok, reqId .. " unmet: " .. table.concat(unmet, ","))
					done += 1
				end
			end
			T.ok(done > 0, "no device for request " .. reqId)
		end
	end)

	T.test("rules refuse nonsense", function()
		local rng = Mock.Random.new(5)
		local dev = DeviceGen.desktop(rng, "mid")
		local ctx = { tool = "hand", owned = { hand = true, screwdriver_ph2 = true }, lang = "tr" }
		local r = Rules.apply(dev, "remove", "gpu", nil, ctx)
		T.ok(not r.ok and r.reason == "remove_first", "gpu removal with panel on: " .. tostring(r.reason))
		r = Rules.apply(dev, "unscrew", "gpu_s1", nil, { tool = "hand", owned = ctx.owned, lang = "tr" })
		T.ok(not r.ok, "hand can't unscrew PH2")
		r = Rules.apply(dev, "remove", "nonexistent", nil, ctx)
		T.ok(not r.ok and r.reason == "not_present", "unknown node")
		r = Rules.apply(dev, "install", "cpu", { source = "inv", part = "gpu_rtx4090" }, ctx)
		T.ok(not r.ok, "gpu into cpu slot")
		T.ok(type(r.msg) == "string" and #r.msg > 0, "message text")
		-- ESD: removing RAM without a strap with a forced rng can damage it
		local esdDev = DeviceGen.desktop(rng, "mid")
		local tech = Technician.new(Rules, Parts, Tools, esdDev, rng)
		tech:ensure("remove", "side_panel")
		local stick
		for i = 1, 4 do
			if esdDev.nodes["ram" .. i].st == "in" then
				stick = "ram" .. i
				break
			end
		end
		tech:ensure("open_latch", stick .. "_clip")
		local always = { NextNumber = function()
			return 0
		end }
		r = Rules.apply(esdDev, "remove", stick, nil, { tool = "hand", owned = { hand = true }, lang = "en", rng = always })
		T.ok(r.ok and r.esd == stick, "ESD should damage the unprotected stick")
		T.eq(esdDev.hidden[stick], "faulty", "esd flag")
	end)

	T.test("view hides faults", function()
		local rng = Mock.Random.new(11)
		local dev = DeviceGen.desktop(rng, "mid")
		DeviceGen.applyFault(dev, "psu_dead", rng)
		DeviceGen.applyFault(dev, "cap_bulged", rng)
		local v = Rules.view(dev)
		T.ok(v.hidden == nil and v.faults == nil, "hidden leaked")
		local sawCap = false
		for id, f in v.visible do
			if f == "bulged" then
				sawCap = true
			end
			T.ok(f ~= "dead", "dead psu must not be visible")
		end
		T.ok(sawCap, "bulged capacitor should be visible")
	end)
end
