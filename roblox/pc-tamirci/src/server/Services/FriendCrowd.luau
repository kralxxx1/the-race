-- FriendCrowd: the people in a player's city are that player's own Roblox friends. When a player
-- joins, their friend list is fetched, shuffled, and a handful of friends' real avatars are built
-- one after another in the background (the first few within seconds; nobody waits for them). Every
-- customer, clerk and staff member that NpcService spawns for that player is then a copy of one of
-- those avatars, named with the friend's display name. A player with no friends (or when Roblox
-- cannot be reached) simply gets the plain people NpcService makes without them.
--
-- (Street pedestrians are the client's own business: each client builds its own friends the same
-- way, see client/Controllers/FriendCrowd.)

local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Friends = require(Shared.Util.Friends)

local FriendCrowd = {}

export type Entry = { id: number, name: string, display: string, template: Model }

local pools: { [Player]: { Entry } } = {}
local loading: { [Player]: boolean } = {}
local cursor: { [Player]: number } = {}
local cache: { [number]: Entry } = {} -- every friend built so far, by user id (two players who are friends of the same person share them)
local folder: Folder

local function templates(): Folder
	if not folder then
		folder = ServerStorage:FindFirstChild("FriendTemplates") :: Folder?
		if not folder then
			folder = Instance.new("Folder")
			folder.Name = "FriendTemplates"
			folder.Parent = ServerStorage
		end
	end
	return folder
end

-- Builds the pool for `player` in the background. Safe to call twice.
function FriendCrowd.load(player: Player)
	if pools[player] or loading[player] or not Config.FriendNpcs then
		return
	end
	loading[player] = true
	pools[player] = {}
	task.spawn(function()
		local list = Friends.provider.list(player.UserId, Friends.MAX_LIST)
		local order = Friends.shuffle(list, Random.new(player.UserId + os.time()))
		local pool = pools[player]
		for _, f in order do
			if not player.Parent or pools[player] ~= pool then
				break
			end
			if #pool >= Config.FriendsPerOwner then
				break
			end
			local entry = cache[f.id]
			if not entry then
				local model = Friends.provider.avatar(f.id)
				local prepared = model and Friends.prepare(model, f)
				if prepared then
					prepared.Parent = templates()
					entry = { id = f.id, name = f.name, display = f.display, template = prepared }
					cache[f.id] = entry
				end
				-- (one at a time, and gently: each avatar is a round trip to Roblox)
				task.wait(0.35)
			end
			if entry then
				table.insert(pool, entry)
			end
		end
		loading[player] = nil
	end)
end

-- How many friends' avatars are ready for this player.
function FriendCrowd.count(player: Player?): number
	local pool = player and pools[player]
	return if pool then #pool else 0
end

-- Somebody for the player's city: the next friend in turn (a random place to start, so two shops
-- opened together do not show the same faces in the same order), or the one the seed picks
-- (a staff member always looks like the same friend). With no player (a clerk in a public shop) it
-- is a friend of whichever player has any. nil when nobody has a friend ready.
function FriendCrowd.pick(player: Player?, rng: Random?, seed: number?, id: number?): Entry?
	local pool = player and pools[player]
	if not pool or #pool == 0 then
		pool = nil
		for _, p in Players:GetPlayers() do
			local other = pools[p]
			if other and #other > 0 and (pool == nil or (rng or Random.new()):NextNumber() < 0.5) then
				pool = other
			end
		end
	end
	if not pool or #pool == 0 then
		return nil
	end
	if id and cache[id] then
		return cache[id]
	end
	if seed then
		return pool[seed % #pool + 1]
	end
	local key = player or Players:GetPlayers()[1]
	local at = (cursor[key] or (rng or Random.new()):NextInteger(0, #pool - 1)) % #pool + 1
	cursor[key] = at
	return pool[at]
end

-- Test seam: puts ready-made entries in a player's pool (no Roblox calls).
function FriendCrowd._fill(player: Player, entries: { Entry })
	pools[player] = entries
	loading[player] = nil
end

function FriendCrowd.init() end

function FriendCrowd.start()
	Players.PlayerAdded:Connect(function(player)
		FriendCrowd.load(player)
	end)
	for _, p in Players:GetPlayers() do
		FriendCrowd.load(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		pools[player] = nil
		loading[player] = nil
		cursor[player] = nil
	end)
end

return FriendCrowd
