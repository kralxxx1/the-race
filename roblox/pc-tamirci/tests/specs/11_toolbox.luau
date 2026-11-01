-- Published models (Creator Store): the fitting of a model somebody else made (any way round, scripts and
-- noise thrown away), the loader with a made-up Creator Store, and the places that use the result: the
-- screwdriver on the bench and the umbrella in somebody's hand. The real Creator Store cannot be asked
-- here; whatever it hands over is simulated by models built below in different orientations.

local Engine = require("../lib/Engine")
local roblox = require("@lune/roblox")
local CFrame, Instance, Vector3, Color3 = roblox.CFrame, roblox.Instance, roblox.Vector3, roblox.Color3

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local Workspace = game:GetService("Workspace")
	local Fit = Engine.mod("ReplicatedStorage.Shared.Models.ToolboxFit")
	local Manifest = Engine.mod("ReplicatedStorage.Shared.Data.ToolboxAssets")
	local Loader = Engine.mod("ReplicatedStorage.Shared.Util.ToolboxLoader")
	local ToolModels = Engine.mod("ReplicatedStorage.Shared.Models.ToolModels")
	local Umbrella = Engine.mod("ReplicatedStorage.Shared.Models.Umbrella")
	local Assets = Engine.mod("ReplicatedStorage.Shared.Util.Assets")
	local Service = Engine.mod("ServerScriptService.Server.Services.ToolboxService")

	local function box(parent, name, size, cf, color)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.CFrame = cf
		p.Color = color or Color3.fromRGB(180, 40, 40)
		p.Anchored = false
		p.CanCollide = true
		p.Parent = parent
		return p
	end

	-- A screwdriver as somebody might have made it: along `axis` (a unit vector), thin shaft with the
	-- tip towards +axis (or -axis with tipAtEnd = false), fat handle behind it.
	local function screwdriver(axis: Vector3, tipFirst: boolean)
		local m = Instance.new("Model")
		local along = if axis.X ~= 0 then "X" elseif axis.Y ~= 0 then "Y" else "Z"
		local function size(len: number, thick: number)
			return if along == "X" then Vector3.new(len, thick, thick) elseif along == "Y" then Vector3.new(thick, len, thick) else Vector3.new(thick, thick, len)
		end
		local sign = if tipFirst then 1 else -1
		-- the shaft: 4 long, centred 2 towards the tip; the handle: 3 long, centred 1.5 behind
		box(m, "Shaft", size(4, 0.12), CFrame.new(axis * (2 * sign)), Color3.fromRGB(190, 190, 195))
		box(m, "Handle", size(3, 0.5), CFrame.new(axis * (-1.5 * sign)), Color3.fromRGB(190, 40, 40))
		box(m, "Grip", size(1, 0.56), CFrame.new(axis * (-1.5 * sign)), Color3.fromRGB(30, 30, 30))
		m.Parent = nil
		return m
	end

	-- extents of the fitted model: lowest and highest point of its parts (turned parts count as turned)
	local function extent(model)
		local lo, hi = math.huge, -math.huge
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") and d.Name ~= "Root" and d.Name ~= "Tip" and d.Name ~= "Grip" then
				local r = d.CFrame
				local half = (math.abs(r.RightVector.Y) * d.Size.X + math.abs(r.UpVector.Y) * d.Size.Y + math.abs(r.LookVector.Y) * d.Size.Z) / 2
				lo = math.min(lo, d.Position.Y - half)
				hi = math.max(hi, d.Position.Y + half)
			end
		end
		return lo, hi
	end

	local spec = Manifest.slots.screwdriver

	T.test("toolbox: sanitize throws away scripts, sounds and joints and leaves parts that do nothing", function()
		local m = Instance.new("Model")
		local p = box(m, "Handle", Vector3.new(1, 1, 3), CFrame.new())
		for _, cls in { "Script", "LocalScript", "ModuleScript" } do
			Instance.new(cls).Parent = p
		end
		Instance.new("Sound").Parent = p
		Instance.new("PointLight").Parent = p
		Instance.new("ParticleEmitter").Parent = p
		Instance.new("ClickDetector").Parent = p
		Instance.new("WeldConstraint").Parent = p
		Instance.new("Script").Parent = m
		-- (a gear: the parts are inside a Tool)
		local tool = Instance.new("Tool")
		tool.Name = "Gear"
		box(tool, "Blade", Vector3.new(1, 1, 5), CFrame.new(0, 0, 4)).Parent = tool
		tool.Parent = m
		local n = Fit.sanitize(m)
		T.eq(n, 2, "parts left")
		for _, d in m:GetDescendants() do
			T.ok(not d:IsA("LuaSourceContainer"), "a script is still there: " .. d.ClassName)
			T.ok(not d:IsA("Sound") and not d:IsA("Light") and not d:IsA("ParticleEmitter") and not d:IsA("ClickDetector") and not d:IsA("WeldConstraint"), "left over: " .. d.ClassName)
			if d:IsA("BasePart") then
				T.ok(d.Anchored and not d.CanCollide and not d.CanTouch and not d.CanQuery, d.Name .. " is not inert")
			end
		end
	end)

	T.test("toolbox: a screwdriver lying along any axis, tip either way, stands tip-down at the origin", function()
		local lengths = {}
		for _, axis in { Vector3.new(1, 0, 0), Vector3.new(0, 0, 1), Vector3.new(0, 1, 0) } do
			for _, tipFirst in { true, false } do
				local src = screwdriver(axis, tipFirst)
				local hint = nil
				-- (the hint says where the tip is in the model as it was made)
				local name = (if axis.X ~= 0 then "X" elseif axis.Y ~= 0 then "Y" else "Z")
				hint = { tip = (if tipFirst then "+" else "-") .. name }
				for pass = 1, 2 do
					local h = if pass == 1 then hint else nil
					local fitted, why = Fit.fit(src, spec, h)
					T.ok(fitted ~= nil, "no fit for " .. tostring(axis) .. " " .. tostring(tipFirst) .. ": " .. tostring(why))
					local lo, hi = extent(fitted)
					T.near(lo, 0, 0.02, "tip on the origin")
					T.near(hi - lo, spec.length, 0.03, "scaled to the tool length")
					local shaft, handle = fitted:FindFirstChild("Shaft"), fitted:FindFirstChild("Handle")
					T.ok(shaft and handle, "parts kept")
					T.ok(shaft.Position.Y < handle.Position.Y, "the tip is up, the handle down (" .. tostring(axis) .. ", tip first " .. tostring(tipFirst) .. ", hint " .. tostring(h ~= nil) .. ")")
					-- thin end low, centred on the axis
					T.near(shaft.Position.X, 0, 0.02, "centred in x")
					T.near(shaft.Position.Z, 0, 0.02, "centred in z")
					T.ok(fitted.PrimaryPart ~= nil and fitted.PrimaryPart.Name == "Root", "a root at the origin")
					T.eq(fitted:GetAttribute("Kind"), "tool")
					lengths[#lengths + 1] = hi - lo
				end
				src:Destroy()
			end
		end
		T.ok(#lengths == 12, "all twelve cases ran")
	end)

	T.test("toolbox: a wrong hint is obeyed (the hint is the maker's word) and a hint that is not a direction is refused", function()
		local src = screwdriver(Vector3.new(1, 0, 0), true) -- tip at +X
		local fitted = Fit.fit(src, spec, { tip = "-X" })
		T.ok(fitted ~= nil)
		local shaft, handle = fitted:FindFirstChild("Shaft"), fitted:FindFirstChild("Handle")
		T.ok(shaft.Position.Y > handle.Position.Y, "the hint said the tip was at -X, so the shaft is the handle end")
		local none, why = Fit.fit(src, spec, { tip = "up" })
		T.ok(none == nil and string.find(tostring(why), "direction", 1, true) ~= nil, "refused: " .. tostring(why))
	end)

	T.test("toolbox: models that are not what the slot wants are turned down with a reason", function()
		-- nothing but scripts
		local empty = Instance.new("Model")
		Instance.new("Script").Parent = empty
		local m, why = Fit.fit(empty, spec, nil)
		T.ok(m == nil and why == "no parts", tostring(why))
		-- a block is not a tool
		local cube = Instance.new("Model")
		box(cube, "Cube", Vector3.new(2, 2, 2), CFrame.new())
		m, why = Fit.fit(cube, spec, nil)
		T.ok(m == nil and why == "not slender enough", tostring(why))
		-- far too many parts
		local heap = Instance.new("Model")
		for i = 1, Fit.MAX_PARTS + 20 do
			box(heap, "P" .. i, Vector3.new(0.2, 3, 0.2), CFrame.new(i * 0.1, 0, 0))
		end
		m, why = Fit.fit(heap, spec, nil)
		T.ok(m == nil and string.find(tostring(why), "too many parts", 1, true) ~= nil, tostring(why))
		-- a slab is no umbrella
		local slab = Instance.new("Model")
		box(slab, "Slab", Vector3.new(30, 0.2, 30), CFrame.new())
		m, why = Fit.fit(slab, Manifest.slots.umbrella, nil)
		T.ok(m == nil, "a slab was taken for an umbrella")
		-- everything transparent
		local ghost = Instance.new("Model")
		local gp = box(ghost, "Ghost", Vector3.new(0.3, 4, 0.3), CFrame.new())
		gp.Transparency = 1
		m, why = Fit.fit(ghost, spec, nil)
		T.ok(m == nil and why == "everything is invisible", tostring(why))
	end)

	-- An umbrella: a thin pole with a handle at the bottom and a wide canopy on top (flip = made upside down).
	local function umbrella(flip: boolean, single: boolean?)
		local m = Instance.new("Model")
		local s = if flip then -1 else 1
		if single then
			box(m, "Mesh", Vector3.new(3.4, 3.6, 3.4), CFrame.new(0, 1.8 * s, 0))
		else
			box(m, "Pole", Vector3.new(0.12, 3.4, 0.12), CFrame.new(0, 1.7 * s, 0), Color3.fromRGB(200, 200, 205))
			box(m, "Canopy", Vector3.new(3.6, 1.1, 3.6), CFrame.new(0, 2.9 * s, 0), Color3.fromRGB(30, 30, 35))
			box(m, "Hook", Vector3.new(0.3, 0.3, 0.3), CFrame.new(0, 0.1 * s, 0), Color3.fromRGB(120, 80, 40))
		end
		return m
	end

	T.test("toolbox: an umbrella is stood canopy up with its foot on the origin and a grip point, made either way up", function()
		local uspec = Manifest.slots.umbrella
		for _, flip in { false, true } do
			local src = umbrella(flip)
			-- hint-less (the parts say which end is the top), and with a hint
			for _, hint in { nil, { up = if flip then "-Y" else "+Y" } } do
				local fitted, why = Fit.fit(src, uspec, hint)
				T.ok(fitted ~= nil, "no fit (flip " .. tostring(flip) .. "): " .. tostring(why))
				local lo, hi = extent(fitted)
				T.near(lo, 0, 0.02, "foot on the origin")
				T.near(hi, uspec.height, 0.03, "height")
				T.ok(fitted.Canopy.Position.Y > fitted.Pole.Position.Y and fitted.Pole.Position.Y > fitted.Hook.Position.Y, "canopy over pole over hook (flip " .. tostring(flip) .. ", hint " .. tostring(hint ~= nil) .. ")")
				local grip = fitted.PrimaryPart:FindFirstChild("GripPoint")
				T.ok(grip ~= nil and grip:IsA("Attachment"), "a grip point")
				T.near(grip.Position.Y, uspec.height * uspec.grip, 0.01, "the hand holds it low down")
				T.eq(fitted:GetAttribute("Kind"), "upright")
			end
			src:Destroy()
		end
	end)

	T.test("toolbox: one single mesh stays the way its maker stood it (nothing in it says which end is the top)", function()
		local uspec = Manifest.slots.umbrella
		local src = umbrella(false, true)
		local fitted = Fit.fit(src, uspec, nil)
		T.ok(fitted ~= nil)
		local lo, hi = extent(fitted)
		T.near(lo, 0, 0.02)
		T.near(hi, uspec.height, 0.03)
		-- (still 3.4 wide for 3.6 tall: no quarter turn took place)
		local size = fitted:GetAttribute("Size")
		T.ok(size.Y > size.X * 0.9, "still standing")
	end)

	----------------------------------------------------------------------------------------------------
	-- the loader with a made-up Creator Store
	----------------------------------------------------------------------------------------------------
	local function store(table_)
		-- id -> function returning a model, a string (an error) or nothing
		return function(id)
			local make = table_[id]
			if make == nil then
				return nil, "not found"
			end
			if type(make) == "string" then
				error(make)
			end
			return make()
		end
	end

	local sd, um = Manifest.slots.screwdriver.ids, Manifest.slots.umbrella.ids

	T.test("toolbox: the loader keeps what fits, up to the slot's limit, and says why the rest was skipped", function()
		local folder = Instance.new("Folder")
		local ids = {}
		for i, e in sd do
			ids[Manifest.idOf(e)] = i
		end
		local s = {}
		-- first screwdriver: not found; second: a cube; third and fourth: fine; fifth: fine (over the limit)
		s[Manifest.idOf(sd[1])] = nil
		s[Manifest.idOf(sd[2])] = function()
			local m = Instance.new("Model")
			box(m, "Cube", Vector3.new(2, 2, 2), CFrame.new())
			return m
		end
		s[Manifest.idOf(sd[3])] = function()
			return screwdriver(Vector3.new(1, 0, 0), false)
		end
		s[Manifest.idOf(sd[4])] = function()
			return screwdriver(Vector3.new(1, 0, 0), false)
		end
		s[Manifest.idOf(sd[5])] = "HTTP 403"
		for _, e in um do
			s[Manifest.idOf(e)] = function()
				return umbrella(false)
			end
		end
		local report = Loader.run(store(s), folder)
		local text = table.concat(report, "\n")
		T.ok(folder:FindFirstChild("screwdriver") ~= nil, "a screwdriver is in:\n" .. text)
		T.ok(folder:FindFirstChild("screwdriver2") ~= nil, "a second one:\n" .. text)
		T.ok(folder:FindFirstChild("screwdriver3") == nil, "only what fits and only " .. Manifest.slots.screwdriver.keep .. " at most")
		T.ok(string.find(text, "not found", 1, true) ~= nil, "the missing one is reported:\n" .. text)
		T.ok(string.find(text, "not slender enough", 1, true) ~= nil, "the cube is reported:\n" .. text)
		T.eq(folder:FindFirstChild("screwdriver"):GetAttribute("ToolboxId"), tostring(Manifest.idOf(sd[3])))
		for _, name in { "umbrella", "umbrella2", "umbrella3" } do
			T.ok(folder:FindFirstChild(name) ~= nil, name .. " is in")
		end
		T.ok(folder:GetAttribute("Report") == text, "the report stays on the folder")
		-- nothing that came from outside has a script
		for _, d in folder:GetDescendants() do
			T.ok(not d:IsA("LuaSourceContainer"), "script in the models")
		end
		-- a second run leaves what is in the place alone, force loads it again
		local calls = 0
		local counting = function(id)
			calls += 1
			return nil, "never"
		end
		report = Loader.run(counting, folder)
		T.eq(calls, 0, "models already in the place are not asked for again")
		T.ok(string.find(table.concat(report, "\n"), "already in the place", 1, true) ~= nil)
		Loader.run(counting, folder, { force = true })
		T.ok(calls > 0, "force asks again")
		T.ok(folder:FindFirstChild("screwdriver") ~= nil, "(a failed load leaves the old model)")
	end)

	T.test("toolbox: a Creator Store that cannot be reached changes nothing and does not crash", function()
		local folder = Instance.new("Folder")
		local report = Loader.run(function()
			error("HTTP 401")
		end, folder)
		T.eq(#folder:GetChildren(), 0)
		T.ok(#report >= 3, "every candidate reported")
		T.ok(Loader.insertService() ~= nil)
		-- (the real provider, in the headless engine InsertService has no LoadAsset: it answers with nil and a reason)
		local m, why = Loader.insertService()(Manifest.idOf(sd[1]))
		T.ok(m == nil and type(why) == "string", "answers nil, why")
	end)

	T.test("toolbox: the service publishes to ReplicatedStorage.Assets.Toolbox and leaves a report on Workspace", function()
		local assets = ReplicatedStorage:FindFirstChild("Assets")
		local old = assets:FindFirstChild("Toolbox")
		if old then
			old:Destroy()
		end
		local s = {}
		s[Manifest.idOf(sd[1])] = function()
			return screwdriver(Vector3.new(1, 0, 0), true)
		end
		s[Manifest.idOf(um[1])] = function()
			return umbrella(false)
		end
		local report = Service.load(store(s))
		local folder = ReplicatedStorage.Assets:FindFirstChild("Toolbox")
		T.ok(folder ~= nil and folder:FindFirstChild("screwdriver") ~= nil and folder:FindFirstChild("umbrella") ~= nil)
		T.ok(Workspace:GetAttribute("ToolboxReport") == table.concat(report, "\n"))
		T.ok(Assets.get("Toolbox", "screwdriver") ~= nil, "Assets.get finds it")
		T.eq(#Assets.names("Toolbox", "umbrella"), 1)
	end)

	----------------------------------------------------------------------------------------------------
	-- the places that use them
	----------------------------------------------------------------------------------------------------
	T.test("toolbox: the bench screwdriver is the published one when it is in the place, ours when it is not", function()
		local folder = ReplicatedStorage.Assets.Toolbox
		-- the published one (put there by the previous test)
		local m = ToolModels.build("screwdriver", nil)
		T.ok(m:GetAttribute("Published") ~= nil, "built from the published model")
		T.ok(m.PrimaryPart ~= nil and m.PrimaryPart.Name == "Tip", "still pointed with its Tip")
		local lo, hi = extent(m)
		T.near(lo, 0, 0.05, "tip at the origin")
		T.near(hi, spec.length, 0.06, "two studs long")
		for _, d in m:GetDescendants() do
			if d:IsA("BasePart") then
				T.ok(d.Anchored, d.Name .. " is not anchored")
			end
		end
		-- the other tools are ours
		T.ok(ToolModels.build("hand", nil):GetAttribute("Published") == nil)
		-- without it: our own lathe-turned one
		local published = folder.screwdriver
		published.Parent = nil
		local own = ToolModels.build("screwdriver", nil)
		T.ok(own:GetAttribute("Published") == nil, "ours when none is in the place")
		T.ok(own:FindFirstChild("Shaft") ~= nil or own:FindFirstChild("Bolster") ~= nil or #own:GetDescendants() > 12, "ours has its parts")
		published.Parent = folder
	end)

	T.test("toolbox: a published umbrella is carried like ours: origin at the hand, welded, a grip point, still scalable", function()
		local m = Umbrella.build(Color3.fromRGB(200, 40, 50))
		T.ok(m:GetAttribute("Published") ~= nil, "published")
		T.ok(m.PrimaryPart ~= nil and m.PrimaryPart.Name == "Grip")
		local grip = m.PrimaryPart:FindFirstChild("GripPoint")
		T.ok(grip ~= nil and grip.Position.Magnitude < 1e-3, "the grip point is the origin")
		local lo, hi = extent(m)
		local welded = 0
		for _, d in m:GetDescendants() do
			if d:IsA("BasePart") and d.Name ~= "Grip" then
				T.ok(not d.Anchored and not d.CanCollide and d.Massless, d.Name .. " is not loose")
				local w = d:FindFirstChildOfClass("WeldConstraint")
				T.ok(w ~= nil and w.Part0 == m.PrimaryPart, d.Name .. " is not welded to the grip")
				welded += 1
			end
		end
		T.ok(welded >= 3, "its parts came along")
		local spec2 = Manifest.slots.umbrella
		T.near(hi, spec2.height * (1 - spec2.grip), 0.05, "the top is where it should be above the hand")
		T.near(lo, -spec2.height * spec2.grip, 0.05, "the foot is a little below it")
		T.ok(m:GetAttribute("Height") > 2 and m:GetAttribute("Radius") > 1, "height and radius")
		-- without published umbrellas ours is built
		local folder = ReplicatedStorage.Assets.Toolbox
		local published = folder.umbrella
		published.Parent = nil
		local own = Umbrella.build(Color3.fromRGB(200, 40, 50))
		T.ok(own:GetAttribute("Published") == nil and own:FindFirstChild("Canopy") ~= nil, "ours when none is in the place")
		published.Parent = folder
	end)
end
