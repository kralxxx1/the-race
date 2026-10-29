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

-- Plays a sound id once, for this player only.
function App.play(id: string?, volume: number?)
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = sounds[id]
	if not s then
		s = Instance.new("Sound")
		s.Name = "Sfx"
		s.SoundId = id
		s.Parent = SoundService
		sounds[id] = s
	end
	s.Volume = (volume or 0.5) * App.sfxVolume
	SoundService:PlayLocalSound(s)
end

-- Plays one of Config.Sounds (Click, Cash, ...) for this player only.
function App.sound(name: string, volume: number?)
	App.play(Config.Sounds and Config.Sounds[name], volume)
end

-- Keeps a sound id playing until the returned function is called.
function App.loop(id: string?, volume: number?): () -> ()
	if type(id) ~= "string" or id == "" then
		return function() end
	end
	local s = Instance.new("Sound")
	s.Name = "SfxLoop"
	s.SoundId = id
	s.Looped = true
	s.Volume = (volume or 0.5) * App.sfxVolume
	s.Parent = SoundService
	s:Play()
	return function()
		s:Stop()
		s:Destroy()
	end
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
