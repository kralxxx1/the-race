-- Prefs: the player's settings (audio, graphics, help) as the client sees them.
-- Reads come from the server snapshot (State.data.settings) with defaults for anything missing;
-- writes apply at once on this client and are sent to the server in small batches, so dragging
-- a slider does not flood the remote and a snapshot arriving mid-drag cannot undo the change.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)

local State = require(script.Parent.State)
local S = require(script.Parent.Strings)

local Prefs = {}

Prefs.DEFAULTS = {
	master = 1,
	music = 0.5,
	sfx = 0.8,
	ambience = 0.8,
	musicOn = true,
	sfxOn = true,
	ambienceOn = true,
	help = "guided",
	difficulty = "normal",
	quality = "high",
	shadows = true,
	bloom = true,
	sunrays = true,
	dof = true,
	clouds = true,
	names = true,
	shake = true,
	fov = 70,
	brightness = 0,
	uiscale = 1,
	traffic = "normal",
}

-- The graphics presets: what each quality level switches on.
Prefs.QUALITIES = { "low", "medium", "high", "ultra" }
Prefs.PRESETS = {
	low = { shadows = false, bloom = false, sunrays = false, dof = false, clouds = false, traffic = "low" },
	medium = { shadows = true, bloom = true, sunrays = false, dof = false, clouds = true, traffic = "normal" },
	high = { shadows = true, bloom = true, sunrays = true, dof = true, clouds = true, traffic = "normal" },
	ultra = { shadows = true, bloom = true, sunrays = true, dof = true, clouds = true, traffic = "high" },
}

local SEND_DELAY = 0.35

Prefs.changed = Signal.new() -- (changed keys: { [string]: true })
Prefs.languageChanged = Signal.new() -- ("en" | "tr")

local values: { [string]: any } = table.clone(Prefs.DEFAULTS)
local dirty: { [string]: any } = {} -- changed here, not yet confirmed by the server
local sending = false

local function clamp(key: string, v: any): any
	local d = Prefs.DEFAULTS[key]
	if type(d) == "number" then
		if type(v) ~= "number" or v ~= v then
			return d
		end
		if key == "fov" then
			return math.clamp(v, 55, 100)
		elseif key == "brightness" then
			return math.clamp(v, -1, 1)
		elseif key == "uiscale" then
			return math.clamp(v, 0.7, 1.4)
		end
		return math.clamp(v, 0, 1)
	elseif type(d) == "boolean" then
		return v == true
	end
	return v
end

function Prefs.get(key: string): any
	return values[key]
end

-- The volume a channel actually plays at: master × channel, silent when its switch is off.
function Prefs.volume(channel: string): number
	if values[channel .. "On"] == false then
		return 0
	end
	return values.master * values[channel]
end

local function flush()
	if sending then
		return
	end
	sending = true
	task.delay(SEND_DELAY, function()
		sending = false
		local batch = dirty
		dirty = {}
		if next(batch) == nil then
			return
		end
		local ok = pcall(function()
			Net.request("settings.set", batch)
		end)
		if not ok then
			-- try again with whatever has been changed since
			for k, v in batch do
				if dirty[k] == nil then
					dirty[k] = v
				end
			end
			flush()
		end
	end)
end

local function mirror(key: string, v: any)
	local d = State.data
	if d then
		d.settings = d.settings or {}
		d.settings[key] = v
	end
end

-- Changes several settings at once (one change signal, one batch to the server).
function Prefs.setMany(changes: { [string]: any })
	local changed = {}
	for key, v in changes do
		if Prefs.DEFAULTS[key] ~= nil then
			v = clamp(key, v)
			if values[key] ~= v then
				values[key] = v
				dirty[key] = v
				mirror(key, v)
				changed[key] = true
			end
		end
	end
	if next(changed) then
		flush()
		Prefs.changed:Fire(changed)
	end
end

function Prefs.set(key: string, v: any)
	Prefs.setMany({ [key] = v })
end

-- The game's language ("en" | "tr"): applied here at once, saved with the player.
function Prefs.setLanguage(lang: string)
	lang = if lang == "tr" then "tr" else "en"
	S.setLang(lang)
	local d = State.data
	if d then
		d.lang = lang
	end
	task.spawn(function()
		pcall(function()
			Net.request("settings.set", { lang = lang })
		end)
	end)
	Prefs.languageChanged:Fire(lang)
end

-- Has this player ever chosen a language? (The first start asks.)
function Prefs.languageChosen(): boolean
	local d = State.data
	return d ~= nil and (d.lang == "tr" or d.lang == "en")
end

-- Graphics preset: sets the quality word and every switch it stands for.
function Prefs.preset(quality: string)
	local p = Prefs.PRESETS[quality]
	if not p then
		return
	end
	local changes = { quality = quality }
	for k, v in p do
		changes[k] = v
	end
	Prefs.setMany(changes)
end

-- Does the current set of switches still match the named preset? (otherwise it is "custom")
function Prefs.matchesPreset(): boolean
	local p = Prefs.PRESETS[values.quality]
	if not p then
		return false
	end
	for k, v in p do
		if values[k] ~= v then
			return false
		end
	end
	return true
end

-- Loads the saved settings (called when a server snapshot arrives and once at start).
function Prefs.sync()
	local saved = State.data and State.data.settings
	if type(saved) ~= "table" then
		return
	end
	local changed = {}
	for key, default in Prefs.DEFAULTS do
		if dirty[key] == nil then
			local v = saved[key]
			if v == nil or type(v) ~= type(default) then
				v = default
			end
			v = clamp(key, v)
			if values[key] ~= v then
				values[key] = v
				changed[key] = true
			end
		end
	end
	if next(changed) then
		Prefs.changed:Fire(changed)
	end
end

function Prefs.init()
	State.changed:Connect(function()
		Prefs.sync()
	end)
	Prefs.sync()
end

return Prefs
