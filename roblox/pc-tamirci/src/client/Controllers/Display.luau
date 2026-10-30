-- Display: puts the Settings window's choices to work — volumes, shadows and post effects,
-- brightness, field of view, UI size, name tags and street life. Everything reads Prefs and
-- re-applies when a value changes.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Client = script.Parent.Parent
local Prefs = require(Client.Prefs)
local App = require(Client.UI.App)
local Ambience = require(script.Parent.Ambience)
local Traffic = require(script.Parent.Traffic)
local Weather = require(script.Parent.Weather)

local Display = {}

local function applyAudio()
	App.sfxVolume = Prefs.volume("sfx")
	Ambience.setMix(Prefs.volume("music"), Prefs.volume("ambience"))
end

local function applyGraphics()
	Lighting.GlobalShadows = Prefs.get("shadows")
	Ambience.setEffects({
		bloom = Prefs.get("bloom"),
		rays = Prefs.get("sunrays"),
		dof = Prefs.get("dof"),
		clouds = Prefs.get("clouds"),
	})
	Ambience.setTrim(Prefs.get("brightness"))
	Weather.setQuality(Prefs.get("quality"))
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
