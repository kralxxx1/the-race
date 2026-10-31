-- Display: puts the Settings window's choices to work — volumes, shadows and post effects,
-- brightness, field of view, UI size, name tags and street life. Everything reads Prefs and
-- re-applies when a value changes.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Client = script.Parent.Parent
local Prefs = require(Client.Prefs)
local App = require(Client.UI.App)
local Ambience = require(script.Parent.Ambience)
local Traffic = require(script.Parent.Traffic)
local Weather = require(script.Parent.Weather)
local Graphics = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Data.Graphics)

local Display = {}

local function applyAudio()
	App.sfxVolume = Prefs.volume("sfx")
	Ambience.setMix(Prefs.volume("music"), Prefs.volume("ambience"))
end

-- Roblox's own graphics level (1..10, 0 = leave it to the automatic setting)
local function applyEngineLevel()
	local level = Prefs.get("gfxlevel")
	if level < 1 then
		return
	end
	pcall(function()
		local gs = UserSettings():GetService("UserGameSettings")
		gs.SavedQualityLevel = Enum.SavedQualitySetting:GetEnumItems()[math.clamp(math.floor(level + 0.5), 1, 10) + 1]
	end)
end

local function applyGraphics()
	Lighting.GlobalShadows = Prefs.get("shadows")
	pcall(function()
		Lighting.ShadowSoftness = 0.05 + Prefs.get("shadowsoft") * 0.95
		Lighting.EnvironmentSpecularScale = Prefs.get("reflections")
	end)
	Ambience.setLook({
		skylight = Prefs.get("skylight"),
		bloom = Prefs.get("bloomamt"),
		rays = Prefs.get("raysamt"),
		glare = Prefs.get("glare"),
		haze = Prefs.get("haze"),
		cover = Prefs.get("cloudcover"),
		grade = Prefs.get("look"),
		contrast = Prefs.get("contrast"),
		saturation = Prefs.get("saturation"),
	})
	Weather.setOptions({
		rain = Prefs.get("rain"),
		splashes = Prefs.get("splashes"),
		flashes = Prefs.get("flashes"),
		lens = Prefs.get("lens"),
		effects = Prefs.get("particles"),
	})
	Traffic.setCrowd(Prefs.get("crowd"))
	applyEngineLevel()
	Ambience.setEffects({
		bloom = Prefs.get("bloom"),
		rays = Prefs.get("sunrays"),
		dof = Prefs.get("dof"),
		clouds = Prefs.get("clouds"),
	})
	Ambience.setTrim(Prefs.get("brightness"))
end

local function applyNames()
	local on = Prefs.get("names")
	for _, gui in CollectionService:GetTagged("NameTag") do
		if gui:IsA("BillboardGui") then
			gui.Enabled = on
		end
	end
end

local function applyScreen()
	if App.screen then
		App.screen:SetAttribute("UserScale", Prefs.get("uiscale"))
	end
end

local AUDIO = { master = true, music = true, sfx = true, ambience = true, musicOn = true, sfxOn = true, ambienceOn = true }
local GRAPHICS = { shadows = true, bloom = true, sunrays = true, dof = true, clouds = true, brightness = true }
for _, o in Graphics.list do
	GRAPHICS[o.id] = true
end

-- Applies every setting named in `changed` (all of them when nil).
function Display.apply(changed: { [string]: boolean }?)
	local function has(set: { [string]: boolean }): boolean
		if not changed then
			return true
		end
		for k in set do
			if changed[k] then
				return true
			end
		end
		return false
	end
	if has(AUDIO) then
		applyAudio()
	end
	if has(GRAPHICS) then
		applyGraphics()
	end
	if not changed or changed.names then
		applyNames()
	end
	if not changed or changed.uiscale then
		applyScreen()
	end
	if not changed or changed.traffic then
		Traffic.setDensity(Prefs.get("traffic"))
	end
end

function Display.init()
	Prefs.changed:Connect(Display.apply)
	Display.apply(nil)
	CollectionService:GetInstanceAddedSignal("NameTag"):Connect(function(gui)
		if gui:IsA("BillboardGui") then
			gui.Enabled = Prefs.get("names")
		end
	end)
	-- motion blur while driving fast (the camera's own speed, only seated in a vehicle)
	local blur = Lighting:FindFirstChild("AmbMotion") :: BlurEffect?
	if not blur then
		blur = Instance.new("BlurEffect")
		blur.Name = "AmbMotion"
		blur.Size = 0
		blur.Parent = Lighting
	end
	local lastPos: Vector3? = nil
	local smooth = 0
	RunService.RenderStepped:Connect(function(dt)
		local cam = Workspace.CurrentCamera
		local char = Players.LocalPlayer and Players.LocalPlayer.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local seat = hum and hum.SeatPart
		local driving = seat ~= nil and seat:IsA("VehicleSeat")
		local target = 0
		if cam and lastPos and driving and Prefs.get("motionblur") and dt > 0 then
			local speed = (cam.CFrame.Position - lastPos).Magnitude / dt
			if speed < 400 then
				target = math.clamp((speed - 70) / 14, 0, 7)
			end
		end
		lastPos = if cam then cam.CFrame.Position else nil
		smooth += (target - smooth) * math.min(1, dt * 4)
		if blur then
			blur.Size = smooth
			blur.Enabled = smooth > 0.2
		end
	end)
	-- field of view: the default camera hands it back to 70 now and then; the bench, the garage
	-- and the map use scriptable cameras of their own and keep theirs
	RunService:BindToRenderStep("PrefsFov", Enum.RenderPriority.Camera.Value + 1, function()
		local cam = Workspace.CurrentCamera
		if cam and cam.CameraType ~= Enum.CameraType.Scriptable then
			local fov = Prefs.get("fov")
			if math.abs(cam.FieldOfView - fov) > 0.05 then
				cam.FieldOfView = fov
			end
		end
	end)
end

return Display
