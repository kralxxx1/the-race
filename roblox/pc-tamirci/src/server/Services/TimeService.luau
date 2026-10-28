-- TimeService: the day/night cycle, the weather and the in-game calendar.
-- One day lasts Config.DayLengthMinutes real minutes; nights pass faster. Wages are paid at dawn.

local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Signal = require(Shared.Util.Signal)

local TimeService = {}
TimeService.newDay = Signal.new() -- (day)

local rng = Random.new()

local function isNight(t: number): boolean
	return t >= Config.NightStart or t < Config.NightEnd
end

function TimeService.init()
	Lighting.ClockTime = 9.5
	Workspace:SetAttribute("Day", 1)
	Workspace:SetAttribute("Raining", false)
end

function TimeService.start()
	-- clock
	task.spawn(function()
		local hoursPerSecond = 24 / (Config.DayLengthMinutes * 60)
		local last = os.clock()
		while true do
			task.wait(0.25)
			local now = os.clock()
			local dt = now - last
			last = now
			local t = Lighting.ClockTime
			local speed = if isNight(t) then Config.NightSpeed else 1
			local nt = t + dt * hoursPerSecond * speed
			if t < Config.NightEnd and nt >= Config.NightEnd then
				local day = (Workspace:GetAttribute("Day") or 1) + 1
				Workspace:SetAttribute("Day", day)
				TimeService.newDay:Fire(day)
			end
			Lighting.ClockTime = nt % 24
		end
	end)
	-- weather: occasional showers, rarely at night
	task.spawn(function()
		while true do
			task.wait(rng:NextInteger(240, 600))
			if rng:NextNumber() < 0.35 then
				Workspace:SetAttribute("Raining", true)
				task.wait(rng:NextInteger(90, 240))
				Workspace:SetAttribute("Raining", false)
			end
		end
	end)
end

function TimeService.isNight(): boolean
	return isNight(Lighting.ClockTime)
end

return TimeService
