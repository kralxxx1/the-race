-- Buffs: the short bonuses the city's activities give (see Data/Activities): a workout makes the bench
-- work faster for a while, a coffee does too, a meal makes customers more patient and tip more, a
-- film or a book means more experience. They are kept per player for the session (they are minutes
-- long) and the services that care just ask what is on: RepairService.workSpeed, the customers'
-- patience and tips, DataService.addXp. Nothing else here: no dependencies, so any service can use it.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Activities = require(Shared.Data.Activities)

local Buffs = {}

local active: { [Player]: { [string]: number } } = {}

-- The clock the buffs run on (seconds). Tests move it.
Buffs.clock = function(): number
	return os.clock()
end

-- Puts a buff on (or starts it again): lasts `minutes` (the buff's own length by default).
function Buffs.add(player: Player, id: string, minutes: number?)
	local b = Activities.buffs[id]
	if not b then
		return
	end
	local mine = active[player]
	if not mine then
		mine = {}
		active[player] = mine
	end
	mine[id] = Buffs.clock() + (minutes or b.minutes) * 60
end

-- { speed, tips, patience, xp } of everything that is on right now.
function Buffs.effects(player: Player): { speed: number, tips: number, patience: number, xp: number }
	return Activities.effects(active[player], Buffs.clock())
end

-- What is on, for the screen: { { id, left (seconds) } } longest first.
function Buffs.list(player: Player): { { id: string, left: number } }
	local out = {}
	local now = Buffs.clock()
	for id, expires in active[player] or {} do
		if expires > now then
			table.insert(out, { id = id, left = math.floor(expires - now) })
		end
	end
	table.sort(out, function(a, b)
		return a.left > b.left
	end)
	return out
end

function Buffs.clear(player: Player)
	active[player] = nil
end

Players.PlayerRemoving:Connect(function(player)
	active[player] = nil
end)

return Buffs
