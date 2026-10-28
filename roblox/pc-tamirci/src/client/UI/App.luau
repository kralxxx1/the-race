-- App: things every window shares (the main ScreenGui) and the usual "did it work?" toast.

local SoundService = game:GetService("SoundService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local S = require(script.Parent.Parent.Strings)
local Hud = require(script.Parent.Hud)

local App = {}
App.screen = nil :: ScreenGui?
App.sfxVolume = 0.8

local sounds: { [string]: Sound } = {}

-- Plays one of Config.Sounds (Click, Cash, ...) for this player only.
function App.sound(name: string, volume: number?)
	local id = Config.Sounds and Config.Sounds[name]
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = sounds[name]
	if not s then
		s = Instance.new("Sound")
		s.Name = "Ui_" .. name
		s.SoundId = id
		s.Parent = SoundService
		sounds[name] = s
	end
	s.Volume = (volume or 0.5) * App.sfxVolume
	SoundService:PlayLocalSound(s)
end

-- Shows the server's error (or `okText` on success). Returns r.ok.
function App.report(r: { [string]: any }, okText: string?): boolean
	if r.ok then
		if okText then
			Hud.toast(okText, "good")
		end
		return true
	end
	Hud.toast(S.err(r.err, r), "bad")
	return false
end

return App
