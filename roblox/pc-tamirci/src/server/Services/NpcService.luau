-- NpcService: people in the city — customers, staff, thieves. Builds an R15 body from a base rig,
-- dresses it from a "look" (clothes colours plus hair, hats, glasses, bags made of parts), plays
-- the default R15 animations and shows speech bubbles.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)

local NpcService = {}

local ANIMS = {
	idle = "rbxassetid://507766666",
	walk = "rbxassetid://507777826",
	run = "rbxassetid://507767714",
	sit = "rbxassetid://2506281703",
	wave = "rbxassetid://507770239",
	point = "rbxassetid://507770453",
	cheer = "rbxassetid://507770677",
	laugh = "rbxassetid://507770818",
}
NpcService.Anims = ANIMS

local SKIN = {
	{ 255, 224, 196 }, { 241, 194, 160 }, { 224, 172, 130 }, { 198, 140, 98 }, { 160, 108, 72 }, { 120, 80, 52 }, { 92, 60, 40 },
}
local HAIR = { { 20, 18, 16 }, { 60, 40, 26 }, { 110, 70, 40 }, { 180, 140, 90 }, { 220, 190, 130 }, { 140, 50, 30 }, { 200, 200, 200 } }

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
	shady = { shirt = { { 26, 26, 28 } }, pants = { { 30, 30, 34 } }, extras = { "hood", "sunglasses" } },
	teacher = { shirt = { { 120, 90, 120 }, { 90, 120, 100 } }, pants = { { 60, 60, 70 } }, extras = { "glasses", "book" } },
	tourist = { shirt = { { 250, 150, 60 }, { 60, 200, 200 } }, pants = { { 200, 190, 160 } }, extras = { "sunhat", "camera" } },
	annoying = { shirt = { { 250, 60, 160 }, { 250, 230, 40 } }, pants = { { 120, 40, 200 } }, extras = { "sunglasses_up" } },
	shopkeeper = { shirt = { { 240, 240, 240 } }, pants = { { 40, 40, 44 } }, extras = { "apron" } },
	technician = { shirt = { { 40, 110, 200 } }, pants = { { 36, 40, 50 } }, extras = { "lanyard" } },
	thief = { shirt = { { 30, 30, 34 } }, pants = { { 30, 30, 34 } }, extras = { "beanie", "mask" } },
	guard = { shirt = { { 30, 40, 70 } }, pants = { { 26, 28, 40 } }, extras = { "guardcap" } },
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
local function dress(model: Model, extras: { string }, hair: Color3, gender: string, rng: Random)
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
	if not hood and not has.hardhat then
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
	-- hand items
	if rightHand then
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
	local look = LOOKS[opts.look or "casual"] or LOOKS.casual
	local base = baseRigs[if look.kid then "kid" else "adult"]
	local model = base:Clone()
	model.Name = opts.name or "NPC"
	local skin = c3(Rand.pick(rng, SKIN))
	local shirt = c3(Rand.pick(rng, look.shirt))
	local pants = c3(Rand.pick(rng, look.pants))
	local bc = model:FindFirstChildOfClass("BodyColors")
	if not bc then
		bc = Instance.new("BodyColors")
		bc.Parent = model
	end
	bc.HeadColor3 = skin
	bc.TorsoColor3 = shirt
	bc.LeftArmColor3 = shirt
	bc.RightArmColor3 = shirt
	bc.LeftLegColor3 = pants
	bc.RightLegColor3 = pants
	-- hands keep the skin colour
	for _, n in { "LeftHand", "RightHand" } do
		local h = model:FindFirstChild(n)
		if h and h:IsA("BasePart") then
			h.Color = skin
		end
	end
	for _, n in { "LeftFoot", "RightFoot" } do
		local f = model:FindFirstChild(n)
		if f and f:IsA("BasePart") then
			f.Color = Color3.fromRGB(30, 30, 32)
		end
	end
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
	dress(model, look.extras or {}, c3(Rand.pick(rng, HAIR)), opts.gender or "m", rng)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanQuery = d == root
			if d ~= root then
				d.CanCollide = false
			end
		end
	end
	if opts.tag then
		model:AddTag(opts.tag)
	end
	model:SetAttribute("Npc", true)
	model.Parent = opts.parent or folder
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	setAnchored(model, true)
	NpcService.play(model, "idle")
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
		end
	end
end

-- Walks to a position; yields until arrived or timeout. Teleports the last bit if stuck.
function NpcService.walkTo(model: Model, pos: Vector3, timeout: number?, run: boolean?): boolean
	local hum = model:FindFirstChildOfClass("Humanoid")
	local root = model.PrimaryPart
	if not hum or not root or not model.Parent then
		return false
	end
	setAnchored(model, false)
	if hum.SeatPart then
		hum.Sit = false
		hum.Jump = true
		task.wait(0.2)
	end
	NpcService.play(model, if run then "run" else "walk", if run then 1 else hum.WalkSpeed / 12)
	local limit = timeout or ((root.Position - pos).Magnitude / math.max(4, hum.WalkSpeed) + 3)
	local done = false
	local reached = false
	local conn = hum.MoveToFinished:Connect(function(r)
		done = true
		reached = r
	end)
	hum:MoveTo(pos)
	local t0 = os.clock()
	while not done and os.clock() - t0 < limit and model.Parent do
		task.wait(0.1)
		-- MoveTo expires after 8 s; keep nudging
		if not done and os.clock() - t0 > 7 then
			hum:MoveTo(pos)
		end
	end
	conn:Disconnect()
	if model.Parent and (root.Position - pos).Magnitude > 3 then
		model:PivotTo(CFrame.new(pos + Vector3.new(0, hum.HipHeight + root.Size.Y / 2, 0)) * root.CFrame.Rotation)
	end
	if model.Parent then
		NpcService.play(model, "idle")
		if not hum.SeatPart then
			setAnchored(model, true)
		end
	end
	return reached
end

-- Follows a list of points (Vector3 or CFrame or marker parts).
function NpcService.walkPath(model: Model, points: { any }, run: boolean?): boolean
	for _, p in points do
		local pos = if typeof(p) == "Vector3" then p elseif typeof(p) == "CFrame" then p.Position else (p :: BasePart).Position
		if not model.Parent then
			return false
		end
		NpcService.walkTo(model, pos, nil, run)
	end
	return model.Parent ~= nil
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
	baseRigs.adult = makeBase("adult")
	baseRigs.kid = makeBase("kid")
end

function NpcService.start() end

return NpcService
