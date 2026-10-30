-- GearService: the gear players carry (Data/Tools.gear). Owned gear sits in the backpack as a
-- Roblox Tool (number keys to equip); the baseball bat swings with the classic slash and catches
-- the runner within reach (ThiefService.batHit).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Tools = require(Shared.Data.Tools)

local DataService = require(script.Parent.DataService)
local ThiefService = require(script.Parent.ThiefService)

local GearService = {}

local WOOD = Color3.fromRGB(196, 150, 96)
local TAPE = Color3.fromRGB(24, 24, 26)

local function piece(tool: Tool, handle: BasePart, offset: CFrame, size: Vector3, color: Color3, shape: Enum.PartType?, material: Enum.Material?)
	local p = Instance.new("Part")
	p.Name = "Piece"
	p.Shape = shape or Enum.PartType.Cylinder
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.Wood
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CFrame = handle.CFrame * offset
	local w = Instance.new("WeldConstraint")
	w.Part0 = handle
	w.Part1 = p
	w.Parent = p
	p.Parent = tool
	return p
end

-- The bat: a slim grip with black tape and a knob, thickening into the barrel (along the
-- handle's +Z; held near the knob end).
local function makeBat(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Baseball Bat"
	tool.ToolTip = "🏏"
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool:SetAttribute("Gear", "bat")
	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.3, 0.3, 3.2)
	handle.Transparency = 1
	handle.CanCollide = false
	handle.CanTouch = false
	handle.CanQuery = false
	handle.Massless = true
	handle.Parent = tool
	local along = CFrame.Angles(0, math.pi / 2, 0) -- cylinders run along X; turn them onto Z
	piece(tool, handle, CFrame.new(0, 0, -0.85) * along, Vector3.new(1.5, 0.22, 0.22), WOOD)
	piece(tool, handle, CFrame.new(0, 0, -1.05) * along, Vector3.new(0.9, 0.25, 0.25), TAPE, nil, Enum.Material.Fabric)
	piece(tool, handle, CFrame.new(0, 0, -1.58), Vector3.new(0.34, 0.34, 0.34), WOOD, Enum.PartType.Ball)
	piece(tool, handle, CFrame.new(0, 0, 0.1) * along, Vector3.new(0.6, 0.3, 0.3), WOOD)
	piece(tool, handle, CFrame.new(0, 0, 0.85) * along, Vector3.new(1.2, 0.42, 0.42), WOOD)
	piece(tool, handle, CFrame.new(0, 0, 1.47), Vector3.new(0.42, 0.42, 0.42), WOOD, Enum.PartType.Ball)
	tool.Grip = CFrame.new(0, 0, -1.15)
	local sounds = Config.Sounds.Security
	local swing = Instance.new("Sound")
	swing.Name = "Swing"
	swing.SoundId = sounds.swing.id
	swing.Volume = sounds.swing.volume
	swing.Parent = handle
	local hit = Instance.new("Sound")
	hit.Name = "Hit"
	hit.SoundId = sounds.batHit.id
	hit.Volume = sounds.batHit.volume
	hit.Parent = handle
	local last = 0
	tool.Activated:Connect(function()
		local now = os.clock()
		if now - last < 0.6 then
			return
		end
		last = now
		-- the classic tool slash (the character's Animate script plays it)
		local anim = Instance.new("StringValue")
		anim.Name = "toolanim"
		anim.Value = "Slash"
		anim.Parent = tool
		task.delay(0.5, function()
			anim:Destroy()
		end)
		swing:Play()
		local char = tool.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		if player and ThiefService.batHit(player) then
			hit:Play()
		end
	end)
	return tool
end

local MAKERS = { bat = makeBat }

-- Puts each owned piece of gear in the backpack. (A fresh one each spawn: tools copied from
-- StarterGear would come without the swing handler.)
function GearService.equip(player: Player)
	local p = DataService.get(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not p or not p.gear or not backpack then
		return
	end
	for _, g in Tools.gear do
		if p.gear[g.id] and MAKERS[g.id] then
			local has = false
			for _, holder in { backpack, player.Character } do
				for _, t in holder and holder:GetChildren() or {} do
					if t:IsA("Tool") and t:GetAttribute("Gear") == g.id then
						has = true
					end
				end
			end
			if not has then
				MAKERS[g.id]().Parent = backpack
			end
		end
	end
end

function GearService.init() end

function GearService.start()
	local function watch(player: Player)
		player.CharacterAdded:Connect(function()
			task.wait(0.5)
			GearService.equip(player)
		end)
	end
	Players.PlayerAdded:Connect(watch)
	for _, pl in Players:GetPlayers() do
		watch(pl)
	end
	DataService.loaded:Connect(function(player)
		task.defer(GearService.equip, player)
	end)
	DataService.gearChanged:Connect(GearService.equip)
end

return GearService
