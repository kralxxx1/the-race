-- Builder: small helpers for creating parts, models, signs and lights from code.
-- Every world object, shop, device and vehicle in the game is assembled with these.
-- Parts are anchored, smooth-surfaced and parented last (cheaper replication).

local Builder = {}

local DEFAULT_MATERIAL = Enum.Material.SmoothPlastic
local SMOOTH = Enum.SurfaceType.Smooth

Builder.Fonts = {
	Regular = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Regular),
	Medium = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Medium),
	Bold = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Bold),
	Heavy = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.ExtraBold),
	Mono = Font.new("rbxasset://fonts/families/RobotoMono.json", Enum.FontWeight.Medium),
	Display = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Heavy),
	Serif = Font.new("rbxasset://fonts/families/Merriweather.json", Enum.FontWeight.Bold),
	Hand = Font.new("rbxasset://fonts/families/PatrickHand.json", Enum.FontWeight.Regular),
}

-- Accepts Color3, BrickColor name, "#rrggbb" or {r, g, b} (0-255).
function Builder.color(c: any): Color3
	local t = typeof(c)
	if t == "Color3" then
		return c
	elseif t == "BrickColor" then
		return c.Color
	elseif t == "string" then
		if string.sub(c, 1, 1) == "#" then
			return Color3.fromHex(c)
		end
		return BrickColor.new(c).Color
	elseif t == "table" then
		return Color3.fromRGB(c[1], c[2], c[3])
	end
	return Color3.new(0.6, 0.6, 0.6)
end

local function applyProps(inst: Instance, props: { [string]: any }?)
	if props then
		for k, v in props do
			(inst :: any)[k] = v
		end
	end
end

local function basePart(className: string, parent: Instance?, cf: CFrame, size: Vector3, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	local p = Instance.new(className) :: BasePart
	p.Anchored = true
	p.TopSurface = SMOOTH
	p.BottomSurface = SMOOTH
	p.Size = size
	p.CFrame = cf
	p.Color = Builder.color(color)
	p.Material = material or DEFAULT_MATERIAL
	applyProps(p, props)
	if parent then
		p.Parent = parent
	end
	return p
end

-- Box part centred at cf.
function Builder.box(parent: Instance?, cf: CFrame, size: Vector3, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	return basePart("Part", parent, cf, size, color, material, props)
end

-- Cylinder whose axis is the local X axis of cf (Roblox convention).
function Builder.cyl(parent: Instance?, cf: CFrame, length: number, diameter: number, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	local p = basePart("Part", nil, cf, Vector3.new(length, diameter, diameter), color, material, props) :: Part
	p.Shape = Enum.PartType.Cylinder
	if parent then
		p.Parent = parent
	end
	return p
end

-- Upright cylinder (axis = world/local Y) centred at cf.
local UPRIGHT = CFrame.Angles(0, 0, math.pi / 2)
function Builder.cylY(parent: Instance?, cf: CFrame, height: number, diameter: number, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	return Builder.cyl(parent, cf * UPRIGHT, height, diameter, color, material, props)
end

-- Cylinder along local Z.
local ALONG_Z = CFrame.Angles(0, math.pi / 2, 0)
function Builder.cylZ(parent: Instance?, cf: CFrame, length: number, diameter: number, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	return Builder.cyl(parent, cf * ALONG_Z, length, diameter, color, material, props)
end

function Builder.ball(parent: Instance?, cf: CFrame, diameter: number, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	local p = basePart("Part", nil, cf, Vector3.new(diameter, diameter, diameter), color, material, props) :: Part
	p.Shape = Enum.PartType.Ball
	if parent then
		p.Parent = parent
	end
	return p
end

-- Ellipsoid: a box-collided part rendered as a scaled sphere mesh (foliage, hair, clouds).
function Builder.ellipsoid(parent: Instance?, cf: CFrame, size: Vector3, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	local p = basePart("Part", nil, cf, size, color, material, props)
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	if parent then
		p.Parent = parent
	end
	return p
end

-- Wedge: tall at the back (+Z), slope facing the front (-Z).
function Builder.wedge(parent: Instance?, cf: CFrame, size: Vector3, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	return basePart("WedgePart", parent, cf, size, color, material, props)
end

-- Four wedges arranged as a cross-gabled spire: reads as a cone from the side (pine tiers, spires, roof caps).
function Builder.spire(parent: Instance?, cf: CFrame, base: number, height: number, color: any, material: Enum.Material?, props: { [string]: any }?): { BasePart }
	local parts = {}
	local half = base / 2
	for i = 0, 3 do
		local rot = CFrame.Angles(0, i * math.pi / 2, 0)
		-- slope faces outward (-Z of each wedge), tall edge at the centre
		local w = Builder.wedge(parent, cf * rot * CFrame.new(0, 0, -half / 2), Vector3.new(base, height, half), color, material, props)
		table.insert(parts, w)
	end
	return parts
end

function Builder.model(name: string, parent: Instance?): Model
	local m = Instance.new("Model")
	m.Name = name
	if parent then
		m.Parent = parent
	end
	return m
end

function Builder.folder(name: string, parent: Instance?): Folder
	local f = Instance.new("Folder")
	f.Name = name
	if parent then
		f.Parent = parent
	end
	return f
end

function Builder.weld(a: BasePart, b: BasePart): WeldConstraint
	local w = Instance.new("WeldConstraint")
	w.Part0 = a
	w.Part1 = b
	w.Parent = a
	return w
end

-- Welds every BasePart under `root` (except `primary`) to `primary`.
function Builder.weldAll(root: Instance, primary: BasePart)
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") and d ~= primary then
			Builder.weld(primary, d)
		end
	end
end

-- Surface sign: a SurfaceGui with a single TextLabel on `face` of `part`.
function Builder.sign(part: BasePart, face: Enum.NormalId, text: string, opts: { [string]: any }?): TextLabel
	local o = opts or {}
	local gui = Instance.new("SurfaceGui")
	gui.Name = o.name or "Sign"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = o.pixelsPerStud or 40
	gui.LightInfluence = if o.glow then 0 else 1
	if o.glow then
		gui.Brightness = o.brightness or 2
	end
	gui.ClipsDescendants = true
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = if o.background then 0 else 1
	if o.background then
		label.BackgroundColor3 = Builder.color(o.background)
	end
	label.Text = text
	label.TextColor3 = Builder.color(o.color or Color3.new(1, 1, 1))
	label.TextScaled = true
	label.FontFace = o.font or Builder.Fonts.Heavy
	label.RichText = o.rich == true
	if o.stroke then
		label.TextStrokeTransparency = 0.4
		label.TextStrokeColor3 = Builder.color(o.stroke)
	end
	if o.xAlign then
		label.TextXAlignment = o.xAlign
	end
	local pad = Instance.new("UIPadding")
	local p = o.padding or 0.08
	pad.PaddingLeft = UDim.new(p, 0)
	pad.PaddingRight = UDim.new(p, 0)
	pad.PaddingTop = UDim.new(p, 0)
	pad.PaddingBottom = UDim.new(p, 0)
	pad.Parent = label
	label.Parent = gui
	gui.Parent = part
	return label
end

function Builder.pointLight(parent: Instance, range: number, brightness: number, color: any, shadows: boolean?): PointLight
	local l = Instance.new("PointLight")
	l.Range = range
	l.Brightness = brightness
	l.Color = Builder.color(color)
	l.Shadows = shadows == true
	l.Parent = parent
	return l
end

function Builder.spotLight(parent: Instance, face: Enum.NormalId, range: number, angle: number, brightness: number, color: any, shadows: boolean?): SpotLight
	local l = Instance.new("SpotLight")
	l.Face = face
	l.Range = range
	l.Angle = angle
	l.Brightness = brightness
	l.Color = Builder.color(color)
	l.Shadows = shadows == true
	l.Parent = parent
	return l
end

function Builder.surfaceLight(parent: Instance, face: Enum.NormalId, range: number, angle: number, brightness: number, color: any): SurfaceLight
	local l = Instance.new("SurfaceLight")
	l.Face = face
	l.Range = range
	l.Angle = angle
	l.Brightness = brightness
	l.Color = Builder.color(color)
	l.Parent = parent
	return l
end

function Builder.prompt(parent: Instance, actionText: string, objectText: string?, opts: { [string]: any }?): ProximityPrompt
	local o = opts or {}
	local pp = Instance.new("ProximityPrompt")
	pp.Name = o.name or "Prompt"
	pp.ActionText = actionText
	pp.ObjectText = objectText or ""
	pp.HoldDuration = o.hold or 0
	pp.MaxActivationDistance = o.distance or 10
	pp.RequiresLineOfSight = o.lineOfSight == true
	pp.KeyboardKeyCode = o.key or Enum.KeyCode.E
	if o.uiOffset then
		pp.UIOffset = o.uiOffset
	end
	pp.Parent = parent
	return pp
end

-- Invisible, non-colliding anchor used as a waypoint or attachment holder.
function Builder.marker(parent: Instance?, name: string, cf: CFrame, size: Vector3?): BasePart
	return Builder.box(parent, cf, size or Vector3.new(1, 1, 1), Color3.new(1, 0, 1), Enum.Material.SmoothPlastic, {
		Name = name,
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		CastShadow = false,
	})
end

-- Tags an instance (CollectionService works on the client for streamed instances too).
function Builder.tag(inst: Instance, tagName: string)
	inst:AddTag(tagName)
end

-- Turns a list of colours into one picked by index (wraps).
function Builder.cycle(list: { any }, i: number): any
	return list[((i - 1) % #list) + 1]
end

-- Common palette shared by the world and shops.
Builder.Palette = {
	asphalt = Color3.fromRGB(46, 48, 52),
	asphaltLight = Color3.fromRGB(62, 64, 68),
	curb = Color3.fromRGB(176, 172, 164),
	sidewalk = Color3.fromRGB(196, 190, 180),
	paving = Color3.fromRGB(184, 170, 150),
	lineWhite = Color3.fromRGB(235, 235, 228),
	lineYellow = Color3.fromRGB(240, 196, 60),
	grass = Color3.fromRGB(96, 142, 72),
	grassDark = Color3.fromRGB(70, 116, 58),
	soil = Color3.fromRGB(110, 86, 62),
	trunk = Color3.fromRGB(96, 70, 50),
	metal = Color3.fromRGB(120, 124, 130),
	darkMetal = Color3.fromRGB(52, 54, 58),
	black = Color3.fromRGB(22, 22, 24),
	white = Color3.fromRGB(242, 242, 238),
	glass = Color3.fromRGB(150, 190, 210),
	glassDark = Color3.fromRGB(60, 84, 100),
	warmLight = Color3.fromRGB(255, 214, 160),
	coolLight = Color3.fromRGB(220, 236, 255),
	water = Color3.fromRGB(40, 110, 140),
	sand = Color3.fromRGB(226, 206, 160),
	wood = Color3.fromRGB(142, 104, 70),
	woodLight = Color3.fromRGB(190, 150, 104),
	brick = Color3.fromRGB(150, 76, 58),
	plaster = Color3.fromRGB(232, 222, 204),
	accent = Color3.fromRGB(0, 170, 220),
}

return Builder
