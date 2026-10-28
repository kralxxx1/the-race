-- TechBot: the in-game technician (used by hired staff and by contracts) must be able to fix
-- every fault and fulfil every request on every kind of machine, through the same rules as a
-- player.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")

return function(T)
	Engine.context = "server"
	Engine.load("build/PCTamirci.rbxlx")
	local Faults = Engine.mod("ReplicatedStorage.Shared.Data.Faults")
	local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local TechBot = Engine.mod("ReplicatedStorage.Shared.Repair.TechBot")

	local ALL = setmetatable({}, { __index = function()
		return true
	end })

	-- a bench where every tool is owned and new parts come from the shelf
	local function bot(dev, rng)
		return TechBot.new(dev, {
			ctx = function(_, _, tool)
				return {
					tool = tool,
					owned = ALL,
					lang = "en",
					rng = rng,
					takePart = function(source: string, partId: string, uid: string?)
						if source == "inv" then
							return { part = partId, cond = 1, origin = "new" }
						end
						for k, t in dev.tray do
							if t.uid == uid then
								table.remove(dev.tray, k)
								return { part = t.part, cond = t.cond, hidden = t.hidden, origin = t.origin }
							end
						end
						return nil
					end,
					usePaste = function()
						return 0.88
					end,
					useSolder = function()
						return true
					end,
					useTies = function()
						return true
					end,
				}
			end,
		})
	end

	local TIERS = { "budget", "mid", "high", "office", "retro", "enthusiast", "workstation" }

	local function check(dev, label: string, b)
		local after = Rules.evaluate(dev, "stress")
		local tail = table.concat(b.log, "\n", math.max(1, #b.log - 15))
		T.ok(after.stage == "ok", string.format("%s: still %s on %s %s\n%s", label, after.stage, dev.kind, tostring(dev.model), tail))
		T.ok(#after.issues == 0, string.format("%s: leaves %s on %s %s\n%s", label, table.concat(after.issues, ","), dev.kind, tostring(dev.model), tail))
		local assembled, missing = Rules.assembled(dev)
		T.ok(assembled, string.format("%s: not reassembled (%d steps) on %s", label, #missing, tostring(dev.model)))
	end

	T.test("techbot: fixes every fault on every kind of machine", function()
		local rng = Mock.Random.new(7)
		for _, f in Faults.list do
			local done, attempts = 0, 0
			while done < 14 and attempts < 300 do
				attempts += 1
				local dev
				if f.device == "laptop" or (f.device == "any" and attempts % 3 == 0) then
					dev = DeviceGen.laptop(rng)
				else
					dev = DeviceGen.desktop(rng, TIERS[attempts % #TIERS + 1])
				end
				if DeviceGen.applyFault(dev, f.id, rng) then
					local b = bot(dev, rng)
					local ok, err = pcall(function()
						b:fix(f.id)
						b:reassemble()
					end)
					if not ok then
						error(string.format("%s on %s %s: %s\n%s", f.id, dev.kind, tostring(dev.model), tostring(err), table.concat(b.log, "\n", math.max(1, #b.log - 15))))
					end
					check(dev, f.id, b)
					done += 1
				end
			end
			T.ok(done > 0, "no device for " .. f.id)
		end
	end)

	T.test("techbot: fulfils every request", function()
		local rng = Mock.Random.new(19)
		for _, r in Faults.requests do
			local done, attempts = 0, 0
			while done < 8 and attempts < 300 do
				attempts += 1
				local dev
				if r.id == "build" then
					dev = DeviceGen.emptyCase(({ "case_4000d", "case_o11evo", "case_north", "case_popair" })[attempts % 4 + 1])
				elseif r.device ~= "desktop" and attempts % 2 == 0 then
					dev = DeviceGen.laptop(rng)
				else
					dev = DeviceGen.desktop(rng, TIERS[attempts % #TIERS + 1])
				end
				local req = DeviceGen.applyRequest(dev, r.id, rng, if r.id == "build" then 1500 elseif r.id == "upgrade_gpu" then 600 else nil)
				if req then
					local b = bot(dev, rng)
					local ok, err = pcall(function()
						b:fulfil(r.id, req)
						b:reassemble()
					end)
					if not ok then
						local msg = if type(err) == "table" then "needs a " .. tostring(err.needPart) .. " for " .. tostring(err.node) else tostring(err)
						error(string.format("%s on %s %s: %s\n%s", r.id, dev.kind, tostring(dev.model), msg, table.concat(b.log, "\n", math.max(1, #b.log - 15))))
					end
					check(dev, r.id, b)
					local met, unmet = DeviceGen.meets(dev, req)
					T.ok(met, string.format("%s unmet: %s on %s", r.id, table.concat(unmet, ","), tostring(dev.model)))
					done += 1
				end
			end
			T.ok(done > 0, "no device for " .. r.id)
		end
	end)
end
