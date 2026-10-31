-- Umbrella: the umbrellas people carry in the rain. A smooth dome canopy (the dome mesh from the
-- official House Props pack, stretched wide and low and painted in fabric), a rim of trim, eight ribs
-- under it, a chrome shaft with a finial and a dark handle. The model's origin is the middle of the
-- handle (where the hand closes round it) and it stands up the +Y axis. Umbrella.carry puts one in
-- somebody's hand: held beside the head, the arm reaching up to it by inverse kinematics, so the
-- walking animation does not swing the umbrella about.

local Assets = require(script.Parent.Parent.Util.Assets)

local Umbrella = {}

local R = 2.2 -- the canopy's radius
local RIM_Y = 1.5 -- height of the rim above the handle's middle (about a head's height over the hand)
local RISE = 1.25 -- how high the dome stands above the rim

Umbrella.COLORS = {
	Color3.fromRGB(200, 40, 50),
	Color3.fromRGB(30, 90, 190),
	Color3.fromRGB(34, 36, 42),
	Color3.fromRGB(240, 190, 30),
	Color3.fromRGB(40, 150, 90),
	Color3.fromRGB(150, 60, 170),
	Color3.fromRGB(235, 120, 40),
	Color3.fromRGB(226, 228, 236),
	Color3.fromRGB(36, 150, 190),
	Color3.fromRGB(190, 70, 120),
}

local function part(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material, shape: Enum.PartType?): Part
	local p = Instance.new("Part")
	p.Name = name
	if shape then
		p.Shape = shape
	end
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material
	p.Anchored = false
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Massless = true
	p.Parent = parent
	return p
end

-- A cylinder along Y (Roblox cylinders lie along X).
local function rod(parent: Instance, name: string, length: number, diameter: number, cf: CFrame, color: Color3, material: Enum.Material): Part
	return part(parent, name, Vector3.new(length, diameter, diameter), cf * CFrame.Angles(0, 0, math.rad(90)), color, material, Enum.PartType.Cylinder)
end

-- color: the fabric. Returns the model (nothing anchored: it is welded together and to the carrier).
function Umbrella.build(color: Color3): Model
	local m = Instance.new("Model")
	m.Name = "Umbrella"
	local root = part(m, "Grip", Vector3.new(0.2, 0.2, 0.2), CFrame.new(), Color3.new(0, 0, 0), Enum.Material.SmoothPlastic)
	root.Transparency = 1
	m.PrimaryPart = root
	local function weld(p: BasePart)
		local w = Instance.new("WeldConstraint")
		w.Part0 = root
		w.Part1 = p
		w.Parent = p
	end
	local dark = Color3.fromRGB(34, 34, 38)
	local chrome = Color3.fromRGB(190, 194, 202)
	-- the handle: a rubber grip with a rounded end
	weld(rod(m, "Handle", 0.95, 0.2, CFrame.new(0, 0, 0), dark, Enum.Material.Rubber))
	weld(part(m, "HandleEnd", Vector3.new(0.26, 0.26, 0.26), CFrame.new(0, -0.5, 0), dark, Enum.Material.Rubber, Enum.PartType.Ball))
	weld(rod(m, "Collar", 0.1, 0.16, CFrame.new(0, 0.5, 0), chrome, Enum.Material.Metal))
	-- the shaft up to the finial
	local top = RIM_Y + RISE
	weld(rod(m, "Shaft", top - 0.5, 0.075, CFrame.new(0, 0.5 + (top - 0.5) / 2, 0), chrome, Enum.Material.Metal))
	-- the canopy: the dome mesh stretched wide and low, its rim at RIM_Y
	local dome = Assets.get("Props", "Dome")
	local glass: MeshPart? = nil
	if dome then
		for _, d in dome:GetDescendants() do
			if d:IsA("MeshPart") and string.find(d.Name, "Glass", 1, true) then
				glass = d
			end
		end
	end
	if glass then
		local c = glass:Clone() :: MeshPart
		for _, ch in c:GetChildren() do
			ch:Destroy()
		end
		c.Name = "Canopy"
		c.Size = Vector3.new(R * 2, RISE, R * 2)
		c.CFrame = CFrame.new(0, RIM_Y + RISE / 2, 0)
		c.Color = color
		c.Material = Enum.Material.Fabric
		c.Transparency = 0
		c.Reflectance = 0
		c.Anchored = false
		c.CanCollide = false
		c.CanQuery = false
		c.CanTouch = false
		c.CastShadow = false
		c.Massless = true
		pcall(function()
			(c :: any).DoubleSided = true -- (seen from underneath the cloth is still there)
		end)
		c.Parent = m
		weld(c)
	else
		-- (no dome mesh to hand: a stack of thin discs makes the same round shape)
		for i = 0, 5 do
			local f = 1 - i / 6
			weld(rod(m, "Canopy", 0.1, R * 2 * math.sqrt(1 - (1 - f) ^ 2 * 0.9), CFrame.new(0, RIM_Y + RISE * (i / 6), 0), color, Enum.Material.Fabric))
		end
	end
	-- the trim round the rim and the ribs under the cloth
	local trim = color:Lerp(Color3.new(1, 1, 1), 0.55)
	for k = 0, 7 do
		local a = k * math.pi / 4
		local dirX, dirZ = math.cos(a), math.sin(a)
		-- (a short piece of trim on the rim, along the circle)
		local mid = Vector3.new(dirX * (R - 0.04), RIM_Y + 0.03, dirZ * (R - 0.04))
		weld(part(m, "Trim", Vector3.new(2 * R * math.tan(math.pi / 8), 0.07, 0.07), CFrame.lookAt(mid, mid + Vector3.new(-dirZ, 0, dirX)), trim, Enum.Material.Fabric))
		-- (a rib from just under the finial down and out to the rim)
		local from = Vector3.new(0, top - 0.25, 0)
		local to = Vector3.new(dirX * (R - 0.1), RIM_Y + 0.02, dirZ * (R - 0.1))
		local len = (to - from).Magnitude
		weld(part(m, "Rib", Vector3.new(0.035, 0.035, len), CFrame.lookAt((from + to) / 2, to), chrome, Enum.Material.Metal))
	end
	weld(part(m, "Finial", Vector3.new(0.16, 0.16, 0.16), CFrame.new(0, top + 0.02, 0), chrome, Enum.Material.Metal, Enum.PartType.Ball))
	-- where the hand takes hold
	local grip = Instance.new("Attachment")
	grip.Name = "GripPoint"
	grip.Parent = root
	m:SetAttribute("Height", top + 0.1)
	m:SetAttribute("Radius", R)
	return m
end

-- Puts an umbrella in the person's right hand: it rises beside the head (the canopy over the head and
-- the shoulders) and the arm reaches up to the handle (an IKControl: the hand goes where the handle
-- is, whatever the walking or standing animation does). `person` is a standard R15 rig; returns the
-- model, or nil when the rig has no head.
function Umbrella.carry(person: Model, color: Color3): Model?
	local head = person:FindFirstChild("Head") :: BasePart?
	if not head then
		return nil
	end
	-- (the umbrella is drawn in the size of an average avatar; a bigger or smaller person scales it)
	local s = head.Size.Y / 1.2
	local m = Umbrella.build(color)
	if math.abs(s - 1) > 0.02 then
		pcall(function()
			m:ScaleTo(s)
		end)
	end
	-- beside the head, leaning a little in over it
	local at = head.CFrame * CFrame.new(0.95 * s, -0.2 * s, 0.1 * s) * CFrame.Angles(0, 0, math.rad(8))
	m:PivotTo(at)
	m.Parent = person
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d.Name ~= "Grip" then
			d.Massless = true
		end
	end
	local root = m.PrimaryPart :: BasePart
	-- the whole umbrella rides on the head
	local w = Instance.new("WeldConstraint")
	w.Part0 = head
	w.Part1 = root
	w.Parent = root
	-- the arm: from the torso out to the hand, to the handle
	pcall(function()
		local hum = person:FindFirstChildOfClass("Humanoid")
		local hand = person:FindFirstChild("RightHand")
		local chainRoot = person:FindFirstChild("UpperTorso")
		local grip = root:FindFirstChild("GripPoint")
		if hum and hand and chainRoot and grip then
			local ik = Instance.new("IKControl")
			ik.Name = "UmbrellaArm"
			ik.Type = Enum.IKControlType.Position
			ik.ChainRoot = chainRoot
			ik.EndEffector = hand
			ik.Target = grip
			ik.Weight = 1
			ik.SmoothTime = 0.1
			ik.Parent = hum
			m:SetAttribute("HeldBy", "IKControl")
		end
	end)
	return m
end

-- Takes the IK (parented to the humanoid, not to the umbrella) off again.
function Umbrella.drop(person: Model, umbrella: Model?)
	local hum = person:FindFirstChildOfClass("Humanoid")
	local ik = hum and hum:FindFirstChild("UmbrellaArm")
	if ik then
		ik:Destroy()
	end
	if umbrella then
		umbrella:Destroy()
	end
end

return Umbrella
