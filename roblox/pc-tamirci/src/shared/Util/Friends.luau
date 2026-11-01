-- Friends: the people of the city are the player's own Roblox friends. The friend list and each
-- friend's avatar (the avatar they wear in every other game) come from Roblox itself, so nothing
-- here is modelled by us: a person in the street, a customer or a clerk is a friend's real avatar,
-- dressed the way the friend dresses, and the name over their head is the friend's display name.
--
-- The calls yield, so callers run them in their own thread; every call is wrapped (a friend whose
-- avatar cannot be fetched is skipped, a failing friend list gives an empty one). `Friends.provider`
-- can be replaced (the headless tests do that).

local Players = game:GetService("Players")

export type Friend = { id: number, name: string, display: string }
export type Provider = {
	list: (userId: number, max: number) -> { Friend },
	avatar: (userId: number) -> Model?,
}

local Friends = {}
Friends.MAX_LIST = 200

local default = {} :: Provider

-- The friends of a user (up to `max`), as { id, name, display }.
function default.list(userId: number, max: number): { Friend }
	local out: { Friend } = {}
	local ok, pages = pcall(function()
		return Players:GetFriendsAsync(userId)
	end)
	if not ok or not pages then
		return out
	end
	for _ = 1, 20 do
		local okPage, page = pcall(function()
			return pages:GetCurrentPage()
		end)
		if not okPage or type(page) ~= "table" then
			break
		end
		for _, f in page do
			if type(f) == "table" and type(f.Id) == "number" and f.Id > 0 then
				table.insert(out, {
					id = f.Id,
					name = tostring(f.Username or f.Id),
					display = tostring(f.DisplayName or f.Username or f.Id),
				})
			end
		end
		if pages.IsFinished or #out >= max then
			break
		end
		if not pcall(function()
			pages:AdvanceToNextPageAsync()
		end) then
			break
		end
	end
	return out
end

-- A standing R15 model wearing that user's avatar (nil when Roblox cannot give it).
function default.avatar(userId: number): Model?
	local ok, desc = pcall(function()
		return Players:GetHumanoidDescriptionFromUserId(userId)
	end)
	if not ok or not desc then
		return nil
	end
	local okModel, model = pcall(function()
		return Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	end)
	if not okModel or not model then
		return nil
	end
	return model
end

Friends.provider = default

-- In random order (the same seed always gives the same order).
function Friends.shuffle<T>(list: { T }, rng: Random): { T }
	local out = table.clone(list)
	for i = #out, 2, -1 do
		local j = rng:NextInteger(1, i)
		out[i], out[j] = out[j], out[i]
	end
	return out
end

-- Turns a freshly built avatar into something the city can use: no Animate script, nothing
-- collides but the root, only the root answers raycasts, the nameplate off, an Animator ready, and
-- the friend's id and name on it. Returns nil (and destroys the model) when it has no rig.
function Friends.prepare(model: Model, friend: Friend): Model?
	local hum = model:FindFirstChildOfClass("Humanoid") :: Humanoid?
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not hum or not root then
		model:Destroy()
		return nil
	end
	-- (the standard Animate script, and anything else that runs: the city animates its people itself)
	for _, d in model:GetDescendants() do
		if d:IsA("LuaSourceContainer") then
			d:Destroy()
		end
	end
	model.Name = friend.display
	model.PrimaryPart = root
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.BreakJointsOnDeath = false
	if not hum:FindFirstChildOfClass("Animator") then
		Instance.new("Animator").Parent = hum
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanQuery = d == root
			d.CanTouch = false
			if d ~= root then
				d.CanCollide = false
				d.Massless = true
			end
		end
	end
	model:SetAttribute("Friend", friend.id)
	model:SetAttribute("FriendName", friend.display)
	model:SetAttribute("Avatar", true)
	-- (their own skin and clothes: the street crowd must not retint them)
	model:SetAttribute("Plain", true)
	-- how high the root sits above the feet, for clients posing copies without physics
	model:SetAttribute("Hip", hum.HipHeight + root.Size.Y / 2)
	return model
end

return Friends
