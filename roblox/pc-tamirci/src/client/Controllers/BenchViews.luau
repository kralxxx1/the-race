-- BenchViews: draws the device sitting on every nearby workbench from the bench's "DeviceView"
-- attribute (so you see your staff and other players working), animates the changes, and plays
-- the power-on effects (spinning fans, RGB, the bench monitor's boot screen).

local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local PCModel = require(Shared.Models.PCModel)
local Rules = require(Shared.Repair.RepairRules)
local Signal = require(Shared.Util.Signal)
local S = require(script.Parent.Parent.Strings)

local BenchViews = {}
BenchViews.changed = Signal.new() -- (bench) whenever a device was built or updated

local RANGE_IN = 140
local RANGE_OUT = 190

local folder: Folder
local views: { [Model]: { [string]: any } } = {}
local spinning: { { rotor: Model, stop: number, speed: number } } = {}
local rgbParts: { [BasePart]: number } = {}

local function rootOf(bench: Model): CFrame?
	local anchor = bench:FindFirstChild("DeviceAnchor") :: BasePart?
	if not anchor then
		return nil
	end
	-- the technician looks at the device from the stool side
	return anchor.CFrame * CFrame.Angles(0, math.pi, 0)
end
BenchViews.rootOf = rootOf

local function decode(bench: Model): any
	local raw = bench:GetAttribute("DeviceView")
	if typeof(raw) ~= "string" or #raw == 0 then
		return nil
	end
	local ok, v = pcall(function()
		return HttpService:JSONDecode(raw)
	end)
	return if ok then v else nil
end

local function destroyView(bench: Model)
	local v = views[bench]
	if v and v.handle then
		v.handle:destroy()
	end
	views[bench] = nil
end

-- Shows `view` on the bench (rev guards against stale attribute updates).
function BenchViews.apply(bench: Model, view: any, rev: number?)
	local v = views[bench]
	if v and rev and v.rev and rev < v.rev then
		return
	end
	if not view then
		destroyView(bench)
		return
	end
	local root = rootOf(bench)
	if not root then
		return
	end
	local job = bench:GetAttribute("JobId")
	if v and v.handle and (v.handle.kind ~= view.kind or v.jobId ~= job or v.model ~= view.model) then
		destroyView(bench)
		v = nil
	end
	if not v then
		v = {}
		views[bench] = v
	end
	if not v.handle then
		local ok, h = pcall(PCModel.build, folder, view, root, { animate = true })
		if not ok then
			warn("[BenchViews] " .. tostring(h))
			views[bench] = nil
			return
		end
		v.handle = h
		h.model.Name = "Device_" .. bench:GetFullName()
	else
		local ok, err = pcall(function()
			v.handle:update(view)
		end)
		if not ok then
			warn("[BenchViews] " .. tostring(err))
		end
	end
	v.view = view
	v.rev = rev or v.rev
	v.jobId = job
	v.model = view.model
	BenchViews.changed:Fire(bench)
end

function BenchViews.handle(bench: Model)
	local v = views[bench]
	return v and v.handle or nil
end

function BenchViews.view(bench: Model)
	local v = views[bench]
	return v and v.view or nil
end

local function camPos(): Vector3
	local cam = Workspace.CurrentCamera
	return if cam then cam.CFrame.Position else Vector3.zero
end

-- The bench you are sitting at always keeps its device, wherever the camera is.
local pinned: Model? = nil
function BenchViews.pin(bench: Model?)
	pinned = bench
end

local function near(bench: Model, range: number): boolean
	if bench == pinned then
		return true
	end
	local anchor = bench:FindFirstChild("DeviceAnchor") :: BasePart?
	return anchor ~= nil and (anchor.Position - camPos()).Magnitude < range
end

local function refresh(bench: Model)
	if not bench:IsDescendantOf(Workspace) then
		destroyView(bench)
		return
	end
	if not near(bench, if views[bench] then RANGE_OUT else RANGE_IN) then
		destroyView(bench)
		return
	end
	BenchViews.apply(bench, decode(bench), bench:GetAttribute("DeviceRev"))
end

----------------------------------------------------------------------------------------------------
-- Power-on effects
----------------------------------------------------------------------------------------------------
function BenchViews.monitor(bench: Model, text: string, bg: Color3?)
	local mon = bench:FindFirstChild("BenchMonitor")
	local screen = mon and mon:FindFirstChild("Screen")
	local gui = screen and screen:FindFirstChild("ScreenGui")
	local label = gui and gui:FindFirstChildWhichIsA("TextLabel")
	if label then
		label.Text = text
		label.TextXAlignment = Enum.TextXAlignment.Left
		label.TextYAlignment = Enum.TextYAlignment.Top
		label.TextScaled = false
		label.TextSize = 13
		label.TextWrapped = true
		if bg then
			label.BackgroundColor3 = bg
		end
	end
end

function BenchViews.power(bench: Model, fx: { [string]: any })
	local h = BenchViews.handle(bench)
	if not h then
		return
	end
	local now = os.clock()
	local on = fx.stage ~= "no_power"
	if fx.fans then
		for _, d in h.model:GetDescendants() do
			if d:IsA("Model") and d.Name == "Rotor" then
				table.insert(spinning, { rotor = d, stop = now + 7, speed = 24 + math.random() * 10 })
			end
		end
	end
	for _, d in h.model:GetDescendants() do
		if d:IsA("BasePart") then
			if d:GetAttribute("RGB") and fx.rgb then
				rgbParts[d] = now + 7
			elseif d.Name == "PowerLed" and on then
				d.Transparency = 0
				task.delay(7, function()
					if d.Parent then
						d.Transparency = 0.7
					end
				end)
			end
		end
	end
	local stage = Rules.StageText[fx.stage]
	local text = if stage then S.pick(stage) else ""
	if fx.stage == "no_power" then
		BenchViews.monitor(bench, "", Color3.fromRGB(5, 5, 8))
	elseif fx.stage == "ok" then
		BenchViews.monitor(bench, "Windows\n\n" .. text, Color3.fromRGB(0, 90, 170))
	elseif fx.stage == "no_display" or fx.stage == "no_post" then
		BenchViews.monitor(bench, "NO SIGNAL", Color3.fromRGB(10, 10, 14))
	else
		BenchViews.monitor(bench, "BIOS POST\n\n" .. text, Color3.fromRGB(10, 10, 14))
	end
end

----------------------------------------------------------------------------------------------------
local function watch(bench: Model)
	if not bench:IsA("Model") then
		return
	end
	bench:GetAttributeChangedSignal("DeviceRev"):Connect(function()
		if near(bench, RANGE_OUT) then
			BenchViews.apply(bench, decode(bench), bench:GetAttribute("DeviceRev"))
		end
	end)
	bench:GetAttributeChangedSignal("PowerFx"):Connect(function()
		local raw = bench:GetAttribute("PowerFx")
		if typeof(raw) == "string" and near(bench, RANGE_OUT) then
			local ok, fx = pcall(function()
				return HttpService:JSONDecode(raw)
			end)
			if ok then
				-- let a pending device update land first
				task.defer(BenchViews.power, bench, fx)
			end
		end
	end)
	refresh(bench)
end

function BenchViews.init()
	folder = Instance.new("Folder")
	folder.Name = "BenchDevices"
	folder.Parent = Workspace
	for _, b in CollectionService:GetTagged("Workbench") do
		watch(b)
	end
	CollectionService:GetInstanceAddedSignal("Workbench"):Connect(watch)
	CollectionService:GetInstanceRemovedSignal("Workbench"):Connect(function(b)
		destroyView(b)
	end)
	-- distance culling
	task.spawn(function()
		while true do
			task.wait(1)
			for _, b in CollectionService:GetTagged("Workbench") do
				local has = views[b] ~= nil
				local want = near(b, if has then RANGE_OUT else RANGE_IN) and b:GetAttribute("DeviceView") ~= nil
				if has ~= want then
					refresh(b)
				end
			end
			for b in views do
				if not b.Parent then
					destroyView(b)
				end
			end
		end
	end)
	RunService.RenderStepped:Connect(function(dt)
		for _, v in views do
			if v.handle and v.handle:busy() then
				v.handle:step(dt)
			end
		end
		local now = os.clock()
		for i = #spinning, 1, -1 do
			local s = spinning[i]
			if now > s.stop or not s.rotor.Parent then
				table.remove(spinning, i)
			else
				local left = s.stop - now
				local speed = s.speed * math.min(1, left / 1.5)
				s.rotor:PivotTo(s.rotor:GetPivot() * CFrame.Angles(0, speed * dt, 0))
			end
		end
		for p, untilT in rgbParts do
			if now > untilT or not p.Parent then
				rgbParts[p] = nil
			else
				p.Color = Color3.fromHSV((now * 0.25 + p.Position.X * 0.05) % 1, 0.85, 1)
				p.Transparency = 0.15
			end
		end
	end)
end

return BenchViews
