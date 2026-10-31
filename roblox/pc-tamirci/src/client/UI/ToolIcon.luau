-- ToolIcon: a small picture of a tool drawn from its real 3D model (the same one you hold over the
-- bench). Emoji could not do this job: some of them (the screwdriver, the pry tool, the bubbles) are
-- missing from the game font and showed up as empty boxes. Every picture is a ViewportFrame; if a
-- viewport cannot be made the emoji stays as the fallback.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tools = require(Shared.Data.Tools)
local ToolModels = require(Shared.Models.ToolModels)

local ToolIcon = {}

local TILT = CFrame.Angles(0, math.rad(-25), math.rad(-38))
local FOV = 28

-- one built model per tool, cloned into every picture
local templates: { [string]: { model: Model, size: Vector3, center: Vector3 }? } = {}

local function template(toolId: string)
	local cached = templates[toolId]
	if cached ~= nil then
		return cached
	end
	local tool = Tools.get(toolId)
	local ok, built = pcall(function()
		local m = ToolModels.build(tool and tool.model or "hand", nil)
		m:PivotTo(TILT)
		local cf, size = m:GetBoundingBox()
		return { model = m, size = size, center = cf.Position }
	end)
	templates[toolId] = if ok then built else nil
	return templates[toolId]
end

-- Puts the picture of `toolId` into `host` (it fills it). Returns the ViewportFrame, or nil when
-- the picture could not be made.
function ToolIcon.attach(host: GuiObject, toolId: string): ViewportFrame?
	local t = template(toolId)
	if not t then
		return nil
	end
	local ok, vp = pcall(function()
		local frame = Instance.new("ViewportFrame")
		frame.Name = "ToolIcon"
		frame.BackgroundTransparency = 1
		frame.Size = UDim2.fromScale(1, 1)
		frame.Ambient = Color3.fromRGB(176, 178, 186)
		frame.LightColor = Color3.fromRGB(255, 246, 232)
		frame.LightDirection = Vector3.new(-0.5, -0.8, -0.6)
		frame.ZIndex = host.ZIndex + 1
		local cam = Instance.new("Camera")
		cam.FieldOfView = FOV
		local clone = t.model:Clone()
		clone.Parent = frame
		local size = t.size
		-- (far enough for the longest side to fit, with a little air around it)
		local reach = math.max(size.X, size.Y, size.Z) * 0.5 * 1.18 / math.tan(math.rad(FOV / 2))
		cam.CFrame = CFrame.lookAt(t.center + Vector3.new(0, 0, reach), t.center)
		cam.Parent = frame
		frame.CurrentCamera = cam
		frame.Parent = host
		return frame
	end)
	return if ok then vp else nil
end

-- A tool button: the picture instead of the emoji.
function ToolIcon.button(b: TextButton, toolId: string)
	if ToolIcon.attach(b, toolId) then
		b.Text = ""
	end
end

-- A row from Kit.row (its first TextLabel child is the icon).
function ToolIcon.row(row: Instance, toolId: string)
	for _, d in row:GetChildren() do
		if d:IsA("TextLabel") then
			local host = Instance.new("Frame")
			host.Name = "IconHost"
			host.BackgroundTransparency = 1
			host.Size = d.Size
			host.Position = d.Position
			host.Parent = row
			if ToolIcon.attach(host, toolId) then
				d.Text = ""
			else
				host:Destroy()
			end
			return
		end
	end
end

return ToolIcon
