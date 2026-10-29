-- Guide: shows the way to the next thing to do.
--   * a bouncing yellow arrow and a soft light pillar above the target (seen from far away)
--   * an arrow on the edge of the screen, with the distance, while the target is off screen
--   * a pointing hand next to a HUD button when the next step is on the screen
-- Also keeps a "🏠 your shop" marker over the player's own shop whenever it's out of sight.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local App = require(Client.UI.App)
local S = require(Client.Strings)

local Guide = {}

local player = Players.LocalPlayer
local target: any = nil -- BasePart, Model, Attachment or Vector3
local uiTarget: GuiObject? = nil
local folder: Folder
local arrow: Model
local pillar: BasePart
local edge: Frame
local edgeArrow: TextLabel
local edgeText: TextLabel
local hand: TextLabel
local homeTag: BillboardGui
local homeText: TextLabel

local YELLOW = Color3.fromRGB(255, 214, 40)

local function part(size: Vector3, cf: CFrame, color: Color3, transparency: number?): BasePart
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.Neon
	p.Color = color
	p.Size = size
	p.CFrame = cf
	p.Transparency = transparency or 0
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	return p
end

-- A downward arrow (shaft and a two-wedge head) made around the model's origin.
local function buildArrow(): Model
	local m = Instance.new("Model")
	m.Name = "GuideArrow"
	local root = part(Vector3.new(0.2, 0.2, 0.2), CFrame.new(), YELLOW, 1)
	root.Name = "Root"
	root.Parent = m
	m.PrimaryPart = root
	part(Vector3.new(0.9, 2.2, 0.9), CFrame.new(0, 1.9, 0), YELLOW).Parent = m
	for side = -1, 1, 2 do
		local w = Instance.new("WedgePart")
		w.Anchored = true
		w.CanCollide = false
		w.CanQuery = false
		w.CanTouch = false
		w.CastShadow = false
		w.Material = Enum.Material.Neon
		w.Color = YELLOW
		w.Size = Vector3.new(0.9, 1.6, 1.3)
		-- two wedges back to back make a triangle pointing down
		w.CFrame = CFrame.new(side * 0.65, 0, 0) * CFrame.Angles(0, -side * math.pi / 2, math.pi)
		w.Parent = m
	end
	local light = Instance.new("PointLight")
	light.Color = YELLOW
	light.Brightness = 2
	light.Range = 12
	light.Parent = root
	return m
end

Guide._buildArrow = buildArrow

local function positionOf(t: any): Vector3?
	if typeof(t) == "Vector3" then
		return t
	elseif typeof(t) == "Instance" then
		if not t.Parent then
			return nil
		end
		if t:IsA("BasePart") then
			return t.Position
		elseif t:IsA("Model") then
			return t:GetPivot().Position
		elseif t:IsA("Attachment") then
			return t.WorldPosition
		end
	end
	return nil
end
Guide.positionOf = positionOf

-- Points at a place in the world (nil clears it). height: how far above it the arrow floats.
function Guide.point(t: any, height: number?)
	target = t
	Guide.height = height or 6
	uiTarget = nil
end

-- Points at a button on the screen instead.
function Guide.pointUi(obj: GuiObject?)
	uiTarget = obj
	target = nil
end

function Guide.clear()
	target = nil
	uiTarget = nil
end

function Guide.current(): any
	return target or uiTarget
end

local function myShop(): Model?
	local id = player:GetAttribute("Plot")
	local plots = Workspace:FindFirstChild("Plots")
	local holder = plots and plots:FindFirstChild("Plot_" .. tostring(id))
	return holder and holder:FindFirstChild("Shop") :: Model?
end
Guide.myShop = myShop

-- A named point of the player's own shop ("Door", "Register"...), if built.
function Guide.shopPoint(name: string): BasePart?
	local shop = myShop()
	local points = shop and shop:FindFirstChild("Points")
	return points and points:FindFirstChild(name) :: BasePart?
end

local function myRoot(): BasePart?
	local char = player.Character
	return char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function step(dt: number)
	local cam = Workspace.CurrentCamera
	local pos = target and positionOf(target)
	local t = os.clock()
	-- the arrow and pillar in the world
	if pos then
		local h = Guide.height or 6
		local bob = math.sin(t * 3) * 0.6
		arrow:PivotTo(CFrame.new(pos + Vector3.new(0, h + bob, 0)) * CFrame.Angles(0, t * 1.5, 0))
		if arrow.Parent ~= folder then
			arrow.Parent = folder
		end
		local root = myRoot()
		local far = root and (root.Position - pos).Magnitude > 45
		pillar.CFrame = CFrame.new(pos + Vector3.new(0, h + 40, 0)) * CFrame.Angles(0, 0, math.pi / 2)
		pillar.Transparency = if far then 0.55 else 1
		if pillar.Parent ~= folder then
			pillar.Parent = folder
		end
	else
		arrow.Parent = nil
		pillar.Parent = nil
	end
	-- the edge pointer when the target is off screen
	edge.Visible = false
	if pos and cam then
		local vp, onScreen = cam:WorldToViewportPoint(pos + Vector3.new(0, (Guide.height or 6), 0))
		local size = cam.ViewportSize
		if not onScreen or vp.X < 0 or vp.Y < 0 or vp.X > size.X or vp.Y > size.Y then
			-- direction from the screen centre (flipped when behind the camera)
			local c = size / 2
			local d = Vector2.new(vp.X, vp.Y) - c
			if vp.Z < 0 then
				d = -d
			end
			if d.Magnitude < 1 then
				d = Vector2.new(0, 1)
			end
			d = d.Unit
			local margin = 70
			local k = math.min((c.X - margin) / math.max(math.abs(d.X), 1e-3), (c.Y - margin) / math.max(math.abs(d.Y), 1e-3))
			local p = c + d * k
			local inset = Workspace.CurrentCamera and App.screen and App.screen.AbsolutePosition or Vector2.zero
			edge.Position = UDim2.fromOffset(p.X - inset.X, p.Y - inset.Y)
			edgeArrow.Rotation = math.deg(math.atan2(d.Y, d.X))
			local root = myRoot()
			local meters = if root then math.floor((root.Position - pos).Magnitude * 0.28 + 0.5) else 0
			edgeText.Text = S.t("guide_dist", { m = meters })
			edge.Visible = true
		end
	end
	-- a pointing hand beside a HUD button
	if uiTarget and uiTarget.Parent and uiTarget.Visible then
		local a, s = uiTarget.AbsolutePosition, uiTarget.AbsoluteSize
		local inset = App.screen and App.screen.AbsolutePosition or Vector2.zero
		hand.Position = UDim2.fromOffset(a.X + s.X + 6 + math.sin(t * 5) * 6 - inset.X, a.Y + s.Y / 2 - inset.Y)
		hand.Visible = true
	else
		hand.Visible = false
	end
	-- "your shop" over the shop while it's far away
	local shop = myShop()
	local door = Guide.shopPoint("Door")
	local root = myRoot()
	if shop and door and root then
		homeTag.Adornee = door
		homeTag.Enabled = (root.Position - door.Position).Magnitude > 70
	else
		homeTag.Enabled = false
	end
	_ = dt
end

function Guide.init()
	folder = Instance.new("Folder")
	folder.Name = "Guide"
	folder.Parent = Workspace
	arrow = buildArrow()
	pillar = part(Vector3.new(80, 1.2, 1.2), CFrame.new(), YELLOW, 1)
	pillar.Shape = Enum.PartType.Cylinder
	pillar.Name = "GuidePillar"

	edge = Kit.frame(App.screen, { Name = "GuideEdge", BackgroundTransparency = 1, Size = UDim2.fromOffset(84, 70), AnchorPoint = Vector2.new(0.5, 0.5), Visible = false, ZIndex = 40 })
	edgeArrow = Kit.label(edge, "➤", { Size = UDim2.fromOffset(44, 44), Position = UDim2.fromOffset(20, 0), TextSize = 40, TextColor3 = YELLOW, TextStrokeTransparency = 0.2, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 41 })
	edgeText = Kit.label(edge, "", { Size = UDim2.fromOffset(84, 20), Position = UDim2.fromOffset(0, 46), TextSize = 14, FontFace = Theme.bold, TextStrokeTransparency = 0.3, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 41 })
	hand = Kit.label(App.screen, "👈", { Name = "GuideHand", Size = UDim2.fromOffset(40, 40), AnchorPoint = Vector2.new(0, 0.5), TextSize = 34, Visible = false, ZIndex = 60 })

	homeTag = Instance.new("BillboardGui")
	homeTag.Name = "MyShopTag"
	homeTag.Size = UDim2.fromOffset(150, 46)
	homeTag.StudsOffset = Vector3.new(0, 24, 0)
	homeTag.AlwaysOnTop = true
	homeTag.LightInfluence = 0
	homeTag.MaxDistance = 2000
	homeTag.Enabled = false
	homeText = Kit.label(homeTag, "🏠 " .. S.t("guide_home"), { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 0.25, BackgroundColor3 = Theme.accent2, TextSize = 18, FontFace = Theme.heavy, TextXAlignment = Enum.TextXAlignment.Center })
	Kit.corner(homeText, UDim.new(0, 10))
	homeTag.Parent = folder

	RunService.RenderStepped:Connect(step)
end

function Guide.relabel()
	if homeText then
		homeText.Text = "🏠 " .. S.t("guide_home")
	end
end

return Guide
