-- Bench device models: every device builds, follows the state through a full teardown and
-- reassembly, keeps removed parts on the bench, and the animated path lands where the instant one does.

local Engine = require("../lib/Engine")
local Technician = require("../lib/Technician")
local Mock = require("../lib/Mock")
local roblox = require("@lune/roblox")
local CFrame, Instance = roblox.CFrame, roblox.Instance

return function(T)
	Engine.context = "server"
	Engine.load("build/PCTamirci.rbxlx")
	local Parts = Engine.mod("ReplicatedStorage.Shared.Data.Parts")
	local Tools = Engine.mod("ReplicatedStorage.Shared.Data.Tools")
	local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local Templates = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceTemplates")
	local PCModel = Engine.mod("ReplicatedStorage.Shared.Models.PCModel")

	local ROOT = CFrame.new(40, 3.45, -12) * CFrame.Angles(0, math.rad(90), 0)

	local function check(handle, view, label)
		local tmpl = Templates[view.kind]
		for _, id in tmpl.order do
			local tn = tmpl.nodes[id]
			if tn.kind ~= "cable" then
				local rec = handle.recs[id]
				T.ok(rec ~= nil, label .. ": no record for " .. id)
				local s = view.nodes[id]
				local shouldShow = Rules.available(view, id) and s and s.st ~= "empty"
				if tn.kind == "comp" then
					shouldShow = shouldShow and s.part ~= nil
				end
				if shouldShow and tn.kind ~= "screw" then
					T.ok(rec.model ~= nil, label .. ": " .. id .. " (" .. tostring(s.st) .. ") has no model")
				end
				if rec.model then
					T.ok(rec.model:GetAttribute("NodeId") == id, label .. ": NodeId attribute on " .. id)
					local p = handle.root:PointToObjectSpace(rec.world.Position)
					-- everything stays on the desk (desk spans about x -5.6..4.4, z -2.3..2.3 in the device frame)
					T.ok(p.X > -5.7 and p.X < 4.6 and p.Z > -2.8 and p.Z < 2.5 and p.Y > -0.2 and p.Y < 4, string.format("%s: %s left the bench (%.2f, %.2f, %.2f)", label, id, p.X, p.Y, p.Z))
				end
			end
		end
	end

	T.test("pcmodel: devices of every tier and class build", function()
		local rng = Mock.Random.new(11)
		local tiers = { "retro", "office", "budget", "mid", "high", "enthusiast", "workstation" }
		for i = 1, 28 do
			local dev = if i % 4 == 0 then DeviceGen.laptop(rng) else DeviceGen.desktop(rng, tiers[(i % #tiers) + 1])
			local folder = Instance.new("Folder")
			folder.Parent = Engine.workspace
			local view = Rules.view(dev)
			local h = PCModel.build(folder, view, ROOT)
			check(h, view, dev.kind .. " " .. tostring(dev.model))
			T.ok(#h.model:GetDescendants() > 120, "suspiciously small model")
			-- picking: a part of the CPU / battery resolves to its node
			local probe = if dev.kind == "desktop" then "cpu" else "battery"
			local rec = h.recs[probe]
			if rec and rec.model then
				local part = rec.model:FindFirstChildWhichIsA("BasePart", true)
				T.eq(h:nodeOf(part), probe, "nodeOf")
			end
			h:destroy()
			folder:Destroy()
		end
	end)

	T.test("pcmodel: follows a full teardown and rebuild", function()
		local rng = Mock.Random.new(5)
		for i = 1, 6 do
			local dev = if i % 2 == 0 then DeviceGen.laptop(rng) else DeviceGen.desktop(rng, if i == 1 then "high" else "mid")
			local folder = Instance.new("Folder")
			folder.Parent = Engine.workspace
			local h = PCModel.build(folder, Rules.view(dev), ROOT)
			local tech = Technician.new(Rules, Parts, Tools, dev, rng)
			local steps = if dev.kind == "desktop" then { "gpu", "cooler", "ram1", "psu", "mobo" } else { "battery", "lfan", "lnvme", "keyboard" }
			for _, id in steps do
				if dev.nodes[id].st == "in" then
					tech:ensure("remove", id)
					h:update(Rules.view(dev))
					check(h, Rules.view(dev), dev.kind .. " after removing " .. id)
				end
			end
			-- removed parts lie apart from each other on the mat
			local outs = {}
			for id, rec in h.recs do
				local s = dev.nodes[id]
				if rec.model and s and s.st == "out" and rec.kind ~= "screw" and not rec.spec.lean then
					table.insert(outs, h.root:PointToObjectSpace(rec.world.Position))
				end
			end
			for a = 1, #outs do
				for b = a + 1, #outs do
					T.ok((outs[a] - outs[b]).Magnitude > 0.05, "two removed parts landed on the same spot")
				end
			end
			tech:reassemble()
			local view = Rules.view(dev)
			h:update(view)
			check(h, view, dev.kind .. " reassembled")
			h:destroy()
			folder:Destroy()
		end
	end)

	T.test("pcmodel: laptop flips and opens", function()
		local rng = Mock.Random.new(9)
		local dev = DeviceGen.laptop(rng, { "gaming15" })
		local folder = Instance.new("Folder")
		folder.Parent = Engine.workspace
		local h = PCModel.build(folder, Rules.view(dev), ROOT)
		local up0 = h.recs.base.world.UpVector
		local ctx = { tool = "hand", lang = "tr" }
		T.ok(Rules.apply(dev, "flip", nil, {}, ctx).ok, "flip")
		h:update(Rules.view(dev))
		T.ok(h.recs.base.world.UpVector:Dot(up0) < -0.9, "base turned over")
		T.ok(Rules.apply(dev, "flip", nil, {}, ctx).ok, "flip back")
		T.ok(Rules.apply(dev, "lid", nil, {}, ctx).ok, "open lid")
		h:update(Rules.view(dev))
		local lidUp = h.recs.lid.world.LookVector
		T.ok(math.abs(lidUp.Y) > 0.8, "lid stands up when open")
		h:destroy()
		folder:Destroy()
	end)

	T.test("pcmodel: animations land on the final pose", function()
		local rng = Mock.Random.new(21)
		local dev = DeviceGen.desktop(rng, "mid")
		local folder = Instance.new("Folder")
		folder.Parent = Engine.workspace
		local animated = PCModel.build(folder, Rules.view(dev), ROOT, { animate = true })
		local tech = Technician.new(Rules, Parts, Tools, dev, rng)
		tech:ensure("remove", "side_panel")
		tech:ensure("remove", "gpu")
		local view = Rules.view(dev)
		animated:update(view)
		T.ok(animated:busy(), "transitions queued")
		local frames = 0
		while animated:step(1 / 60) do
			frames += 1
			T.ok(frames < 600, "animation never finished")
		end
		local instant = PCModel.build(folder, view, ROOT)
		for id, rec in instant.recs do
			local a = animated.recs[id]
			if rec.world and a and a.world and rec.model then
				T.ok((rec.world.Position - a.world.Position).Magnitude < 1e-3, "animated " .. id .. " ended elsewhere")
			end
		end
		animated:destroy()
		instant:destroy()
		folder:Destroy()
	end)
end
