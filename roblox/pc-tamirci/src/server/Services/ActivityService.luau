-- ActivityService: the city's venues come alive. Every station the world builders put down (a prompt
-- on a treadmill, a cinema seat, a coffee machine, a park bench... see Models/Venues and Data/Activities)
-- is run here: the player pays the price, is busy for a few seconds (frozen where they stand, or
-- sitting down in the seat), a progress bar runs on their screen, and then they get a little
-- experience, maybe reputation, and a buff (see Buffs): faster bench work, bigger tips, more patient
-- customers, more experience. The same venues are populated with the player's friends doing what the
-- place is for: jogging on the treadmills, lifting, sitting in the cinema, eating, reading.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Activities = require(Shared.Data.Activities)
local DataService = require(script.Parent.DataService)
local NpcService = require(script.Parent.NpcService)
local FriendCrowd = require(script.Parent.FriendCrowd)
local Buffs = require(script.Parent.Buffs)
local Signal = require(Shared.Util.Signal)

local ActivityService = {}
ActivityService.finished = Signal.new() -- (player, activity) when somebody has done one

local busy: { [Player]: { id: string, t0: number, seconds: number, walk: number?, jump: number?, jumpHeight: number? } } = {}
local rng = Random.new()

-- how far from a station somebody may start it
local REACH = 16
-- patrons: spawned near players, removed when everybody is far away
local PATRON_NEAR, PATRON_FAR = 150, 260
local PATRON_MAX = 70
local patrons: { [BasePart]: Model } = {}

local function rootOf(player: Player): BasePart?
	local char = player.Character
	return char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function humOf(player: Player): Humanoid?
	local char = player.Character
	return char and char:FindFirstChildOfClass("Humanoid")
end

local function pushBuffs(player: Player)
	Net.push(player, "buffs", { list = Buffs.list(player), effects = Buffs.effects(player) })
end
ActivityService.pushBuffs = pushBuffs

local function release(player: Player)
	local b = busy[player]
	if not b then
		return
	end
	busy[player] = nil
	local hum = humOf(player)
	if hum then
		hum.WalkSpeed = b.walk or 16
		if hum.UseJumpPower then
			hum.JumpPower = b.jump or 50
		else
			hum.JumpHeight = b.jumpHeight or 7.2
		end
		if hum.SeatPart then
			hum.Sit = false
		end
	end
end

-- Plays one of the shared emote animations on the player's character.
local function emote(player: Player, name: string?)
	local hum = humOf(player)
	local list = name and NpcService.Emotes[name]
	if not hum or not list then
		return
	end
	local animator = hum:FindFirstChildOfClass("Animator")
	if not animator then
		return
	end
	local a = Instance.new("Animation")
	a.AnimationId = list[rng:NextInteger(1, #list)]
	local ok, track = pcall(function()
		return animator:LoadAnimation(a)
	end)
	if ok and track then
		track.Looped = false
		pcall(function()
			track:Play()
		end)
		task.delay(math.min(track.Length > 0 and track.Length or 3, 5), function()
			pcall(function()
				track:Stop()
			end)
		end)
	end
end

local function finish(player: Player, a)
	release(player)
	if not player.Parent then
		return
	end
	local b = Activities.buffs[a.buff]
	if a.buff then
		Buffs.add(player, a.buff)
	end
	if a.xp and a.xp > 0 then
		DataService.addXp(player, a.xp, true)
	end
	if a.rep and a.rep > 0 then
		DataService.rep(player, a.rep)
	end
	Net.push(player, "activity.done", {
		id = a.id,
		icon = a.icon,
		name = a.name,
		buff = a.buff,
		buffIcon = b and b.icon,
		buffName = b and b.name,
		minutes = b and b.minutes,
		xp = a.xp,
		rep = a.rep,
	})
	pushBuffs(player)
	ActivityService.finished:Fire(player, a)
end

-- Starts activity `id` for the player at a station (an anchor part); returns ok, reason.
function ActivityService.begin(player: Player, id: string, station: BasePart?): (boolean, string?)
	local a = Activities.get(id)
	if not a then
		return false, "unknown"
	end
	if busy[player] then
		return false, "busy"
	end
	local hum, root = humOf(player), rootOf(player)
	if not hum or not root then
		return false, "no_character"
	end
	local okHealth, health = pcall(function()
		return hum.Health
	end)
	if okHealth and health <= 0 then
		return false, "no_character"
	end
	if station and (root.Position - station.Position).Magnitude > REACH then
		return false, "far"
	end
	if a.cost > 0 and not DataService.money(player, -a.cost, "activity") then
		Net.push(player, "toast", { key = "activity_poor", vars = { cost = a.cost } })
		return false, "money"
	end
	busy[player] = { id = id, t0 = os.clock(), seconds = a.seconds, walk = hum.WalkSpeed, jump = hum.JumpPower, jumpHeight = hum.JumpHeight }
	-- sitting in the seat for the seated ones, otherwise standing still facing the thing
	local seatName = station and station:GetAttribute("SeatName")
	local seat = if type(seatName) == "string" and station then station.Parent and station.Parent:FindFirstChild(seatName, true) else nil
	hum.WalkSpeed = 0
	if hum.UseJumpPower then
		hum.JumpPower = 0
	else
		hum.JumpHeight = 0
	end
	if seat and seat:IsA("Seat") and not seat.Occupant then
		pcall(function()
			seat:Sit(hum)
		end)
	elseif station then
		pcall(function()
			local here = root.Position
			root.CFrame = CFrame.lookAt(here, Vector3.new(station.Position.X, here.Y, station.Position.Z))
		end)
	end
	emote(player, a.emote)
	Net.push(player, "activity.start", { id = id, icon = a.icon, name = a.name, seconds = a.seconds })
	task.delay(a.seconds, function()
		local b = busy[player]
		if b and b.id == id then
			finish(player, a)
		end
	end)
	return true
end

-- Whether the player is in the middle of one.
function ActivityService.busy(player: Player): boolean
	return busy[player] ~= nil
end

----------------------------------------------------------------------------------------------------
-- The people of the venues
----------------------------------------------------------------------------------------------------
local function nearestPlayer(pos: Vector3): (Player?, number)
	local best, bestD = nil, math.huge
	for _, p in Players:GetPlayers() do
		local r = rootOf(p)
		if r then
			local d = (r.Position - pos).Magnitude
			if d < bestD then
				best, bestD = p, d
			end
		end
	end
	return best, bestD
end

local function populate(spotPart: BasePart, owner: Player)
	local role = spotPart:GetAttribute("Role")
	local pose = spotPart:GetAttribute("Pose")
	local anim = spotPart:GetAttribute("Anim") or "idle"
	local look = if role then "shopkeeper" else "casual"
	local model = NpcService.spawn({ look = look, gender = if rng:NextNumber() < 0.5 then "m" else "f", cf = spotPart.CFrame + Vector3.new(0, 4, 0), owner = owner, speed = 10, friend = true })
	model:SetAttribute("Patron", true)
	local fname = model:GetAttribute("FriendName")
	NpcService.tag(model, if role then ((fname or "") .. " • " .. role) else (fname or "Visitor"))
	if spotPart:IsA("Seat") then
		NpcService.sit(model, spotPart, true)
		spotPart:SetAttribute("Taken", true)
		-- (a friend sits there: that seat is not on offer)
		local station = spotPart.Parent and spotPart.Parent:FindFirstChildWhichIsA("ProximityPrompt", true)
		if station then
			station.Enabled = false
		end
	else
		NpcService.stand(model, spotPart.CFrame)
		NpcService.play(model, anim)
	end
	if type(pose) == "string" and pose ~= "" then
		model:SetAttribute("Doing", pose)
	end
	patrons[spotPart] = model
end

local function clear(spotPart: BasePart)
	local m = patrons[spotPart]
	patrons[spotPart] = nil
	if m then
		pcall(function()
			NpcService.despawn(m)
		end)
	end
	if spotPart:IsA("Seat") then
		spotPart:SetAttribute("Taken", nil)
		local station = spotPart.Parent and spotPart.Parent:FindFirstChildWhichIsA("ProximityPrompt", true)
		if station then
			station.Enabled = true
		end
	end
end

-- Puts patrons where players are and takes them away where nobody is. A few per step so the
-- server never stalls; `step` is public so the tests can run it.
function ActivityService.step(maxSpawns: number?)
	local spawned = 0
	local count = 0
	for _ in patrons do
		count += 1
	end
	for _, spotPart in CollectionService:GetTagged("PatronSpot") do
		if spotPart:IsA("BasePart") and spotPart:IsDescendantOf(game) then
			local player, dist = nearestPlayer(spotPart.Position)
			local have = patrons[spotPart]
			if have and not NpcService.alive(have) then
				patrons[spotPart] = nil
				have = nil
			end
			-- (somebody put there before the friends were ready is replaced by a friend now)
			if have and player and have:GetAttribute("Friend") == nil and FriendCrowd.count(player) > 0 and dist < PATRON_NEAR then
				clear(spotPart)
				have = nil
			end
			if player and dist < PATRON_NEAR and not have and count + spawned < PATRON_MAX and spawned < (maxSpawns or 2) then
				local ok, err = pcall(populate, spotPart, player)
				if ok then
					spawned += 1
				else
					warn("[ActivityService] a patron could not be placed: " .. tostring(err))
				end
			elseif have and (not player or dist > PATRON_FAR) then
				clear(spotPart)
			end
		elseif patrons[spotPart] then
			clear(spotPart)
		end
	end
	return spawned
end

function ActivityService.patronCount(): number
	local n = 0
	for _ in patrons do
		n += 1
	end
	return n
end

function ActivityService.init() end

function ActivityService.start()
	ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "ActivityPrompt" then
			return
		end
		local station = prompt.Parent
		local id = station and station:GetAttribute("Activity")
		if type(id) ~= "string" or not station or not station:IsA("BasePart") then
			return
		end
		ActivityService.begin(player, id, station)
	end)
	Players.PlayerAdded:Connect(function(player)
		task.delay(3, function()
			if player.Parent then
				pushBuffs(player)
			end
		end)
	end)
	Players.PlayerRemoving:Connect(function(player)
		busy[player] = nil
	end)
	-- the buffs on screen count down: refreshed every few seconds (and when they change)
	task.spawn(function()
		while true do
			task.wait(5)
			for _, player in Players:GetPlayers() do
				if #Buffs.list(player) > 0 then
					pushBuffs(player)
				end
			end
		end
	end)
	task.spawn(function()
		while true do
			task.wait(2.5)
			local ok, err = pcall(ActivityService.step)
			if not ok then
				warn("[ActivityService] " .. tostring(err))
			end
		end
	end)
end

return ActivityService
