-- FriendCrowd (client): the people on the streets -- the pedestrians and the drivers of the traffic --
-- are this player's own Roblox friends. The friend list is fetched, shuffled, and up to
-- Config.FriendsStreet of the friends' real avatars are built one after another in the background
-- (a client only builds its own: nothing is replicated). Traffic takes a copy of one of them every
-- time it needs a person; until the first is ready, or for a player without friends, it uses the
-- plain people the server publishes.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Friends = require(Shared.Util.Friends)

local FriendCrowd = {}

local list: { Model } = {}
local names: { string } = {}
local started = false

-- The friends' avatars ready so far (templates: copy them, don't use them).
function FriendCrowd.templates(): { Model }
	return list
end

function FriendCrowd.count(): number
	return #list
end

function FriendCrowd.names(): { string }
	return names
end

-- Test seam: ready-made templates.
function FriendCrowd._set(models: { Model })
	list = models
	names = {}
	for _, m in models do
		table.insert(names, m.Name)
	end
end

function FriendCrowd.init()
	if started or not Config.FriendNpcs then
		return
	end
	started = true
	local player = Players.LocalPlayer
	if not player then
		return
	end
	local home = Instance.new("Folder")
	home.Name = "FriendAvatars"
	home.Parent = ReplicatedStorage
	task.spawn(function()
		-- (let the world and the first frames load before asking Roblox for anything)
		task.wait(4)
		local friends = Friends.provider.list(player.UserId, Friends.MAX_LIST)
		for _, f in Friends.shuffle(friends, Random.new(player.UserId + os.time())) do
			if #list >= Config.FriendsStreet then
				break
			end
			local model = Friends.provider.avatar(f.id)
			local prepared = model and Friends.prepare(model, f)
			if prepared then
				prepared.Parent = home
				table.insert(list, prepared)
				table.insert(names, f.display)
			end
			task.wait(0.4)
		end
	end)
end

return FriendCrowd
