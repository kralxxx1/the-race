-- ToolboxFit: turns a model somebody else made (loaded from the Creator Store) into something the
-- game can use safely and put where it belongs.
--   sanitize(model)             everything that could run, make noise or get in the way is removed
--                               (scripts first: nothing from outside ever runs); parts are anchored
--                               and do not collide
--   fit(model, spec, hint?)     finds which way the thing stands, puts its working end / foot on the
--                               origin, scales it, adds an invisible Root and returns the model (or
--                               nil with a reason when it does not look like what the slot wants).
--                               `hint` (from Data/ToolboxAssets) says where the tip / the top is in
--                               the model as it was made; without one all 24 quarter turns are tried
--                               and scored, the way the model was made counting for a little
-- Pure geometry: it works the same in the game, in Studio and in the headless tests.

local ToolboxFit = {}

-- (a Tool is not on this list: its Handle and parts are what we want; the Tool itself is thrown away
-- with the container once the parts are copied out)
local DROP = {
	"LuaSourceContainer", "Sound", "SoundGroup", "ParticleEmitter", "Trail", "Beam", "Fire", "Smoke", "Sparkles",
	"Light", "Seat", "VehicleSeat", "ClickDetector", "ProximityPrompt", "BillboardGui", "SurfaceGui", "ScreenGui",
	"Humanoid", "Animator", "AnimationController", "Constraint", "WeldConstraint", "JointInstance", "BodyMover",
	"BindableEvent", "BindableFunction", "RemoteEvent", "RemoteFunction", "ValueBase", "Configuration",
	"ForceField", "Explosion", "Highlight", "SelectionBox", "Script",
}

ToolboxFit.MAX_PARTS = 400

-- Removes everything but parts and meshes; returns how many parts are left.
function ToolboxFit.sanitize(model: Instance): number
	-- scripts first, before anything else is touched
	for _, d in model:GetDescendants() do
		if d:IsA("LuaSourceContainer") then
			d:Destroy()
		end
	end
	for _, d in model:GetDescendants() do
		if d.Parent then
			for _, cls in DROP do
				if d:IsA(cls) then
					d:Destroy()
					break
				end
			end
		end
	end
	local n = 0
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			n += 1
			d.Anchored = true
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			d.Massless = true
			pcall(function()
				d.CastShadow = d.Size.Magnitude > 1
			end)
		end
	end
	return n
end

-- the 24 ways to turn something by quarter turns, the identity first
local TURN_LIST: { CFrame } = {}
do
	local seen = {}
	for rx = 0, 3 do
		for ry = 0, 3 do
			for rz = 0, 3 do
				local cf = CFrame.Angles(rx * math.pi / 2, ry * math.pi / 2, rz * math.pi / 2)
				local function r(v: number): number
					return math.floor(v + 0.5)
				end
				local key = string.format("%d,%d,%d|%d,%d,%d|%d,%d,%d", r(cf.RightVector.X), r(cf.RightVector.Y), r(cf.RightVector.Z), r(cf.UpVector.X), r(cf.UpVector.Y), r(cf.UpVector.Z), r(cf.LookVector.X), r(cf.LookVector.Y), r(cf.LookVector.Z))
				if not seen[key] then
					seen[key] = true
					table.insert(TURN_LIST, cf)
				end
			end
		end
	end
end
ToolboxFit.TURN_COUNT = #TURN_LIST

local DIRS: { [string]: Vector3 } = {
	["+X"] = Vector3.new(1, 0, 0),
	["-X"] = Vector3.new(-1, 0, 0),
	["+Y"] = Vector3.new(0, 1, 0),
	["-Y"] = Vector3.new(0, -1, 0),
	["+Z"] = Vector3.new(0, 0, 1),
	["-Z"] = Vector3.new(0, 0, -1),
}

-- The first turn that makes direction `target` of the finished model the direction `authored` of the
-- model as it was made (so: the model's own `authored` end ends up where `target` points).
local function turnFor(authored: Vector3, target: Vector3): CFrame?
	for _, turn in TURN_LIST do
		if (turn:VectorToWorldSpace(target) - authored).Magnitude < 1e-3 then
			return turn
		end
	end
	return nil
end

local function parts(model: Instance): { BasePart }
	local out = {}
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 1 then
			table.insert(out, d)
		end
	end
	return out
end

-- The box that holds everything, in `frame`'s space: lo, hi.
local function bounds(list: { BasePart }, frame: CFrame): (Vector3, Vector3)
	local lo, hi = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
	local inv = frame:Inverse()
	for _, p in list do
		local cf = inv * p.CFrame
		local s = p.Size
		for _, sx in { -0.5, 0.5 } do
			for _, sy in { -0.5, 0.5 } do
				for _, sz in { -0.5, 0.5 } do
					local v = cf * Vector3.new(s.X * sx, s.Y * sy, s.Z * sz)
					lo = lo:Min(v)
					hi = hi:Max(v)
				end
			end
		end
	end
	return lo, hi
end

-- How wide the model is along its height (Y in `frame`): the widest cross-section among the parts
-- that reach each of `n` equal slices. A thin end is a small number, one part of one single mesh says
-- nothing (every slice is as wide as it).
local function profile(list: { BasePart }, frame: CFrame, lo: Vector3, hi: Vector3, n: number): { number }
	local inv = frame:Inverse()
	local height = math.max(hi.Y - lo.Y, 1e-6)
	local out = table.create(n, 0)
	for _, p in list do
		local cf = inv * p.CFrame
		local s = p.Size
		local r = cf.Rotation
		local halfY = (math.abs(r.RightVector.Y) * s.X + math.abs(r.UpVector.Y) * s.Y + math.abs(r.LookVector.Y) * s.Z) / 2
		local ex = math.abs(r.RightVector.X) * s.X + math.abs(r.UpVector.X) * s.Y + math.abs(r.LookVector.X) * s.Z
		local ez = math.abs(r.RightVector.Z) * s.X + math.abs(r.UpVector.Z) * s.Y + math.abs(r.LookVector.Z) * s.Z
		local w = math.max(ex, ez)
		local y0, y1 = (cf.Position.Y - halfY - lo.Y) / height, (cf.Position.Y + halfY - lo.Y) / height
		for i = 1, n do
			local mid = (i - 0.5) / n
			if mid >= y0 and mid <= y1 and w > out[i] then
				out[i] = w
			end
		end
	end
	return out
end

-- Mean of profile slices `a..b`.
local function mean(values: { number }, a: number, b: number): number
	local sum, k = 0, 0
	for i = a, b do
		sum += values[i]
		k += 1
	end
	return sum / math.max(k, 1)
end

-- Score of standing the model in turn `turn`: tall and slender for a tool (the thin end below a bonus),
-- tall with the wide part on top for an upright. The way the model was made (the identity turn) is
-- worth a little, so a model of one single mesh, which says nothing about which end is which, stays
-- the way its maker stood it.
local function score(list: { BasePart }, turn: CFrame, kind: string, index: number): (number, Vector3, Vector3)
	local lo, hi = bounds(list, turn)
	local size = hi - lo
	local height = size.Y
	local width = math.max(size.X, size.Z)
	local s = height / math.max(width, 1e-6)
	local prior = if index == 1 then 0.25 else 0
	local prof = profile(list, turn, lo, hi, 8)
	if kind == "tool" then
		-- the thin end (the tip) should be below
		local low, high = mean(prof, 1, 2), mean(prof, 7, 8)
		local bonus = if low < high * 0.85 then 0.5 elseif low > high * 1.15 then -0.5 else 0
		return s + bonus + prior, lo, hi
	end
	-- upright: the wide part (the canopy) in the upper part, the foot narrow
	local low, high = mean(prof, 1, 2), math.max(mean(prof, 5, 6), mean(prof, 7, 8))
	local top = if low < high * 0.8 then 1 elseif low > high * 1.25 then -1 else 0
	-- (and the biggest part, when there are several, is up there too)
	local biggest, bigVol = nil, 0
	for _, p in list do
		local v = p.Size.X * p.Size.Y * p.Size.Z
		if v > bigVol then
			biggest, bigVol = p, v
		end
	end
	local up = 0
	if biggest and #list > 1 then
		local c = (turn:Inverse() * biggest.Position).Y
		local mid = (lo.Y + hi.Y) / 2
		up = if c > mid + 1e-3 then 1 elseif c < mid - 1e-3 then -1 else 0
	end
	return up + top * 2 + math.min(s, 2) * 0.5 + prior * 4, lo, hi
end

-- spec: { kind = "tool" | "upright", length / height (studs), grip (upright), name }
-- hint: { tip = "+X" ... } for a tool, { up = "+Y" ... } for an upright (optional)
-- Returns the fitted model (a new Model, "Root" at the origin, standing up +Y), or nil, reason.
function ToolboxFit.fit(source: Instance, spec, hint): (Model?, string?)
	local container = source:Clone()
	local count = ToolboxFit.sanitize(container)
	if count == 0 then
		container:Destroy()
		return nil, "no parts"
	end
	if count > ToolboxFit.MAX_PARTS then
		container:Destroy()
		return nil, "too many parts (" .. count .. ")"
	end
	local list = parts(container)
	if #list == 0 then
		container:Destroy()
		return nil, "everything is invisible"
	end
	-- a huge part is a sign of a broken model
	for _, p in list do
		if p.Size.Magnitude > 400 then
			container:Destroy()
			return nil, "a part is far too big"
		end
	end
	local turn: CFrame? = nil
	local lo, hi
	local want = if spec.kind == "tool" then hint and hint.tip else (if hint then hint.up else nil)
	local dir = if want then DIRS[want] else nil
	if want and not dir then
		container:Destroy()
		return nil, "unknown direction " .. tostring(want)
	end
	if dir then
		-- a tool's tip goes to -Y (the origin end), an upright's top to +Y
		turn = turnFor(dir, if spec.kind == "tool" then Vector3.new(0, -1, 0) else Vector3.new(0, 1, 0))
		if turn then
			lo, hi = bounds(list, turn)
		end
	end
	if not turn then
		local bestScore = -math.huge
		for i, t in TURN_LIST do
			local sc, l, h = score(list, t, spec.kind, i)
			if sc > bestScore then
				turn, bestScore, lo, hi = t, sc, l, h
			end
		end
	end
	local height = hi.Y - lo.Y
	local width = math.max(hi.X - lo.X, hi.Z - lo.Z)
	if height < 0.01 then
		container:Destroy()
		return nil, "flat"
	end
	if spec.kind == "tool" and height < width * 1.8 then
		container:Destroy()
		return nil, "not slender enough"
	end
	if spec.kind == "upright" and (height < width * 0.3 or height > width * 6) then
		container:Destroy()
		return nil, "not the right shape for an upright"
	end
	-- the foot on the origin, centred
	local foot = Vector3.new((lo.X + hi.X) / 2, lo.Y, (lo.Z + hi.Z) / 2)
	local scale = (if spec.kind == "tool" then spec.length else spec.height) / height
	local model = Instance.new("Model")
	model.Name = spec.name or "Toolbox"
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(0.2, 0.2, 0.2)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.CastShadow = false
	root.CFrame = CFrame.new()
	root.Parent = model
	model.PrimaryPart = root
	-- the parts keep their places relative to each other; the whole is moved so the foot is the origin
	local inv = (turn :: CFrame):Inverse()
	local fileMesh: any = nil
	pcall(function()
		fileMesh = Enum.MeshType.FileMesh
	end)
	for _, p in list do
		local rel = inv * p.CFrame
		local c = p:Clone()
		for _, ch in c:GetChildren() do
			if not ch:IsA("DataModelMesh") and not ch:IsA("SurfaceAppearance") and not ch:IsA("Texture") and not ch:IsA("Decal") then
				ch:Destroy()
			elseif ch:IsA("SpecialMesh") then
				-- (a mesh from a file is drawn at its own size times Scale, whatever the part's Size is)
				local isFile = true
				if fileMesh ~= nil then
					local okType, t = pcall(function()
						local mesh = ch :: any
						return mesh.MeshType
					end)
					isFile = okType and t == fileMesh
				end
				if isFile then
					pcall(function()
						local mesh = ch :: any
						mesh.Scale = mesh.Scale * scale
						mesh.Offset = mesh.Offset * scale
					end)
				end
			end
		end
		c.Anchored = true
		c.CFrame = CFrame.new((rel.Position - foot) * scale) * rel.Rotation
		c.Size = p.Size * scale
		c.Parent = model
	end
	container:Destroy()
	model:SetAttribute("Size", Vector3.new(width, height, width) * scale)
	model:SetAttribute("Kind", spec.kind)
	if spec.kind == "upright" then
		local grip = Instance.new("Attachment")
		grip.Name = "GripPoint"
		grip.Position = Vector3.new(0, height * scale * (spec.grip or 0.12), 0)
		grip.Parent = root
	end
	return model, nil
end

return ToolboxFit
