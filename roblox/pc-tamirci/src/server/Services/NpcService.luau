-- NpcService: people in the city — customers, staff, thieves.
-- Everybody is a standard R15 rig dressed from our own parts (PersonStyle rolls the skin, hair, top,
-- bottom, shoes and accessories from the person's look, so thousands of different people come out
-- of a few dozen roles). The catalog's realistic bodies (Avatars) are still here for anybody who
-- turns Config.RealisticNpcs on, but their pale, staring faces were a problem in the game.
-- A pool of street people goes to ReplicatedStorage.Avatars for the clients' pedestrians.

local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")
local Workspace = game:GetService("Workspace")
local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Avatars = require(Shared.Data.Avatars)
local PersonStyle = require(Shared.Data.PersonStyle)
local ToolModels = require(Shared.Models.ToolModels)

local NpcService = {}

local ANIMS = {
	idle = Avatars.ANIMS.idle,
	walk = Avatars.ANIMS.walk,
	run = Avatars.ANIMS.run,
	sit = "rbxassetid://2506281703",
	wave = "rbxassetid://507770239",
	point = "rbxassetid://507770453",
	cheer = "rbxassetid://507770677",
	laugh = "rbxassetid://507770818",
}
NpcService.Anims = ANIMS

-- One-shot gestures (Roblox's own emote animations). A name with several ids picks one at random:
-- three dance families of three takes each.
local EMOTES = {
	wave = { "rbxassetid://507770239" },
	point = { "rbxassetid://507770453" },
	cheer = { "rbxassetid://507770677" },
	laugh = { "rbxassetid://507770818" },
	-- the chat emotes: a shrug (puzzled, disappointed), a tilt of the head, a salute, a hello
	shrug = { "rbxassetid://3576968026" },
	tilt = { "rbxassetid://3360692915" },
	salute = { "rbxassetid://3360689775" },
	hello = { "rbxassetid://3576686446" },
	dance = {
		"rbxassetid://507771019", "rbxassetid://507771955", "rbxassetid://507772104",
		"rbxassetid://507776043", "rbxassetid://507776720", "rbxassetid://507776879",
		"rbxassetid://507777268", "rbxassetid://507777451", "rbxassetid://507777623",
	},
}
NpcService.Emotes = EMOTES

-- Clothes palette per look: shirt, pants, extras
local LOOKS = {
	student = { shirt = { { 70, 110, 180 }, { 200, 80, 60 }, { 90, 150, 90 }, { 240, 240, 240 } }, pants = { { 40, 60, 110 }, { 30, 30, 36 } }, extras = { "backpack", "cap_back" } },
	gamer = { shirt = { { 30, 30, 34 }, { 120, 40, 200 }, { 20, 160, 120 } }, pants = { { 30, 30, 34 }, { 60, 60, 70 } }, extras = { "headset" } },
	streamer = { shirt = { { 240, 80, 160 }, { 40, 200, 230 }, { 30, 30, 34 } }, pants = { { 30, 30, 34 } }, extras = { "headset", "dyed" } },
	aunt = { shirt = { { 150, 60, 80 }, { 90, 110, 70 }, { 170, 140, 110 } }, pants = { { 70, 50, 60 }, { 60, 60, 70 } }, extras = { "scarf", "handbag" } },
	uncle = { shirt = { { 120, 110, 100 }, { 90, 90, 96 }, { 150, 130, 100 } }, pants = { { 60, 56, 50 }, { 40, 40, 44 } }, extras = { "flatcap", "mustache" } },
	grandpa = { shirt = { { 150, 140, 120 }, { 110, 90, 70 } }, pants = { { 70, 64, 56 } }, extras = { "glasses", "white_hair", "mustache" } },
	business = { shirt = { { 34, 36, 44 }, { 50, 50, 56 } }, pants = { { 30, 32, 40 } }, extras = { "tie", "briefcase" } },
	casual = { shirt = { { 90, 130, 170 }, { 200, 200, 200 }, { 170, 90, 70 }, { 100, 140, 90 } }, pants = { { 50, 70, 120 }, { 40, 40, 44 }, { 110, 100, 80 } }, extras = {} },
	cheap = { shirt = { { 120, 120, 110 }, { 100, 90, 80 } }, pants = { { 70, 70, 66 } }, extras = { "cap" } },
	designer = { shirt = { { 20, 20, 22 } }, pants = { { 26, 26, 30 } }, extras = { "beret", "glasses" } },
	developer = { shirt = { { 80, 84, 92 }, { 40, 70, 60 } }, pants = { { 40, 50, 80 } }, extras = { "glasses", "backpack" } },
	doctor = { shirt = { { 244, 244, 246 } }, pants = { { 70, 110, 140 } }, extras = { "stethoscope" } },
	hurry = { shirt = { { 240, 120, 40 }, { 40, 120, 220 } }, pants = { { 30, 30, 34 } }, extras = { "headband" } },
	influencer = { shirt = { { 250, 170, 200 }, { 250, 250, 250 } }, pants = { { 240, 220, 230 } }, extras = { "sunglasses", "dyed" } },
	kid = { shirt = { { 250, 200, 40 }, { 60, 180, 240 }, { 240, 90, 90 } }, pants = { { 40, 80, 160 } }, extras = { "cap" }, kid = true },
	knowitall = { shirt = { { 160, 140, 90 }, { 90, 110, 130 } }, pants = { { 80, 70, 60 } }, extras = { "glasses" } },
	miner = { shirt = { { 240, 140, 30 } }, pants = { { 50, 50, 56 } }, extras = { "hardhat" } },
	musician = { shirt = { { 30, 30, 32 }, { 110, 30, 30 } }, pants = { { 30, 30, 34 } }, extras = { "guitar", "long_hair" } },
	rich = { shirt = { { 240, 236, 226 }, { 30, 30, 34 } }, pants = { { 240, 236, 226 }, { 30, 30, 34 } }, extras = { "sunglasses", "chain" } },
	shady = { shirt = { { 26, 26, 28 }, { 44, 44, 52 } }, pants = { { 30, 30, 34 } }, extras = { "balaclava", "gloves" } },
	teacher = { shirt = { { 120, 90, 120 }, { 90, 120, 100 } }, pants = { { 60, 60, 70 } }, extras = { "glasses", "book" } },
	tourist = { shirt = { { 250, 150, 60 }, { 60, 200, 200 } }, pants = { { 200, 190, 160 } }, extras = { "sunhat", "camera" } },
	annoying = { shirt = { { 250, 60, 160 }, { 250, 230, 40 } }, pants = { { 120, 40, 200 } }, extras = { "sunglasses_up" } },
	shopkeeper = { shirt = { { 240, 240, 240 } }, pants = { { 40, 40, 44 } }, extras = { "apron" } },
	technician = { shirt = { { 40, 110, 200 } }, pants = { { 36, 40, 50 } }, extras = { "lanyard" } },
	thief = { shirt = { { 30, 30, 34 }, { 60, 34, 34 } }, pants = { { 30, 30, 34 } }, extras = { "balaclava", "gloves" } },
	guard = { shirt = { { 30, 40, 70 } }, pants = { { 26, 28, 40 } }, extras = { "guardcap" } },
	traffic_cop = { shirt = { { 236, 238, 242 } }, pants = { { 24, 32, 58 } }, extras = { "guardcap", "vest" } },
	manager = { shirt = { { 34, 36, 44 } }, pants = { { 30, 32, 40 } }, extras = { "tie" } },
	cleaner = { shirt = { { 90, 160, 120 } }, pants = { { 40, 60, 60 } }, extras = { "apron" } },
	receptionist = { shirt = { { 200, 60, 70 }, { 240, 240, 240 } }, pants = { { 30, 30, 34 } }, extras = { "lanyard" } },
}
NpcService.Looks = LOOKS

local folder: Folder
local baseRigs: { [string]: Model } = {}

local function c3(t): Color3
	return Color3.fromRGB(t[1], t[2], t[3])
end

local function makeBase(kind: string): Model
	local desc = Instance.new("HumanoidDescription")
	if kind == "kid" then
		desc.HeightScale = 0.78
		desc.WidthScale = 0.85
		desc.HeadScale = 1.08
	elseif kind == "s" then
		desc.HeightScale = 0.93
		desc.WidthScale = 0.92
	elseif kind == "l" then
		desc.HeightScale = 1.07
		desc.WidthScale = 1.06
	end
	local ok, rig = pcall(function()
		return Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	end)
	if not ok or not rig then
		error("could not create NPC rig: " .. tostring(rig))
	end
	rig.Name = "BaseRig_" .. kind
	local animate = rig:FindFirstChild("Animate")
	if animate then
		animate:Destroy()
	end
	rig.Parent = ServerStorage
	return rig
end

----------------------------------------------------------------------------------------------------
-- Realistic avatars: templates built from Avatars outfits
----------------------------------------------------------------------------------------------------
local templateFolder: Folder
local streetFolder: Folder
local templates: { [string]: { Model } } = {} -- "look:gender" -> avatars
local STREET_COUNT = 48

local function describe(o: Avatars.Outfit): HumanoidDescription
	local d = Instance.new("HumanoidDescription")
	d.Torso = o.body.torso
	d.LeftArm = o.body.la
	d.RightArm = o.body.ra
	d.LeftLeg = o.body.ll
	d.RightLeg = o.body.rl
	d.Head = o.head
	d.MoodAnimation = Avatars.MOOD
	d.Pants = o.pants or 0
	local skin = c3(o.skin)
	d.HeadColor = skin
	d.TorsoColor = skin
	d.LeftArmColor = skin
	d.RightArmColor = skin
	d.LeftLegColor = skin
	d.RightLegColor = skin
	d.HeightScale = o.scale.height
	d.WidthScale = o.scale.width
	d.DepthScale = o.scale.depth
	d.HeadScale = o.scale.head
	d.BodyTypeScale = 0
	d.ProportionScale = 0
	local list = {}
	if o.hair then
		table.insert(list, { AssetId = o.hair, AccessoryType = Enum.AccessoryType.Hair })
	end
	for _, it in o.items do
		local entry: { [string]: any } = { AssetId = it.id, AccessoryType = (Enum.AccessoryType :: any)[it.type] }
		if it.order then
			entry.IsLayered = true
			entry.Order = it.order
		end
		table.insert(list, entry)
	end
	d:SetAccessories(list, true)
	return d
end
NpcService.describe = describe

-- Turns a freshly built avatar into a template: no Animate script, nothing collides but the root,
-- only the root answers raycasts.
local function prepareTemplate(model: Model, o: Avatars.Outfit)
	local animate = model:FindFirstChild("Animate")
	if animate then
		animate:Destroy()
	end
	local hum = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	model.PrimaryPart = root
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.BreakJointsOnDeath = false
	if not hum:FindFirstChildOfClass("Animator") then
		Instance.new("Animator").Parent = hum
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanQuery = d == root
			d.CanTouch = false
			if d ~= root then
				d.CanCollide = false
				d.Massless = true
			end
		end
	end
	model:SetAttribute("Look", o.look)
	model:SetAttribute("Gender", o.gender)
	model:SetAttribute("Avatar", true)
	-- how high the root sits above the feet, for clients posing copies without physics
	model:SetAttribute("Hip", hum.HipHeight + root.Size.Y / 2)
end

local function createAvatar(o: Avatars.Outfit): Model?
	local ok, model = pcall(function()
		return Players:CreateHumanoidModelFromDescription(describe(o), Enum.HumanoidRigType.R15)
	end)
	if not ok or not model then
		warn("[NpcService] avatar for " .. o.look .. " failed: " .. tostring(model))
		return nil
	end
	if not model:FindFirstChildOfClass("Humanoid") or not model:FindFirstChild("HumanoidRootPart") then
		model:Destroy()
		return nil
	end
	prepareTemplate(model, o)
	return model
end

local function addTemplate(look: string, gender: string, rng: Random): Model?
	local o = Avatars.outfit(look, rng, gender)
	local model = createAvatar(o)
	if model then
		model.Name = look .. "_" .. gender
		model.Parent = templateFolder
		local key = look .. ":" .. gender
		templates[key] = templates[key] or {}
		table.insert(templates[key], model)
	end
	return model
end

-- Builds the avatars one after another so the server never stalls: one of every look first
-- (customers soon look real), then the street crowd for the clients, then more variety.
local function buildTemplates()
	local rng = Random.new(20261029)
	local jobs = {}
	for look, def in Avatars.OUTFITS do
		if def.female < 1 then
			table.insert(jobs, { look, "m", 1 - def.female })
		end
		if def.female > 0 then
			table.insert(jobs, { look, "f", def.female })
		end
	end
	table.sort(jobs, function(a, b)
		return a[1] .. a[2] < b[1] .. b[2]
	end)
	for _, j in jobs do
		addTemplate(j[1], j[2], rng)
		task.wait()
	end
	for i = 1, STREET_COUNT do
		local look = Avatars.STREET[(i - 1) % #Avatars.STREET + 1]
		local o = Avatars.outfit(look, rng)
		local model = createAvatar(o)
		if model then
			model.Name = "Street" .. i
			model.Parent = streetFolder
		end
		task.wait()
	end
	-- two more rounds of the looks a shop sees most (every customer picks one of the copies)
	for _ = 1, 2 do
		for _, j in jobs do
			if j[3] >= 0.3 then
				addTemplate(j[1], j[2], rng)
				task.wait()
			end
		end
	end
	templateFolder:SetAttribute("Ready", true)
end

function NpcService.templateCount(): number
	local n = 0
	for _, list in templates do
		n += #list
	end
	return n
end

local function pickGender(lookName: string, rng: Random): string
	local def = Avatars.OUTFITS[lookName] or Avatars.OUTFITS.casual
	return if rng:NextNumber() < def.female then "f" else "m"
end
NpcService.pickGender = pickGender

-- Gives a copy of a template its own skin tone (the clothes stay the template's).
local function reskin(model: Model, rng: Random)
	local bc = model:FindFirstChildOfClass("BodyColors")
	if bc then
		local skin = c3(Rand.pick(rng, Avatars.SKIN))
		bc.HeadColor3 = skin
		bc.TorsoColor3 = skin
		bc.LeftArmColor3 = skin
		bc.RightArmColor3 = skin
		bc.LeftLegColor3 = skin
		bc.RightLegColor3 = skin
	end
end

local function part(body: BasePart, offset: CFrame, size: Vector3, color: Color3, mat: Enum.Material?, shape: string?): BasePart
	local p
	if shape == "ball" then
		p = B.ball(nil, body.CFrame * offset, size.X, color, mat or Enum.Material.SmoothPlastic)
	elseif shape == "cyl" then
		p = B.cyl(nil, body.CFrame * offset, size.X, size.Y, color, mat or Enum.Material.SmoothPlastic)
	else
		p = B.box(nil, body.CFrame * offset, size, color, mat or Enum.Material.SmoothPlastic)
	end
	p.Anchored = false
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = size.Magnitude > 0.6
	local w = Instance.new("WeldConstraint")
	w.Part0 = body
	w.Part1 = p
	w.Parent = p
	p.Parent = body.Parent
	return p
end

-- Hair and accessories from part shapes, attached to the body.
local function dress(model: Model, extras: { string }, hair: Color3, gender: string, rng: Random, ownHair: boolean?)
	local head = model:FindFirstChild("Head") :: BasePart
	local torso = model:FindFirstChild("UpperTorso") :: BasePart
	local rightHand = model:FindFirstChild("RightHand") :: BasePart
	if not head or not torso then
		return
	end
	local hs = head.Size
	local has = {}
	for _, e in extras do
		has[e] = true
	end
	-- hair
	local hood = has.hood or has.scarf
	if not ownHair and not hood and not has.hardhat then
		local hairCol = if has.white_hair then Color3.fromRGB(220, 220, 220) else hair
		if has.dyed then
			hairCol = Rand.pick(rng, { Color3.fromRGB(240, 90, 160), Color3.fromRGB(80, 200, 240), Color3.fromRGB(160, 90, 240) })
		end
		part(head, CFrame.new(0, hs.Y * 0.42, 0.02), Vector3.new(hs.X * 1.06, hs.Y * 0.32, hs.Z * 1.06), hairCol, Enum.Material.SmoothPlastic)
		part(head, CFrame.new(0, hs.Y * 0.1, hs.Z * 0.42), Vector3.new(hs.X * 1.04, hs.Y * 0.6, hs.Z * 0.24), hairCol, Enum.Material.SmoothPlastic)
		if gender == "f" or has.long_hair then
			part(head, CFrame.new(0, -hs.Y * 0.25, hs.Z * 0.48), Vector3.new(hs.X * 1.02, hs.Y * 0.9, hs.Z * 0.2), hairCol, Enum.Material.SmoothPlastic)
			if rng:NextNumber() < 0.35 then
				part(head, CFrame.new(0, hs.Y * 0.45, hs.Z * 0.55), Vector3.new(hs.X * 0.4, hs.Y * 0.4, hs.X * 0.4), hairCol, Enum.Material.SmoothPlastic, "ball")
			end
		end
	end
	local function hat(color: Color3, h: number, brim: boolean, mat: Enum.Material?)
		part(head, CFrame.new(0, hs.Y * 0.5 + h / 2, 0), Vector3.new(hs.X * 1.1, h, hs.Z * 1.1), color, mat)
		if brim then
			part(head, CFrame.new(0, hs.Y * 0.5, -hs.Z * 0.55), Vector3.new(hs.X * 1.05, 0.06, hs.Z * 0.6), color, mat)
		end
	end
	if has.cap or has.cap_back then
		local col = Rand.pick(rng, { Color3.fromRGB(200, 40, 40), Color3.fromRGB(30, 30, 34), Color3.fromRGB(40, 90, 200), Color3.fromRGB(240, 240, 240) })
		part(head, CFrame.new(0, hs.Y * 0.52, 0), Vector3.new(hs.X * 1.08, hs.Y * 0.28, hs.Z * 1.08), col)
		part(head, CFrame.new(0, hs.Y * 0.42, if has.cap_back then hs.Z * 0.75 else -hs.Z * 0.75), Vector3.new(hs.X * 0.9, 0.06, hs.Z * 0.55), col)
	end
	if has.flatcap then
		part(head, CFrame.new(0, hs.Y * 0.5, -hs.Z * 0.1), Vector3.new(hs.X * 1.12, hs.Y * 0.2, hs.Z * 1.3), Color3.fromRGB(80, 70, 60), Enum.Material.Fabric)
	end
	if has.beret then
		part(head, CFrame.new(hs.X * 0.1, hs.Y * 0.55, 0), Vector3.new(hs.X * 1.1, hs.Y * 0.18, hs.Z * 1.1), Color3.fromRGB(20, 20, 22), Enum.Material.Fabric, "cyl")
	end
	if has.hardhat then
		hat(Color3.fromRGB(250, 200, 30), hs.Y * 0.35, true)
	end
	if has.sunhat then
		part(head, CFrame.new(0, hs.Y * 0.52, 0) * CFrame.Angles(0, 0, math.pi / 2), Vector3.new(0.08, hs.X * 2, hs.X * 2), Color3.fromRGB(230, 210, 160), Enum.Material.Fabric, "cyl")
		part(head, CFrame.new(0, hs.Y * 0.68, 0), Vector3.new(hs.X * 1.05, hs.Y * 0.3, hs.Z * 1.05), Color3.fromRGB(230, 210, 160), Enum.Material.Fabric)
	end
	if has.guardcap then
		hat(Color3.fromRGB(20, 26, 50), hs.Y * 0.22, true)
	end
	if has.beanie then
		part(head, CFrame.new(0, hs.Y * 0.45, 0), Vector3.new(hs.X * 1.1, hs.Y * 0.45, hs.Z * 1.1), Color3.fromRGB(30, 30, 34), Enum.Material.Fabric)
	end
	if has.headband then
		part(head, CFrame.new(0, hs.Y * 0.3, 0), Vector3.new(hs.X * 1.08, 0.12, hs.Z * 1.08), Color3.fromRGB(240, 240, 240), Enum.Material.Fabric)
	end
	if has.scarf then
		part(head, CFrame.new(0, hs.Y * 0.12, hs.Z * 0.08), Vector3.new(hs.X * 1.18, hs.Y * 1.1, hs.Z * 1.12), Rand.pick(rng, { Color3.fromRGB(140, 40, 60), Color3.fromRGB(60, 90, 140), Color3.fromRGB(200, 170, 120) }), Enum.Material.Fabric)
	end
	if has.hood then
		part(head, CFrame.new(0, hs.Y * 0.15, hs.Z * 0.12), Vector3.new(hs.X * 1.2, hs.Y * 1.15, hs.Z * 1.15), Color3.fromRGB(26, 26, 28), Enum.Material.Fabric)
	end
	-- face items (the face looks along -Z)
	if has.glasses then
		part(head, CFrame.new(0, hs.Y * 0.08, -hs.Z * 0.52), Vector3.new(hs.X * 0.9, hs.Y * 0.2, 0.04), Color3.fromRGB(30, 30, 34), Enum.Material.Glass).Transparency = 0.35
	end
	if has.sunglasses then
		part(head, CFrame.new(0, hs.Y * 0.08, -hs.Z * 0.52), Vector3.new(hs.X * 0.92, hs.Y * 0.22, 0.04), Color3.fromRGB(10, 10, 12), Enum.Material.Glass)
	end
	if has.sunglasses_up then
		part(head, CFrame.new(0, hs.Y * 0.45, -hs.Z * 0.3), Vector3.new(hs.X * 0.92, hs.Y * 0.2, 0.05), Color3.fromRGB(240, 60, 160), Enum.Material.Glass)
	end
	if has.mustache then
		part(head, CFrame.new(0, -hs.Y * 0.18, -hs.Z * 0.51), Vector3.new(hs.X * 0.45, hs.Y * 0.09, 0.05), if has.white_hair then Color3.fromRGB(210, 210, 210) else hair)
	end
	if has.mask then
		part(head, CFrame.new(0, -hs.Y * 0.12, -hs.Z * 0.5), Vector3.new(hs.X * 0.95, hs.Y * 0.45, 0.06), Color3.fromRGB(20, 20, 22), Enum.Material.Fabric)
	end
	if has.balaclava then
		-- a knitted ski mask over the whole head: the knit above the brows and below the eyes, and a
		-- slit for the eyes open at the front only
		local knit = Color3.fromRGB(22, 22, 25)
		local function named(p: BasePart): BasePart
			p.Name = "Balaclava"
			return p
		end
		named(part(head, CFrame.new(0, hs.Y * 0.39, 0), Vector3.new(hs.X * 1.09, hs.Y * 0.27, hs.Z * 1.09), knit, Enum.Material.Fabric))
		named(part(head, CFrame.new(0, -hs.Y * 0.26, 0), Vector3.new(hs.X * 1.09, hs.Y * 0.54, hs.Z * 1.09), knit, Enum.Material.Fabric))
		named(part(head, CFrame.new(0, hs.Y * 0.13, hs.Z * 0.52), Vector3.new(hs.X * 1.09, hs.Y * 0.27, 0.08), knit, Enum.Material.Fabric))
		for _, sd in { -1, 1 } do
			named(part(head, CFrame.new(sd * hs.X * 0.52, hs.Y * 0.13, 0), Vector3.new(0.08, hs.Y * 0.27, hs.Z * 1.09), knit, Enum.Material.Fabric))
		end
		-- the rolled edge round the eye slit
		named(part(head, CFrame.new(0, hs.Y * 0.27, -hs.Z * 0.545), Vector3.new(hs.X * 1.0, 0.05, 0.05), Color3.fromRGB(40, 40, 46), Enum.Material.Fabric))
		named(part(head, CFrame.new(0, -hs.Y * 0.01, -hs.Z * 0.545), Vector3.new(hs.X * 1.0, 0.05, 0.05), Color3.fromRGB(40, 40, 46), Enum.Material.Fabric))
	end
	if has.gloves then
		for _, name in { "LeftHand", "RightHand" } do
			local hand = model:FindFirstChild(name) :: BasePart?
			if hand then
				part(hand, CFrame.new(), hand.Size * 1.08, Color3.fromRGB(26, 26, 30), Enum.Material.Leather)
			end
		end
	end
	if has.headset then
		for _, s in { -1, 1 } do
			part(head, CFrame.new(s * hs.X * 0.55, hs.Y * 0.05, 0), Vector3.new(0.12, hs.Y * 0.42, hs.Y * 0.42), Color3.fromRGB(26, 26, 30), Enum.Material.SmoothPlastic, "cyl")
		end
		part(head, CFrame.new(0, hs.Y * 0.56, 0), Vector3.new(hs.X * 1.15, 0.1, 0.16), Color3.fromRGB(26, 26, 30))
		local led = part(head, CFrame.new(hs.X * 0.62, hs.Y * 0.05, 0), Vector3.new(0.02, hs.Y * 0.2, hs.Y * 0.2), Color3.fromRGB(120, 60, 255), Enum.Material.Neon)
		led.CastShadow = false
	end
	-- torso items (front is -Z)
	local ts = torso.Size
	if has.tie then
		part(torso, CFrame.new(0, ts.Y * 0.1, -ts.Z * 0.51), Vector3.new(ts.X * 0.12, ts.Y * 0.6, 0.04), Color3.fromRGB(140, 20, 30))
	end
	if has.backpack then
		part(torso, CFrame.new(0, 0, ts.Z * 0.75), Vector3.new(ts.X * 0.8, ts.Y * 0.85, ts.Z * 0.6), Rand.pick(rng, { Color3.fromRGB(40, 60, 120), Color3.fromRGB(30, 30, 34), Color3.fromRGB(180, 50, 50) }), Enum.Material.Fabric)
	end
	if has.guitar then
		part(torso, CFrame.new(0, 0, ts.Z * 0.7) * CFrame.Angles(0, 0, math.rad(30)), Vector3.new(ts.X * 0.7, ts.Y * 1.6, 0.2), Color3.fromRGB(30, 30, 34), Enum.Material.Fabric)
	end
	if has.stethoscope then
		part(torso, CFrame.new(0, ts.Y * 0.2, -ts.Z * 0.5), Vector3.new(ts.X * 0.5, 0.06, 0.06), Color3.fromRGB(30, 30, 34))
	end
	if has.chain then
		part(torso, CFrame.new(0, ts.Y * 0.3, -ts.Z * 0.5), Vector3.new(ts.X * 0.45, 0.06, 0.04), Color3.fromRGB(230, 190, 60), Enum.Material.Metal)
	end
	if has.apron then
		part(torso, CFrame.new(0, -ts.Y * 0.05, -ts.Z * 0.51), Vector3.new(ts.X * 0.85, ts.Y * 0.9, 0.04), Color3.fromRGB(110, 76, 50), Enum.Material.Fabric)
	end
	if has.lanyard then
		local card = part(torso, CFrame.new(0, -ts.Y * 0.1, -ts.Z * 0.52), Vector3.new(0.3, 0.38, 0.03), Color3.fromRGB(240, 240, 240))
		card.CastShadow = false
	end
	if has.camera then
		part(torso, CFrame.new(ts.X * 0.2, -ts.Y * 0.2, -ts.Z * 0.6), Vector3.new(0.4, 0.28, 0.22), Color3.fromRGB(26, 26, 28))
	end
	-- more things people wear (each also rolled by PersonStyle for anybody)
	if has.bucket then
		part(head, CFrame.new(0, hs.Y * 0.5, 0), Vector3.new(hs.X * 1.1, hs.Y * 0.3, hs.Z * 1.1), Rand.pick(rng, { Color3.fromRGB(120, 130, 90), Color3.fromRGB(200, 190, 160), Color3.fromRGB(60, 80, 130) }), Enum.Material.Fabric)
		part(head, CFrame.new(0, hs.Y * 0.4, 0), Vector3.new(hs.X * 1.5, 0.06, hs.Z * 1.5), Color3.fromRGB(110, 110, 100), Enum.Material.Fabric)
	end
	if has.bandana then
		part(head, CFrame.new(0, hs.Y * 0.32, 0), Vector3.new(hs.X * 1.08, hs.Y * 0.26, hs.Z * 1.08), Rand.pick(rng, { Color3.fromRGB(200, 40, 40), Color3.fromRGB(40, 70, 160), Color3.fromRGB(240, 240, 240) }), Enum.Material.Fabric)
	end
	if has.mask_med then
		part(head, CFrame.new(0, -hs.Y * 0.2, -hs.Z * 0.51), Vector3.new(hs.X * 0.85, hs.Y * 0.36, 0.05), Color3.fromRGB(190, 220, 236), Enum.Material.Fabric)
	end
	if has.earrings then
		for _, sd in { -1, 1 } do
			part(head, CFrame.new(sd * hs.X * 0.52, -hs.Y * 0.12, 0), Vector3.new(0.14, 0.14, 0.14), Color3.fromRGB(240, 200, 70), Enum.Material.Metal, "ball")
		end
	end
	if has.headphones then
		for _, sd in { -1, 1 } do
			part(head, CFrame.new(sd * hs.X * 0.56, 0, 0), Vector3.new(0.16, hs.Y * 0.45, hs.Y * 0.45), Color3.fromRGB(40, 40, 46), Enum.Material.SmoothPlastic, "cyl")
		end
		part(head, CFrame.new(0, hs.Y * 0.56, 0), Vector3.new(hs.X * 1.15, 0.09, 0.14), Color3.fromRGB(40, 40, 46))
	end
	if has.beard then
		part(head, CFrame.new(0, -hs.Y * 0.3, -hs.Z * 0.42), Vector3.new(hs.X * 0.98, hs.Y * 0.4, hs.Z * 0.22), hair, Enum.Material.Fabric)
	end
	if has.goatee then
		part(head, CFrame.new(0, -hs.Y * 0.38, -hs.Z * 0.5), Vector3.new(hs.X * 0.32, hs.Y * 0.28, 0.08), hair, Enum.Material.Fabric)
	end
	if has.stubble then
		local st = part(head, CFrame.new(0, -hs.Y * 0.22, -hs.Z * 0.505), Vector3.new(hs.X * 0.96, hs.Y * 0.44, 0.03), hair, Enum.Material.Fabric)
		st.Transparency = 0.72
	end
	if has.scarf_s then
		part(torso, CFrame.new(0, torso.Size.Y * 0.46, 0), Vector3.new(torso.Size.X * 0.7, 0.28, torso.Size.Z * 1.25), Rand.pick(rng, { Color3.fromRGB(200, 60, 60), Color3.fromRGB(60, 90, 160), Color3.fromRGB(230, 200, 80) }), Enum.Material.Fabric)
	end
	if has.necklace then
		part(torso, CFrame.new(0, torso.Size.Y * 0.38, -torso.Size.Z * 0.51), Vector3.new(torso.Size.X * 0.34, 0.05, 0.04), Color3.fromRGB(235, 200, 80), Enum.Material.Metal)
	end
	if has.watch or has.bracelet then
		local lh = model:FindFirstChild("LeftHand") :: BasePart?
		if lh then
			part(lh, CFrame.new(0, 0.32, 0), Vector3.new(lh.Size.X * 1.1, 0.14, lh.Size.Z * 1.1), if has.watch then Color3.fromRGB(40, 40, 46) else Color3.fromRGB(230, 180, 70), Enum.Material.Metal)
			if has.watch then
				part(lh, CFrame.new(0, 0.32, -lh.Size.Z * 0.5), Vector3.new(0.18, 0.16, 0.06), Color3.fromRGB(190, 220, 250), Enum.Material.Glass)
			end
		end
	end
	if has.bag then
		-- a shoulder bag: strap across the chest, the bag at the hip
		part(torso, CFrame.new(0, 0.05, 0) * CFrame.Angles(0, 0, math.rad(-38)), Vector3.new(0.12, torso.Size.Y * 1.25, torso.Size.Z * 1.08), Color3.fromRGB(70, 56, 44), Enum.Material.Leather)
		part(torso, CFrame.new(-torso.Size.X * 0.62, -torso.Size.Y * 0.4, 0), Vector3.new(0.3, 0.62, 0.75), Color3.fromRGB(90, 70, 52), Enum.Material.Leather)
	end
	if has.vest then
		-- a high-visibility vest with two silver bands
		part(torso, CFrame.new(0, 0, 0), Vector3.new(torso.Size.X * 1.05, torso.Size.Y * 0.98, torso.Size.Z * 1.08), Color3.fromRGB(240, 190, 30), Enum.Material.Fabric)
		for _, y in { 0.12, -0.22 } do
			part(torso, CFrame.new(0, torso.Size.Y * y, -torso.Size.Z * 0.56), Vector3.new(torso.Size.X * 1.06, 0.14, 0.04), Color3.fromRGB(220, 224, 228), Enum.Material.SmoothPlastic)
		end
	end
	-- hand items
	if rightHand then
		if has.tote then
			part(rightHand, CFrame.new(0, -0.5, 0), Vector3.new(0.3, 0.78, 0.95), Rand.pick(rng, { Color3.fromRGB(230, 220, 190), Color3.fromRGB(70, 110, 150), Color3.fromRGB(200, 90, 80) }), Enum.Material.Fabric)
		end
		if has.briefcase then
			part(rightHand, CFrame.new(0, -0.45, 0), Vector3.new(0.25, 0.75, 1.0), Color3.fromRGB(60, 40, 30), Enum.Material.Leather)
		elseif has.handbag then
			part(rightHand, CFrame.new(0, -0.35, 0), Vector3.new(0.3, 0.55, 0.75), Color3.fromRGB(120, 40, 50), Enum.Material.Leather)
		elseif has.book then
			part(rightHand, CFrame.new(0, -0.2, -0.1), Vector3.new(0.15, 0.6, 0.45), Color3.fromRGB(150, 40, 40))
		end
	end
end

-- Creates an NPC. opts: look, gender, name, seed, cf, tag
-- Standing NPCs are anchored so dozens of idle customers and staff cost the server nothing;
-- they are released while walking or sitting down.
local function setAnchored(model: Model, on: boolean)
	local root = model.PrimaryPart
	if root then
		root.Anchored = on
	end
end
NpcService.setAnchored = setAnchored

function NpcService.spawn(opts: { [string]: any }): Model
	local rng = Random.new(opts.seed or math.random(1, 1e9))
	local lookName = if opts.look and LOOKS[opts.look] then opts.look else "casual"
	local gender = if opts.gender == "m" or opts.gender == "f" then opts.gender else pickGender(lookName, rng)
	local list = if Config.RealisticNpcs then templates[lookName .. ":" .. gender] else nil
	local model: Model
	local real = list ~= nil and #list > 0
	if real then
		model = (list :: { Model })[rng:NextInteger(1, #(list :: { Model }))]:Clone()
		reskin(model, rng)
	else
		model = NpcService.plain(lookName, gender, rng)
	end
	model.Name = opts.name or "NPC"
	local hum = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.WalkSpeed = opts.speed or 10
	hum.BreakJointsOnDeath = false
	for _, s in { Enum.HumanoidStateType.Climbing, Enum.HumanoidStateType.Swimming, Enum.HumanoidStateType.FallingDown, Enum.HumanoidStateType.Ragdoll, Enum.HumanoidStateType.Dead, Enum.HumanoidStateType.Flying } do
		hum:SetStateEnabled(s, false)
	end
	if not hum:FindFirstChildOfClass("Animator") then
		Instance.new("Animator").Parent = hum
	end
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	model.PrimaryPart = root
	if opts.cf then
		model:PivotTo(opts.cf)
	end
	if opts.tag then
		model:AddTag(opts.tag)
	end
	model:SetAttribute("Npc", true)
	model:AddTag("NpcModel")
	model:SetAttribute("Gender", gender)
	model.Parent = opts.parent or folder
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	setAnchored(model, true)
	NpcService.play(model, "idle")
	return model
end

----------------------------------------------------------------------------------------------------
-- A person from parts: hair, top, bottom and shoes from a PersonStyle
----------------------------------------------------------------------------------------------------
-- Hair: pieces as { shape, x, y, z, w, h, d [, tilt] } in head sizes from the middle of the head
-- ("b" a box, "o" a ball of diameter w); the face looks along -Z.
local CAP = { "b", 0, 0.42, 0.02, 1.06, 0.32, 1.06 }
local BACK = { "b", 0, 0.1, 0.43, 1.04, 0.62, 0.22 }
local LONGBACK = { "b", 0, -0.25, 0.48, 1.02, 0.9, 0.2 }
local SIDES = { { "b", 0.52, -0.05, 0.1, 0.1, 0.75, 0.9 }, { "b", -0.52, -0.05, 0.1, 0.1, 0.75, 0.9 } }
local HAIR_PARTS = {
	buzz = { { "b", 0, 0.46, 0.02, 1.03, 0.14, 1.03 } },
	short = { CAP, BACK },
	side = { CAP, BACK, { "b", 0.22, 0.34, -0.48, 0.65, 0.2, 0.1 } },
	quiff = { CAP, BACK, { "b", 0, 0.62, -0.3, 0.7, 0.28, 0.5 } },
	curly = { { "o", 0.3, 0.5, 0, 0.5 }, { "o", -0.3, 0.5, 0, 0.5 }, { "o", 0, 0.62, -0.2, 0.5 }, { "o", 0, 0.6, 0.25, 0.5 }, { "o", 0.45, 0.3, 0.25, 0.45 }, { "o", -0.45, 0.3, 0.25, 0.45 }, { "o", 0, 0.3, 0.5, 0.5 } },
	afro = { { "o", 0, 0.38, 0.1, 1.55 } },
	long = { CAP, LONGBACK, SIDES[1], SIDES[2] },
	topknot = { { "b", 0, 0.42, 0.02, 1.04, 0.2, 1.04 }, { "b", 0, 0.1, 0.43, 1.02, 0.5, 0.2 }, { "o", 0, 0.72, 0.12, 0.42 } },
	bald = {},
	spiky = { { "b", 0, 0.46, 0.02, 1.03, 0.16, 1.03 }, { "b", 0, 0.66, 0, 0.22, 0.34, 0.22 }, { "b", 0.3, 0.62, 0, 0.2, 0.3, 0.2, { 0, 0, -25 } }, { "b", -0.3, 0.62, 0, 0.2, 0.3, 0.2, { 0, 0, 25 } }, { "b", 0, 0.62, -0.3, 0.2, 0.3, 0.2, { 25, 0, 0 } }, { "b", 0, 0.62, 0.3, 0.2, 0.3, 0.2, { -25, 0, 0 } } },
	slick = { { "b", 0, 0.4, 0.04, 1.06, 0.3, 1.1 }, { "b", 0, 0.05, 0.5, 1, 0.7, 0.16 } },
	mohawk = { { "b", 0, 0.64, 0, 0.2, 0.42, 0.95 }, { "b", 0, 0.46, 0.02, 1.03, 0.1, 1.03 } },
	wavy = { CAP, BACK, SIDES[1], SIDES[2] },
	ponytail = { CAP, BACK, { "o", 0, 0.15, 0.62, 0.4 }, { "b", 0, -0.3, 0.7, 0.2, 0.8, 0.2 } },
	bob = { CAP, { "b", 0, -0.02, 0.46, 1.1, 0.8, 0.18 }, SIDES[1], SIDES[2] },
	bun = { CAP, BACK, { "o", 0, 0.7, 0.22, 0.5 } },
	braid = { CAP, BACK, { "b", 0, -0.65, 0.56, 0.18, 1, 0.18 } },
	pixie = { CAP, { "b", 0.3, 0.32, -0.48, 0.6, 0.15, 0.1 }, { "b", -0.48, 0.15, 0, 0.1, 0.35, 0.6 } },
	bangs = { CAP, { "b", 0, 0.3, -0.5, 1.06, 0.24, 0.1 }, LONGBACK },
	shoulder = { CAP, { "b", 0, -0.3, 0.46, 1.04, 0.95, 0.2 }, { "b", 0.52, -0.3, 0.12, 0.1, 0.85, 0.7 }, { "b", -0.52, -0.3, 0.12, 0.1, 0.85, 0.7 } },
	twinbuns = { CAP, BACK, { "o", 0.5, 0.62, 0.12, 0.42 }, { "o", -0.5, 0.62, 0.12, 0.42 } },
	sidepony = { CAP, BACK, { "o", 0.58, 0.12, 0.2, 0.38 }, { "b", 0.6, -0.25, 0.22, 0.16, 0.6, 0.16 } },
	fade = { { "b", 0, 0.5, -0.05, 0.8, 0.3, 0.9 }, { "b", 0, 0.38, 0.02, 1.04, 0.12, 1.04 } },
	pompadour = { CAP, BACK, { "b", 0, 0.66, -0.15, 0.8, 0.3, 0.7 } },
	curlybob = { { "o", 0.5, 0.1, 0.15, 0.45 }, { "o", -0.5, 0.1, 0.15, 0.45 }, { "o", 0, 0.1, 0.5, 0.5 }, { "o", 0, 0.55, 0, 0.7 }, { "o", 0.35, 0.4, 0.3, 0.45 }, { "o", -0.35, 0.4, 0.3, 0.45 } },
	halfup = { CAP, LONGBACK, { "o", 0, 0.62, 0.3, 0.36 } },
}
NpcService.HairStyles = HAIR_PARTS

local function buildHair(head: BasePart, hair: { style: string, color: { number } }, hidden: boolean)
	if hidden then
		return
	end
	local specs = HAIR_PARTS[hair.style] or HAIR_PARTS.short
	local hs = head.Size
	local col = c3(hair.color)
	for _, sp in specs do
		local off = CFrame.new(sp[2] * hs.X, sp[3] * hs.Y, sp[4] * hs.Z)
		if sp[1] == "o" then
			part(head, off, Vector3.new(sp[5] * hs.X, 0, 0), col, Enum.Material.SmoothPlastic, "ball")
		else
			local tilt = sp[8]
			if tilt then
				off = off * CFrame.Angles(math.rad(tilt[1]), math.rad(tilt[2]), math.rad(tilt[3]))
			end
			part(head, off, Vector3.new(sp[5] * hs.X, sp[6] * hs.Y, sp[7] * hs.Z), col, Enum.Material.SmoothPlastic)
		end
	end
end

local function limb(model: Model, names: { string }, color: Color3)
	for _, n in names do
		local p = model:FindFirstChild(n)
		if p and p:IsA("BasePart") then
			p.Color = color
		end
	end
end

-- Colours the body parts and adds what the top and the bottom are made of.
local function buildClothes(model: Model, st)
	local skin = c3(st.skin)
	local topCol, accent = c3(st.top.color), c3(st.top.accent)
	local bottomCol = c3(st.bottom.color)
	local kind, pattern = st.top.kind, st.top.pattern
	local darker = topCol:Lerp(Color3.new(0, 0, 0), 0.25)
	local lighter = topCol:Lerp(Color3.new(1, 1, 1), 0.3)
	limb(model, { "Head", "LeftHand", "RightHand" }, skin)
	-- the torso, and the arms (sleeves down to the elbow, to the wrist or none)
	limb(model, { "UpperTorso" }, if kind == "vest" then topCol:Lerp(Color3.new(0, 0, 0), 0.35) else topCol)
	local sleeveCol = if kind == "vest" then accent elseif pattern == "sleeves" then accent else topCol
	local upper = { "LeftUpperArm", "RightUpperArm" }
	local lower = { "LeftLowerArm", "RightLowerArm" }
	if st.sleeves == "none" then
		limb(model, upper, skin)
		limb(model, lower, skin)
	elseif st.sleeves == "short" then
		limb(model, upper, sleeveCol)
		limb(model, lower, skin)
	else
		limb(model, upper, sleeveCol)
		limb(model, lower, sleeveCol)
	end
	-- the hips and the legs
	local bk = st.bottom.kind
	local legsUpper = { "LeftUpperLeg", "RightUpperLeg" }
	local legsLower = { "LeftLowerLeg", "RightLowerLeg" }
	if bk == "dress" then
		limb(model, { "LowerTorso" }, topCol)
		limb(model, legsUpper, skin)
		limb(model, legsLower, skin)
	elseif bk == "skirt" then
		limb(model, { "LowerTorso" }, bottomCol)
		limb(model, legsUpper, skin)
		limb(model, legsLower, skin)
	elseif bk == "shorts" then
		limb(model, { "LowerTorso" }, bottomCol)
		limb(model, legsUpper, bottomCol)
		limb(model, legsLower, skin)
	else
		limb(model, { "LowerTorso" }, bottomCol)
		limb(model, legsUpper, bottomCol)
		limb(model, legsLower, bottomCol)
	end
	limb(model, { "LeftFoot", "RightFoot" }, c3(st.shoes))
	local torso = model:FindFirstChild("UpperTorso") :: BasePart
	local lowerTorso = model:FindFirstChild("LowerTorso") :: BasePart
	if not torso then
		return
	end
	local ts = torso.Size
	local function over(x: number, y: number, z: number, w: number, h: number, d: number, col: Color3, mat: Enum.Material?)
		return part(torso, CFrame.new(x * ts.X, y * ts.Y, z * ts.Z), Vector3.new(w * ts.X, h * ts.Y, d * ts.Z), col, mat or Enum.Material.Fabric)
	end
	-- patterns on the chest (front is -Z)
	if pattern == "stripe" then
		over(0, 0.18, -0.51, 1.02, 0.14, 0.03, accent)
		over(0, -0.06, -0.51, 1.02, 0.14, 0.03, accent)
	elseif pattern == "stripes2" then
		for k = 0, 3 do
			over(0, 0.36 - k * 0.24, -0.51, 1.02, 0.11, 0.03, lighter)
		end
	elseif pattern == "band" then
		over(0, 0.05, -0.51, 1.02, 0.3, 0.03, accent)
	elseif pattern == "pocket" then
		over(-0.27, 0.16, -0.52, 0.24, 0.26, 0.03, darker)
	elseif pattern == "logo" then
		part(torso, CFrame.new(0, ts.Y * 0.12, -ts.Z * 0.52) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(0.03, ts.X * 0.3, ts.X * 0.3), accent, Enum.Material.SmoothPlastic, "cyl")
	end
	-- what kind of top it is
	if kind == "polo" or kind == "shirt" or kind == "blouse" then
		over(-0.16, 0.46, -0.5, 0.26, 0.1, 0.08, lighter)
		over(0.16, 0.46, -0.5, 0.26, 0.1, 0.08, lighter)
		if kind ~= "polo" then
			over(0, -0.02, -0.51, 0.06, 0.95, 0.03, topCol:Lerp(Color3.new(1, 1, 1), 0.5))
		end
	elseif kind == "hoodie" then
		over(0, 0.45, 0.55, 0.7, 0.2, 0.3, darker)
		over(0, -0.25, -0.52, 0.8, 0.28, 0.03, darker)
		over(-0.14, 0.4, -0.52, 0.05, 0.3, 0.03, lighter)
		over(0.14, 0.4, -0.52, 0.05, 0.3, 0.03, lighter)
	elseif kind == "jacket" then
		local inner = c3(st.top.accent)
		over(0, 0, -0.52, 0.3, 0.98, 0.03, inner)
		over(0, 0, -0.53, 0.05, 0.98, 0.03, Color3.fromRGB(40, 40, 44), Enum.Material.Metal)
		over(-0.22, 0.46, -0.5, 0.2, 0.1, 0.08, darker)
		over(0.22, 0.46, -0.5, 0.2, 0.1, 0.08, darker)
	elseif kind == "sweater" then
		over(0, 0.46, -0.0, 0.7, 0.12, 1.06, lighter)
		over(0, -0.46, 0, 1.03, 0.1, 1.04, lighter)
	elseif kind == "vest" then
		over(0, 0, -0.52, 0.04, 0.98, 0.03, Color3.fromRGB(30, 30, 34))
	end
	if lowerTorso then
		local ls = lowerTorso.Size
		-- skirts and dresses: a cylinder round the hips, down to the knees
		if bk == "skirt" or bk == "dress" then
			local col = if bk == "dress" then topCol else bottomCol
			local len = if bk == "dress" then 1.35 else 1.05
			part(lowerTorso, CFrame.new(0, -len * 0.38, 0) * CFrame.Angles(0, 0, math.pi / 2), Vector3.new(len, ls.X * 1.75, ls.X * 1.75), col, Enum.Material.Fabric, "cyl")
		elseif bk == "cargo" then
			for _, sd in { -1, 1 } do
				part(lowerTorso, CFrame.new(sd * ls.X * 0.62, -0.62, 0), Vector3.new(0.14, 0.4, 0.5), bottomCol:Lerp(Color3.new(0, 0, 0), 0.18), Enum.Material.Fabric)
			end
		elseif bk == "sweats" or bk == "jeans" then
			part(lowerTorso, CFrame.new(0, ls.Y * 0.42, -0.0), Vector3.new(ls.X * 1.03, 0.1, ls.Z * 1.04), bottomCol:Lerp(Color3.new(0, 0, 0), 0.3), Enum.Material.Fabric)
		end
	end
end

local function sizeOf(look): string
	return if look.kid then "kid" else "m"
end

-- The stand-in and the standard: a plain R15 rig in the look's colours with part-made hair, clothes
-- and accessories, rolled by PersonStyle.
function NpcService.plain(lookName: string, gender: string, rng: Random): Model
	local look = LOOKS[lookName] or LOOKS.casual
	local st = PersonStyle.roll(look, gender, rng)
	local base = baseRigs[if look.kid then "kid" else (st.size or sizeOf(look))] or baseRigs.m
	local model = base:Clone()
	local skin = c3(st.skin)
	local bc = model:FindFirstChildOfClass("BodyColors")
	if bc then
		-- (the parts are coloured one by one below)
		bc:Destroy()
	end
	buildClothes(model, st)
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	model.PrimaryPart = root
	local head = model:FindFirstChild("Head") :: BasePart?
	local hidden = false
	for _, e in st.extras do
		if e == "hood" or e == "hardhat" or e == "scarf" or e == "balaclava" then
			hidden = true
		end
	end
	if head then
		buildHair(head, st.hair, hidden)
	end
	local hairCol = c3(st.hair.color)
	if st.hair.style == "bald" then
		hairCol = skin:Lerp(Color3.new(0, 0, 0), 0.5)
	end
	dress(model, st.extras, hairCol, gender, rng, true)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanQuery = d == root
			if d ~= root then
				d.CanCollide = false
			end
		end
	end
	model:SetAttribute("Plain", true)
	model:SetAttribute("Avatar", true)
	model:SetAttribute("Look", lookName)
	local hum = model:FindFirstChildOfClass("Humanoid")
	if hum and root then
		model:SetAttribute("Hip", hum.HipHeight + root.Size.Y / 2)
	end
	return model
end

-- Plays one of the default animations (loops idle/walk/run/sit).
function NpcService.play(model: Model, name: string, speed: number?)
	local hum = model:FindFirstChildOfClass("Humanoid")
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	if not animator then
		return
	end
	local current = model:GetAttribute("Anim")
	if current == name then
		return
	end
	model:SetAttribute("Anim", name)
	for _, t in animator:GetPlayingAnimationTracks() do
		t:Stop(0.2)
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = ANIMS[name] or ANIMS.idle
	local ok, track = pcall(function()
		return animator:LoadAnimation(anim)
	end)
	if ok and track then
		track.Looped = name == "idle" or name == "walk" or name == "run" or name == "sit"
		track:Play(0.2)
		if speed then
			track:AdjustSpeed(speed)
		elseif name == "idle" then
			-- a crowd of people standing still should not breathe in step
			track:AdjustSpeed(0.9 + math.random() * 0.2)
			pcall(function()
				if track.Length > 0 then
					track.TimePosition = math.random() * track.Length
				end
			end)
		end
	end
end

-- A gesture (wave, point, cheer, laugh, dance) on someone who is standing around; afterwards they
-- go back to what they were doing. Does nothing for people who are walking or sitting.
function NpcService.emote(model: Model?, name: string, seconds: number?)
	local list = EMOTES[name]
	local hum = model and model:FindFirstChildOfClass("Humanoid")
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	if not model or not list or not hum or not animator or hum.SeatPart then
		return
	end
	local prev = model:GetAttribute("Anim")
	if type(prev) == "string" and (prev == "walk" or prev == "run" or string.sub(prev, 1, 6) == "emote:") then
		return
	end
	local tag = "emote:" .. name
	model:SetAttribute("Anim", tag)
	for _, t in animator:GetPlayingAnimationTracks() do
		t:Stop(0.2)
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = list[math.random(#list)]
	local ok, track = pcall(function()
		return animator:LoadAnimation(anim)
	end)
	local hold = seconds or (if name == "dance" then 5 else 2.6)
	if ok and track then
		track.Looped = name == "dance"
		track:Play(0.2)
	end
	task.delay(hold, function()
		if model.Parent and model:GetAttribute("Anim") == tag then
			if ok and track then
				track:Stop(0.25)
			end
			model:SetAttribute("Anim", nil)
			NpcService.play(model, if type(prev) == "string" and prev ~= "" then prev else "idle")
		end
	end)
end

-- Walks to a position; yields until arrived or timeout. Teleports the last bit if stuck.
-- People walk by being moved along their path in small steps, snapped to the ground under them,
-- instead of through the physics engine: they never get stuck on a kerb, a chair leg or a door
-- frame, never fall through a gap and never slide off a slope. (Anchored all the way, so a crowd
-- costs the server next to nothing.)
local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Exclude
groundParams.RespectCanCollide = true
groundParams.IgnoreWater = true
local ignoreList: { Instance } = {}
local ignoreStamp = 0

local function refreshIgnore()
	local now = os.clock()
	if now - ignoreStamp < 1 then
		return
	end
	ignoreStamp = now
	table.clear(ignoreList)
	for _, m in CollectionService:GetTagged("NpcModel") do
		table.insert(ignoreList, m)
	end
	for _, pl in Players:GetPlayers() do
		if pl.Character then
			table.insert(ignoreList, pl.Character)
		end
	end
	-- (people walk on the city's slabs and floors, never on the terrain under them)
	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if terrain then
		table.insert(ignoreList, terrain)
	end
	groundParams.FilterDescendantsInstances = ignoreList
end

-- Height of the walkable surface under (x, z), looking down from just above `fromY`.
local function groundAt(x: number, fromY: number, z: number): number?
	refreshIgnore()
	local hit = Workspace:Raycast(Vector3.new(x, fromY + 1.5, z), Vector3.new(0, -16, 0), groundParams)
	return hit and hit.Position.Y or nil
end

local WALK_STEP = 0.05

-- Is this person still in the world? (somebody sent home or a shop rebuilt takes them out while a
-- walk is going on)
local function alive(model: Model?): boolean
	if not model then
		return false
	end
	local ok, parent = pcall(function()
		return model.Parent
	end)
	return ok and parent ~= nil
end
NpcService.alive = alive

function NpcService.walkTo(model: Model, pos: Vector3, timeout: number?, run: boolean?): boolean
	if not alive(model) then
		return false
	end
	local hum = model:FindFirstChildOfClass("Humanoid")
	local root = model.PrimaryPart
	if not hum or not root then
		return false
	end
	if hum.SeatPart then
		hum.Sit = false
		task.wait(0.2)
	end
	setAnchored(model, true)
	local speed = math.max(4, hum.WalkSpeed) * (Config.NpcSpeedScale or 1)
	NpcService.play(model, if run then "run" else "walk", if run then 1 else hum.WalkSpeed / 12)
	local start = root.Position
	local flat = Vector3.new(pos.X - start.X, 0, pos.Z - start.Z)
	local dist = flat.Magnitude
	local dir = if dist > 0.01 then flat / dist else root.CFrame.LookVector
	local hip = hum.HipHeight + root.Size.Y / 2
	local limit = timeout or (dist / speed + 4)
	local travelled, y = 0, start.Y
	local targetY, nextSample = y, 0
	local t0, last = os.clock(), os.clock()
	while travelled < dist and alive(model) and os.clock() - t0 < limit do
		task.wait(WALK_STEP)
		if not alive(model) then
			break
		end
		local now = os.clock()
		local dt = math.min(now - last, 0.25)
		travelled = math.min(dist, travelled + speed * dt)
		last = now
		local x, z = start.X + dir.X * travelled, start.Z + dir.Z * travelled
		-- the ground is looked at every few studs, not every step; in between the height eases over
		if travelled >= nextSample then
			local g = groundAt(x, y, z)
			if g then
				targetY = g + hip
			end
			nextSample = travelled + 3
		end
		y += (targetY - y) * math.min(1, dt * 14)
		model:PivotTo(CFrame.lookAt(Vector3.new(x, y, z), Vector3.new(x + dir.X, y, z + dir.Z)))
	end
	local reached = travelled >= dist - 0.01
	if alive(model) then
		if not reached then
			-- ran out of time: stand at the target anyway
			local g = groundAt(pos.X, math.max(y, pos.Y), pos.Z)
			model:PivotTo(CFrame.new(pos.X, (g or pos.Y) + hip, pos.Z) * root.CFrame.Rotation)
		end
		NpcService.play(model, "idle")
	end
	return reached
end

-- Puts somebody on the ground at cf's spot, facing the way cf looks (a clerk behind a counter).
function NpcService.stand(model: Model, cf: CFrame)
	local hum = model:FindFirstChildOfClass("Humanoid")
	local root = model.PrimaryPart
	if not hum or not root then
		return
	end
	local hip = hum.HipHeight + root.Size.Y / 2
	local g = groundAt(cf.X, cf.Y + 4, cf.Z)
	local p = Vector3.new(cf.X, (g or cf.Y) + hip, cf.Z)
	local look = cf.LookVector
	model:PivotTo(CFrame.lookAt(p, p + Vector3.new(look.X, 0, look.Z)))
end

-- Follows a list of points (Vector3 or CFrame or marker parts).
function NpcService.walkPath(model: Model, points: { any }, run: boolean?): boolean
	for _, p in points do
		-- (a marker may be gone by now: the shop was rebuilt while somebody was on their way)
		local ok, pos = pcall(function()
			return if typeof(p) == "Vector3" then p elseif typeof(p) == "CFrame" then p.Position else (p :: BasePart).Position
		end)
		if not alive(model) then
			return false
		end
		if ok then
			NpcService.walkTo(model, pos, nil, run)
		end
	end
	return alive(model)
end

function NpcService.face(model: Model, pos: Vector3)
	local root = model.PrimaryPart
	if root then
		local p = root.Position
		model:PivotTo(CFrame.lookAt(p, Vector3.new(pos.X, p.Y, pos.Z)))
	end
end

function NpcService.sit(model: Model, seat: Seat?)
	local hum = model:FindFirstChildOfClass("Humanoid")
	if hum and seat and not seat.Occupant then
		setAnchored(model, false)
		seat:Sit(hum)
		NpcService.play(model, "sit")
		return true
	end
	return false
end

-- Speech bubble above the head.
function NpcService.say(model: Model, text: string, seconds: number?, color: Color3?)
	local head = model:FindFirstChild("Head")
	if not head then
		return
	end
	local old = head:FindFirstChild("Bubble")
	if old then
		old:Destroy()
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = "Bubble"
	gui.Size = UDim2.fromOffset(240, 70)
	gui.StudsOffset = Vector3.new(0, 2.6, 0)
	gui.MaxDistance = 70
	gui.LightInfluence = 0
	local frame = Instance.new("TextLabel")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = color or Color3.fromRGB(255, 255, 255)
	frame.BackgroundTransparency = 0.05
	frame.TextColor3 = Color3.fromRGB(25, 25, 30)
	frame.TextWrapped = true
	frame.TextScaled = true
	frame.FontFace = B.Fonts.Medium
	frame.Text = text
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 8)
	pad.PaddingRight = UDim.new(0, 8)
	pad.PaddingTop = UDim.new(0, 4)
	pad.PaddingBottom = UDim.new(0, 4)
	pad.Parent = frame
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = frame
	local size = Instance.new("UITextSizeConstraint")
	size.MaxTextSize = 22
	size.Parent = frame
	frame.Parent = gui
	gui.Parent = head
	task.delay(seconds or 5, function()
		if gui.Parent then
			gui:Destroy()
		end
	end)
end

-- Small floating name/mood tag.
function NpcService.tag(model: Model, text: string, color: Color3?)
	local head = model:FindFirstChild("Head")
	if not head then
		return
	end
	local gui = head:FindFirstChild("NameTag") :: BillboardGui?
	if not gui then
		local g = Instance.new("BillboardGui")
		g.Name = "NameTag"
		g.Size = UDim2.fromOffset(200, 26)
		g.StudsOffset = Vector3.new(0, 1.6, 0)
		g.MaxDistance = 40
		g.LightInfluence = 0
		g:AddTag("NameTag") -- the Settings window can hide them
		local l = Instance.new("TextLabel")
		l.Name = "Label"
		l.Size = UDim2.fromScale(1, 1)
		l.BackgroundTransparency = 1
		l.TextColor3 = Color3.new(1, 1, 1)
		l.TextStrokeTransparency = 0.4
		l.FontFace = B.Fonts.Bold
		l.TextScaled = true
		l.Parent = g
		g.Parent = head
		gui = g
	end
	local l = (gui :: BillboardGui):FindFirstChild("Label") :: TextLabel
	l.Text = text
	l.TextColor3 = color or Color3.new(1, 1, 1)
end

-- Something carried in the right hand: "sack" (a bag of loot), or nil to put it down.
function NpcService.carry(model: Model?, what: string?)
	if not model or not NpcService.alive(model) then
		return
	end
	local old = model:FindFirstChild("Carried")
	if old then
		old:Destroy()
	end
	local hand = model:FindFirstChild("RightHand") :: BasePart?
	if not hand or what ~= "sack" then
		return
	end
	local m = Instance.new("Model")
	m.Name = "Carried"
	m.Parent = model -- (in the world first, so the welds to the hand take the right offsets)
	local cloth = Color3.fromRGB(96, 78, 52)
	local function piece(offset: CFrame, size: Vector3, color: Color3, shape: string?, mat: Enum.Material?)
		local p = part(hand, offset, size, color, mat or Enum.Material.Fabric, shape)
		p.Parent = m
		p.Massless = true
		return p
	end
	-- a lumpy bag with a tied neck and a dollar sign on the belly
	piece(CFrame.new(0, -1.25, 0), Vector3.new(1.15, 1.2, 1.0), cloth, "ball")
	piece(CFrame.new(0, -0.6, 0), Vector3.new(0.3, 0.4, 0.3), cloth:Lerp(Color3.new(0, 0, 0), 0.25))
	piece(CFrame.new(0, -0.82, 0), Vector3.new(0.5, 0.09, 0.5), Color3.fromRGB(150, 120, 60))
	local mark = piece(CFrame.new(0, -1.3, -0.52), Vector3.new(0.5, 0.5, 0.04), Color3.fromRGB(70, 56, 36))
	mark.Transparency = 1
	B.sign(mark, Enum.NormalId.Front, "$", { color = Color3.fromRGB(230, 200, 80), font = B.Fonts.Heavy })
end

-- A small line under the name tag: what this person is up to right now ("" or nil: nothing).
function NpcService.status(model: Model, text: string?)
	local head = model:FindFirstChild("Head")
	if not head then
		return
	end
	local gui = head:FindFirstChild("StatusTag") :: BillboardGui?
	if not text or text == "" then
		if gui then
			gui:Destroy()
		end
		return
	end
	if not gui then
		local g = Instance.new("BillboardGui")
		g.Name = "StatusTag"
		g.Size = UDim2.fromOffset(190, 20)
		g.StudsOffset = Vector3.new(0, 1.15, 0)
		g.MaxDistance = 28
		g.LightInfluence = 0
		g:AddTag("NameTag") -- hidden together with the names in Settings
		local l = Instance.new("TextLabel")
		l.Name = "Label"
		l.Size = UDim2.fromScale(1, 1)
		l.BackgroundTransparency = 1
		l.TextColor3 = Color3.fromRGB(190, 225, 255)
		l.TextStrokeTransparency = 0.45
		l.FontFace = B.Fonts.Medium
		l.TextScaled = true
		l.Parent = g
		g.Parent = head
		gui = g
	end
	((gui :: BillboardGui):FindFirstChild("Label") :: TextLabel).Text = text
end

-- Puts a hand tool (a ToolModels name) in the right hand, or takes it away (nil / "hand").
function NpcService.hold(model: Model, toolModel: string?)
	local old = model:FindFirstChild("HeldTool")
	if old then
		if old:GetAttribute("Tool") == toolModel then
			return
		end
		old:Destroy()
	end
	local hand = model:FindFirstChild("RightHand") :: BasePart?
	if not hand or not toolModel or toolModel == "hand" or toolModel == "strap" then
		return
	end
	local tool = ToolModels.build(toolModel, nil)
	tool.Name = "HeldTool"
	tool:SetAttribute("Tool", toolModel)
	-- a hand tool is about as long as a hand and a half: the handle in the fist, the tip out at the
	-- fingers (the arm's pose points them at the work)
	local _, size = tool:GetBoundingBox()
	local length = math.max(size.Y, 0.3)
	tool:ScaleTo(math.clamp(1.2 / length, 0.3, 1.3))
	local _, scaled = tool:GetBoundingBox()
	tool:PivotTo(hand.CFrame * CFrame.new(0, -0.25 - scaled.Y / 2, 0))
	tool.Parent = model
	for _, d in tool:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = false
			d.Massless = true
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			local w = Instance.new("WeldConstraint")
			w.Part0 = hand
			w.Part1 = d
			w.Parent = d
		end
	end
end

-- Somebody at work: the step they are on (a RepairRules action, or "register") drives the arms on
-- every client (NpcPoses), the tool is in their hand and the line under the name says what it is.
-- Everything is cleared with no action.
function NpcService.work(model: Model?, action: string?, toolModel: string?, text: string?)
	if not model or not NpcService.alive(model) then
		return
	end
	model:SetAttribute("Doing", action)
	NpcService.hold(model, if action then toolModel else nil)
	NpcService.status(model, if action then text else nil)
end

function NpcService.despawn(model: Model)
	if model then
		model:Destroy()
	end
end

function NpcService.folder(): Folder
	return folder
end

function NpcService.init()
	folder = Instance.new("Folder")
	folder.Name = "NPCs"
	folder.Parent = Workspace
	baseRigs.m = makeBase("m")
	baseRigs.s = makeBase("s")
	baseRigs.l = makeBase("l")
	baseRigs.kid = makeBase("kid")
	templateFolder = Instance.new("Folder")
	templateFolder.Name = "NpcTemplates"
	templateFolder.Parent = ServerStorage
	streetFolder = Instance.new("Folder")
	streetFolder.Name = "Avatars"
	streetFolder.Parent = ReplicatedStorage
	if Config.RealisticNpcs then
		task.spawn(buildTemplates)
	else
		-- the street crowd for the clients: plain people, every one different
		task.spawn(function()
			local rng = Random.new(20261031)
			for i = 1, Config.StreetPeople do
				-- (every fifteenth is a traffic officer, handed out only as officers)
				local cop = i % 15 == 0
				local look = if cop then "traffic_cop" else Avatars.STREET[(i - 1) % #Avatars.STREET + 1]
				local gender = if cop then (if rng:NextNumber() < 0.7 then "m" else "f") else pickGender(look, rng)
				local person = NpcService.plain(look, gender, rng)
				if cop then
					person:SetAttribute("Cop", true)
				end
				person.Name = "Street" .. i
				local hum = person:FindFirstChildOfClass("Humanoid")
				if hum then
					hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
				end
				person.Parent = streetFolder
				if i % 6 == 0 then
					task.wait()
				end
			end
			templateFolder:SetAttribute("Ready", true)
		end)
	end
end

function NpcService.start() end

return NpcService
