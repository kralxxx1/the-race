-- State: what the client knows about the player (the server's data snapshot, jobs, shop) with
-- change signals for the UI.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)

local State = {}
State.data = nil :: any
State.jobs = {} :: { any }
State.shop = nil :: any
State.changed = Signal.new() -- (data, previous)
State.jobsChanged = Signal.new() -- (jobs)
State.shopChanged = Signal.new()
State.levelUp = Signal.new() -- (level)

local ready = false

function State.init()
	Net.on("data", function(d)
		local prev = State.data
		State.data = d
		if prev and d.level > prev.level then
			State.levelUp:Fire(d.level)
		end
		ready = true
		State.changed:Fire(d, prev)
	end)
	Net.on("jobs", function(list)
		State.jobs = list
		State.jobsChanged:Fire(list)
	end)
	Net.on("shop", function(s)
		State.shop = s
		State.shopChanged:Fire(s)
	end)
	task.spawn(function()
		local r = Net.request("jobs.list")
		if r.ok then
			State.jobs = r.jobs
			State.jobsChanged:Fire(r.jobs)
		end
	end)
end

function State.ready(): boolean
	return ready
end

function State.waitReady()
	while not ready do
		task.wait(0.1)
	end
end

function State.money(): number
	return State.data and State.data.money or 0
end

function State.level(): number
	return State.data and State.data.level or 1
end

function State.owns(tool: string): boolean
	return tool == "hand" or (State.data ~= nil and State.data.tools[tool] == true)
end

function State.ownedTools(): { [string]: boolean }
	local t = { hand = true }
	if State.data then
		for id in State.data.tools do
			t[id] = true
		end
	end
	return t
end

function State.stock(id: string): number
	return State.data and State.data.stock[id] or 0
end

return State
